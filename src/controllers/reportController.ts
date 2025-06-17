import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { ExcelService, StockCardData } from '../services/excelService';
import path from 'path';
import ExcelJS from 'exceljs';
import fs from 'fs';

export const getDailyIssueReport = async (req: Request, res: Response): Promise<void> => {
  const { fromDate, toDate, equipmentNumber, page = 1, limit = 10 } = req.query;
  const connection = await pool.getConnection();

  try {
    if (!fromDate || !toDate) {
      throw new Error('fromDate and toDate are required parameters');
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    let countQuery = `
      SELECT COUNT(*) as total
      FROM issue_details i
      WHERE i.issue_date BETWEEN ? AND ?
      AND i.approval_status = ?
    `;

    let dataQuery = `
      SELECT 
        i.issue_slip_number,
        i.issue_date,
        i.part_number,
        i.issued_for,
        i.issued_by,
        i.issue_quantity,
        i.issue_cost,
        i.remaining_balance,
        SUBSTRING_INDEX(s.item_name, ',', 1) as item_name
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.issue_date BETWEEN ? AND ?
      AND i.approval_status = ?
    `;

    const countParams = [String(fromDate), String(toDate), "APPROVED"];
    const dataParams = [String(fromDate), String(toDate), "APPROVED"];

    if (equipmentNumber) {
      countQuery += ` AND i.issued_for = ?`;
      dataQuery += ` AND i.issued_for = ?`;
      countParams.push(String(equipmentNumber));
      dataParams.push(String(equipmentNumber));
    }

    dataQuery += ` ORDER BY i.issue_date DESC, i.issue_slip_number LIMIT ? OFFSET ?`;
    dataParams.push(String(limitNum), String(offset));

    const [totalResult] = await connection.execute<RowDataPacket[]>(countQuery, countParams);
    const [issues] = await connection.execute<RowDataPacket[]>(dataQuery, dataParams);

    const formattedIssues = issues.map(issue => ({
      ...issue,
      issued_by: JSON.parse(issue.issued_by)
    }));

    res.status(200).json({
      message: 'Daily issue report generated successfully',
      issues: formattedIssues,
      total: totalResult[0].total
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in getDailyIssueReport: ${errorMessage}`, "reportLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

export const exportDailyIssueReport = async (req: Request, res: Response): Promise<void> => {
  const { fromDate, toDate, equipmentNumber } = req.body;
  const connection = await pool.getConnection();

  try {
    if (!fromDate || !toDate) {
      throw new Error('fromDate and toDate are required parameters');
    }

    let query = `
      SELECT 
        i.issue_slip_number,
        i.issue_date,
        i.part_number,
        i.issued_for,
        i.issued_by,
        i.issue_quantity,
        i.issue_cost,
        i.remaining_balance,
        SUBSTRING_INDEX(s.item_name, ',', 1) as item_name
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.issue_date BETWEEN ? AND ?
      AND i.approval_status = ?
    `;

    const queryParams = [String(fromDate), String(toDate), "APPROVED"];

    if (equipmentNumber) {
      query += ` AND i.issued_for = ?`;
      queryParams.push(String(equipmentNumber));
    }

    query += ` ORDER BY i.issue_date DESC, i.issue_slip_number`;

    const [issues] = await connection.execute<RowDataPacket[]>(query, queryParams);

    const formattedIssues = issues.map(issue => ({
      ...issue,
      issued_by: JSON.parse(issue.issued_by)
    }));

    res.status(200).json({
      message: 'Daily issue report exported successfully',
      issues: formattedIssues
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in exportDailyIssueReport: ${errorMessage}`, "reportLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

interface StockCardRequest {
  fromDate?: string;
  toDate?: string;
  naccodes?: string[];
  generateByIssueDate: boolean;
}

interface StockMovement {
  date: Date;
  reference: string;
  type: 'issue' | 'receive';
  quantity: number;
  amount: number;
  balance_quantity: number;
  balance_amount: number;
}

function normalizeEquipmentNumbers(equipmentNumbers: string): string {
  let normalized = String(equipmentNumbers);
  normalized = normalized.replace(/\b(ge|GE)\b/g, '');
  const items = normalized.split(',').map(item => item.trim());
  const numbers: number[] = [];
  const descriptions = new Set<string>();

  for (const item of items) {
    if (/^\d+$/.test(item)) {
      numbers.push(parseInt(item, 10));
    } else {
      const cleanedItem = item.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      if (cleanedItem) {
        descriptions.add(cleanedItem.toLowerCase());
      }
    }
  }

  numbers.sort((a, b) => a - b);
  const rangeNumbers: string[] = [];
  let tempRange: string[] = [];

  for (let i = 0; i < numbers.length; i++) {
    if (i === 0 || numbers[i] === numbers[i - 1] + 1) {
      tempRange.push(numbers[i].toString());
    } else {
      if (tempRange.length > 1) {
        rangeNumbers.push(`${tempRange[0]}-${tempRange[tempRange.length - 1]}`);
      } else {
        rangeNumbers.push(tempRange[0]);
      }
      tempRange = [numbers[i].toString()];
    }
  }

  if (tempRange.length > 0) {
    if (tempRange.length > 1) {
      rangeNumbers.push(`${tempRange[0]}-${tempRange[tempRange.length - 1]}`);
    } else {
      rangeNumbers.push(tempRange[0]);
    }
  }

  return [...rangeNumbers, ...Array.from(descriptions)].join(', ').toUpperCase();
}

function processPartNumbers(partNumbers: string): { primary: string; secondary: string[] } {
  const parts = String(partNumbers).split(',').map(p => p.trim().toUpperCase());
  return {
    primary: parts[0] || '',
    secondary: parts.slice(1)
  };
}

function processItemName(itemName: string): string {
  return String(itemName).split(',')[0].trim().toUpperCase();
}

export const generateStockCardReport = async (req: Request, res: Response): Promise<void> => {
  const { fromDate, toDate, naccodes, generateByIssueDate } = req.body as StockCardRequest;
  const connection = await pool.getConnection();

  try {
    let targetNaccodes: string[] = [];

    if (generateByIssueDate) {
      if (!fromDate || !toDate) {
        throw new Error('fromDate and toDate are required when generateByIssueDate is true');
      }

      const [uniqueNaccodes] = await connection.execute<RowDataPacket[]>(`
        SELECT DISTINCT nac_code 
        FROM issue_details 
        WHERE issue_date BETWEEN ? AND ?
        AND approval_status = ?
      `, [fromDate, toDate, "APPROVED"]);

      targetNaccodes = uniqueNaccodes.map(row => row.nac_code);
    } else {
      if (!naccodes || naccodes.length === 0) {
        throw new Error('naccodes are required when generateByIssueDate is false');
      }
      targetNaccodes = naccodes;
    }

    const searchPattern = `%${targetNaccodes[0].replace(/\s+/g, '%')}%`;
    const [verifyResults] = await connection.execute<RowDataPacket[]>(`
      SELECT nac_code, LENGTH(nac_code) as code_length, HEX(nac_code) as code_hex
      FROM stock_details 
      WHERE nac_code LIKE ?
    `, [searchPattern]);

    const [stockDetails] = await connection.execute<StockCardData[]>(`
      SELECT 
        s.nac_code,
        s.item_name,
        s.part_numbers as part_number,
        s.applicable_equipments as equipment_number,
        s.location,
        s.card_number,
        s.open_quantity,
        s.open_amount
      FROM stock_details s
      WHERE s.nac_code LIKE ?
    `, [searchPattern]);

    if (!stockDetails || stockDetails.length === 0) {
      throw new Error('No stock details found for the specified NAC codes');
    }

    for (const stock of stockDetails) {
      stock.equipment_number = normalizeEquipmentNumbers(stock.equipment_number);
      const { primary, secondary } = processPartNumbers(stock.part_number);
      (stock as any).primary_part_number = primary;
      (stock as any).secondary_part_numbers = secondary;
      stock.item_name = processItemName(stock.item_name);

      let openingBalanceQty = stock.open_quantity;
      let openingBalanceAmt = stock.open_amount;
      let openingBalanceDate: Date;

      if (fromDate && !generateByIssueDate) {
        openingBalanceDate = new Date(fromDate);
        openingBalanceDate.setDate(openingBalanceDate.getDate() - 1);

        const [preDateReceives] = await connection.execute<RowDataPacket[]>(`
          SELECT 
            COALESCE(SUM(rd.received_quantity), 0) as total_quantity,
            COALESCE(SUM(rrp.total_amount), 0) as total_amount
          FROM receive_details rd
          JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
          WHERE rd.nac_code = ?
          AND rd.approval_status = 'APPROVED'
          AND DATE(rd.receive_date) < DATE(?)
        `, [stock.nac_code, fromDate]);

        const [preDateIssues] = await connection.execute<RowDataPacket[]>(`
          SELECT 
            COALESCE(SUM(issue_quantity), 0) as total_quantity,
            COALESCE(SUM(issue_cost), 0) as total_amount
          FROM issue_details
          WHERE nac_code = ?
          AND approval_status = 'APPROVED'
          AND DATE(issue_date) < DATE(?)
        `, [stock.nac_code, fromDate]);

        const totalReceiveQty = Number(preDateReceives[0]?.total_quantity) || 0;
        const totalReceiveAmt = Number(preDateReceives[0]?.total_amount) || 0;
        const totalIssueQty = Number(preDateIssues[0]?.total_quantity) || 0;
        const totalIssueAmt = Number(preDateIssues[0]?.total_amount) || 0;

        openingBalanceQty = (typeof stock.open_quantity === 'string'
          ? Number(stock.open_quantity) : Number(stock.open_quantity) || 0)
          + totalReceiveQty - totalIssueQty;
        openingBalanceAmt = (typeof stock.open_amount === 'string'
          ? parseFloat(stock.open_amount) : stock.open_amount || 0)
          + totalReceiveAmt - totalIssueAmt;
      } else {
        openingBalanceDate = new Date('2025-07-17');
      }

      stock.open_quantity = openingBalanceQty;
      stock.open_amount = openingBalanceAmt;

      const [issueRecords] = await connection.execute<RowDataPacket[]>(`
        SELECT 
          DATE_FORMAT(issue_date, '%Y-%m-%d') as date,
          issue_slip_number as reference,
          issue_quantity as quantity,
          issue_cost as amount,
          issued_for
        FROM issue_details
        WHERE nac_code = ?
        AND approval_status = 'APPROVED'
        ${!generateByIssueDate && fromDate && toDate ? 'AND issue_date BETWEEN ? AND ?' : ''}
        ORDER BY issue_date ASC
      `, [stock.nac_code, ...(!generateByIssueDate && fromDate && toDate ? [fromDate, toDate] : [])]);

      const [receiveRecords] = await connection.execute<RowDataPacket[]>(`
        SELECT 
          DATE_FORMAT(rd.receive_date, '%Y-%m-%d') as date,
          rd.rrp_fk,
          rd.received_quantity as quantity,
          rd.unit,
          rrp.total_amount,
          rrp.rrp_number as reference
        FROM receive_details rd
        JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
        WHERE rd.nac_code = ?
        AND rd.approval_status = 'APPROVED'
        ${!generateByIssueDate && fromDate && toDate ? 'AND rd.receive_date BETWEEN ? AND ?' : ''}
        ORDER BY rd.receive_date ASC
      `, [stock.nac_code, ...(!generateByIssueDate && fromDate && toDate ? [fromDate, toDate] : [])]);

      let movements: StockMovement[] = [
        ...issueRecords.map(record => ({
          date: new Date(record.date + 'T00:00:00Z'),
          reference: record.reference,
          type: 'issue' as const,
          quantity: record.quantity, 
          amount: record.amount, 
          balance_quantity: 0,
          balance_amount: 0,
          equipment_number: record.issued_for 
        })),
        ...receiveRecords.map(record => ({
          date: new Date(record.date + 'T00:00:00Z'),
          reference: record.reference,
          type: 'receive' as const,
          quantity: record.quantity,
          amount: record.total_amount,
          balance_quantity: 0, 
          balance_amount: 0
        }))
      ];

      if (stock.equipment_number.toLowerCase().includes('consumable')) {
        const aggregatedMovements: StockMovement[] = [];
        const dateMap = new Map<string, StockMovement>();

        movements.filter(m => m.type === 'receive').forEach(movement => {
          aggregatedMovements.push(movement);
        });

        movements.filter(m => m.type === 'issue').forEach(movement => {
          const dateKey = movement.date.toISOString().split('T')[0];
          if (dateMap.has(dateKey)) {
            const existing = dateMap.get(dateKey)!;
            existing.quantity += movement.quantity;
            existing.amount += movement.amount;
            existing.reference = existing.reference || movement.reference;
          } else {
            dateMap.set(dateKey, { ...movement });
          }
        });

        aggregatedMovements.push(...Array.from(dateMap.values()));
        movements = aggregatedMovements.sort((a, b) => a.date.getTime() - b.date.getTime());
      }

      let balanceQty = openingBalanceQty;
      let balanceAmt = openingBalanceAmt;

      movements.forEach(movement => {
        if (movement.type === 'receive') {
          balanceQty += movement.quantity;
          balanceAmt += movement.amount;
        } else {
          balanceQty -= movement.quantity;
          balanceAmt -= movement.amount;
        }
        movement.balance_quantity = balanceQty;
        movement.balance_amount = balanceAmt;
      });

      (stock as any).movements = movements;
      (stock as any).openingBalanceDate = openingBalanceDate;
    }

    const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
    const excelBuffer = await ExcelService.generateStockCardExcel(stockDetails, templatePath);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=stock_card_report.xlsx');

    res.send(excelBuffer);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in generateStockCardReport: ${errorMessage}`, "reportLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

export const checkFlightCount = async (req: Request, res: Response): Promise<void> => {
  const { start_date, end_date } = req.query;
  const connection = await pool.getConnection();

  try {
    const [result] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count 
       FROM fuel_records 
       WHERE fuel_type = 'diesel'
       AND created_datetime BETWEEN ? AND ?
       AND number_of_flights IS NOT NULL`,
      [start_date, end_date]
    );

    res.status(200).json({
      has_flight_count: result[0].count > 0
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error checking flight count: ${errorMessage}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while checking flight count'
    });
  } finally {
    connection.release();
  }
};

export const generateWeeklyDieselReport = async (req: Request, res: Response): Promise<void> => {
  const { start_date, end_date, flight_count } = req.query;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Fetch valid equipment list from app_config
    const [configResult] = await connection.query<RowDataPacket[]>(
      'SELECT config_value FROM app_config WHERE config_name = ? AND config_type = "fuel"',
      ['valid_equipment_list_diesel']
    );

    if (configResult.length === 0) {
      throw new Error('Valid equipment list configuration not found');
    }

    // Parse the comma-separated equipment list
    const equipmentList = configResult[0].config_value
      .replace(/\r\n/g, '')  // Remove newlines
      .split(',')
      .map((item: string) => item.trim())
      .filter((item: string) => item && !item.includes(' ')); // Remove empty items and items with spaces

    // If flight_count is provided, update all records in the date range
    if (flight_count) {
      await connection.query(
        `UPDATE fuel_records 
         SET number_of_flights = ? 
         WHERE fuel_type = 'diesel'
         AND created_datetime BETWEEN ? AND ?`,
        [flight_count, start_date, end_date]
      );
    }

    // Fetch the actual data from database
    const [results] = await connection.query<RowDataPacket[]>(
      `SELECT 
         SUM(i.issue_quantity * f.fuel_price) as total_cost,
         SUM(i.issue_quantity) as total_quantity,
         COUNT(DISTINCT f.issue_fk) as total_issues
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fuel_type = 'diesel' 
       AND f.created_datetime BETWEEN ? AND ?`,
      [start_date, end_date]
    );

    const totals = results[0] || { total_cost: 0, total_quantity: 0, total_issues: 0 };
    
    await connection.commit();

    const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
    
    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate a unique filename
    const filename = `Diesel_Weekly_Report_${start_date}_to_${end_date}.xlsx`;
    const outputPath = path.join(tempDir, filename);

    try {
      // Use xlsx-populate to preserve charts
      const XlsxPopulate = require('xlsx-populate');
      
      // Load template with charts preserved
      const workbook = await XlsxPopulate.fromFileAsync(templatePath);
      const sheet = workbook.sheet('Diesel Weekly Template');

      // Process equipment data starting from B11
      if (equipmentList.length > 0) {
        const startRow = 11;
        const columnsToCopy = 10; // A–J
        const lastRow = sheet.usedRange().endCell().rowNumber();
      
        // First, insert all equipment numbers
        equipmentList.forEach((equipment: string, index: number) => {
          const currentRow = startRow + index;
      
          if (index > 0) {
            // Shift rows down
            for (let r = lastRow + index - 1; r >= currentRow; r--) {
              for (let col = 1; col <= columnsToCopy; col++) {
                const fromCell = sheet.cell(r, col);
                const toCell = sheet.cell(r + 1, col);
      
                toCell.value(fromCell.value());
                const formula = fromCell.formula();
                if (formula) toCell.formula(formula);
      
                const styleProps = [
                  "bold", "italic", "underline", "strikethrough", "fontColor",
                  "fill", "border", "horizontalAlignment", "verticalAlignment",
                  "wrapText", "fontSize", "fontFamily", "numberFormat"
                ];
      
                styleProps.forEach((prop) => {
                  try {
                    const value = fromCell.style(prop);
                    if (value !== undefined) {
                      toCell.style(prop, value);
                    }
                  } catch (err:any) {
                    console.warn(`Skip style "${prop}" from row ${r}, col ${col}: ${err.message}`);
                  }
                });
              }
            }
      
            // Clone styles and formulas from row 11 to currentRow
            for (let col = 1; col <= columnsToCopy; col++) {
              const templateCell = sheet.cell(startRow, col);
              const newCell = sheet.cell(currentRow, col);
      
              // Apply individual styles
              const styleProps = [
                "bold", "italic", "underline", "strikethrough", "fontColor",
                "fill", "border", "horizontalAlignment", "verticalAlignment",
                "wrapText", "fontSize", "fontFamily", "numberFormat"
              ];
      
              styleProps.forEach((prop) => {
                try {
                  const value = templateCell.style(prop);
                  if (value !== undefined) {
                    newCell.style(prop, value);
                  }
                } catch (err:any) {
                  console.warn(`Skip style "${prop}" at col ${col}: ${err.message}`);
                }
              });
      
              const formula = templateCell.formula();
              if (formula && col !== 2) {
                newCell.formula(formula);
              } else if (col !== 2) {
                newCell.value(templateCell.value());
              }
            }
          }
      
          // Insert equipment name
          sheet.cell(currentRow, 2).value(equipment);
        });

        // Now fetch and insert daily data for each equipment
        for (let i = 0; i < equipmentList.length; i++) {
          const equipment = equipmentList[i];
          const row = startRow + i;

          // Get daily data for this equipment
          const [dailyData] = await connection.query<RowDataPacket[]>(
            `SELECT 
              DATE(f.created_datetime) as date,
              DAYNAME(f.created_datetime) as day_name,
              SUM(i.issue_quantity) as total_quantity,
              f.fuel_price,
              MAX(f.kilometers) as latest_kilometers
            FROM fuel_records f
            JOIN issue_details i ON f.issue_fk = i.id
            WHERE f.fuel_type = 'diesel'
            AND i.issued_for = ?
            AND f.created_datetime BETWEEN ? AND ?
            GROUP BY DATE(f.created_datetime), f.fuel_price
            ORDER BY DATE(f.created_datetime)`,
            [equipment, start_date, end_date]
          );

          // Insert data for each day
          const dayColumns = ['C', 'E', 'G', 'I', 'K', 'M', 'O'];
          dailyData.forEach((day, index) => {
            if (index < 7) { // Only process first 7 days
              const col = dayColumns[index];
              
              // Insert day name and date in row 7
              sheet.cell(7, col).value(`${day.day_name}(${day.date})`);
              
              // Insert fuel price in row 9
              sheet.cell(9, col).value(day.fuel_price);
              
              // Insert quantity and kilometers in equipment row
              sheet.cell(row, col).value(day.total_quantity);
              sheet.cell(row, col + 1).value(day.latest_kilometers);
            }
          });
        }
      }

      // Save the final file with charts preserved
      await workbook.toFileAsync(outputPath);
      
      console.log('Report generated successfully with charts preserved!');
      
    } catch (error) {
      console.log('Error generating report:', error);
      // Fallback to simple copy method
      fs.copyFileSync(templatePath, outputPath);
    }

    // Send the file
    res.download(outputPath, filename, (err) => {
      if (err) {
        logEvents(`Error sending file: ${err.message}`, "fuelLog.log");
      }
      // Clean up the temporary file
      fs.unlink(outputPath, (unlinkErr) => {
        if (unlinkErr) {
          logEvents(`Error deleting temporary file: ${unlinkErr.message}`, "fuelLog.log");
        }
      });
    });

  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error generating weekly diesel report: ${errorMessage}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while generating report'
    });
  } finally {
    connection.release();
  }
};