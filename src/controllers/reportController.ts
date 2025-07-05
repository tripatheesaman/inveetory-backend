import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { ExcelService, StockCardData } from '../services/excelService';
import path from 'path';
import fs from 'fs';
import { normalizeEquipmentNumbers, processPartNumbers, processItemName } from '../utils/utils';
const BS = require('bikram-sambat-js');

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

      let totalReceiveQty = 0;
      let totalReceiveAmt = 0;
      if (fromDate && !generateByIssueDate) {
        openingBalanceDate = new Date(String(fromDate));
        openingBalanceDate.setDate(openingBalanceDate.getDate() - 1);

        if (stock.nac_code === 'GT 00000') {
          // Petrol: get receives from transaction_details
          const [preDateReceives] = await connection.execute<RowDataPacket[]>(
            `SELECT 
              COALESCE(SUM(transaction_quantity), 0) as total_quantity
            FROM transaction_details
            WHERE transaction_type = 'purchase'
              AND transaction_status = 'confirmed'
              AND DATE(transaction_date) < DATE(?)
          `, [fromDate]);
          totalReceiveQty = Number(preDateReceives[0]?.total_quantity) || 0;
          totalReceiveAmt = 0; // No amount for petrol receives
        } else {
          const [preDateReceives] = await connection.execute<RowDataPacket[]>(
            `SELECT 
              COALESCE(SUM(rd.received_quantity), 0) as total_quantity,
              COALESCE(SUM(rrp.total_amount), 0) as total_amount
            FROM receive_details rd
            JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
            WHERE rd.nac_code = ?
            AND rd.approval_status = 'APPROVED'
            AND DATE(rd.receive_date) < DATE(?)
          `, [stock.nac_code, fromDate]);
          totalReceiveQty = Number(preDateReceives[0]?.total_quantity) || 0;
          totalReceiveAmt = Number(preDateReceives[0]?.total_amount) || 0;
        }

        const [preDateIssues] = await connection.execute<RowDataPacket[]>(
          `SELECT 
            COALESCE(SUM(issue_quantity), 0) as total_quantity,
            COALESCE(SUM(issue_cost), 0) as total_amount
          FROM issue_details
          WHERE nac_code = ?
          AND approval_status = 'APPROVED'
          AND DATE(issue_date) < DATE(?)
        `, [stock.nac_code, fromDate]);
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

      const [issueRecords] = await connection.execute<RowDataPacket[]>(
        `SELECT 
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

      let receiveRecords;
      if (stock.nac_code === 'GT 00000') {
        // Petrol: get receives from transaction_details
        const [gtReceiveRecords] = await connection.execute<RowDataPacket[]>(
          `SELECT 
            transaction_date as date,
            transaction_quantity as quantity,
            0 as total_amount,
            id as reference
          FROM transaction_details
          WHERE transaction_type = 'purchase'
            AND transaction_status = 'confirmed'
            ${!generateByIssueDate && fromDate && toDate ? 'AND transaction_date BETWEEN ? AND ?' : ''}
          ORDER BY transaction_date ASC
        `, !generateByIssueDate && fromDate && toDate ? [fromDate, toDate] : []);
        receiveRecords = gtReceiveRecords;
      } else {
        const [normalReceiveRecords] = await connection.execute<RowDataPacket[]>(
          `SELECT 
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
        receiveRecords = normalReceiveRecords;
      }

      let movements: StockMovement[] = [
        ...issueRecords.map(record => {
          let dateObj: Date;
          if (record.date instanceof Date) {
            dateObj = record.date;
          } else if (typeof record.date === 'string') {
            // Try to parse as YYYY-MM-DD or ISO string
            dateObj = new Date(record.date);
          } else {
            dateObj = new Date('Invalid');
          }
          return {
            date: dateObj,
            reference: record.reference,
            type: 'issue' as const,
            quantity: record.quantity, 
            amount: record.amount, 
            balance_quantity: 0,
            balance_amount: 0,
            equipment_number: record.issued_for 
          };
        }),
        ...receiveRecords.map(record => {
          let dateObj: Date;
          if (record.date instanceof Date) {
            dateObj = record.date;
          } else if (typeof record.date === 'string') {
            dateObj = new Date(record.date);
          } else {
            dateObj = new Date('Invalid');
          }
          return {
            date: dateObj,
            reference: record.reference,
            type: 'receive' as const,
            quantity: record.quantity,
            amount: record.total_amount,
            balance_quantity: 0, 
            balance_amount: 0
          };
        })
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
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fuel_type = 'Diesel'
       AND i.issue_date BETWEEN ? AND ?
       AND f.number_of_flights IS NOT NULL`,
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
    const [authorityRows] = await connection.query<RowDataPacket[]>(
      'SELECT level_1_authority_name, level_1_authority_staffid, level_1_authority_designation, ' +
      'level_2_authority_name, level_2_authority_staffid, level_2_authority_designation, ' +
      'level_3_authority_name, level_3_authority_staffid, level_3_authority_designation ' +
      'FROM authority_details WHERE authority_type = ? ORDER BY id DESC LIMIT 1',
      ['fuel']
    );
    // Parse the comma-separated equipment list
    const equipmentList = configResult[0].config_value
      .replace(/\r\n/g, '')
      .split(',')
      .map((item: string) => item.trim())
      .filter((item: string) => item && !item.includes(' '));

    // Get the flight count from the request
    const flightCount = flight_count

    // If flight count is provided, update all fuel records in the date range
    if (flightCount !== undefined && flightCount !== null) {
      console.log('Updating flight count to', flightCount, 'for date range:', start_date, 'to', end_date);
      
      // Update flight count for all fuel records in the date range
      await connection.query(
        `UPDATE fuel_records f
         JOIN issue_details i ON f.issue_fk = i.id
         SET f.number_of_flights = ?
         WHERE f.fuel_type = 'diesel'
         AND i.issue_date BETWEEN ? AND ?
         AND i.approval_status = 'APPROVED'`,
        [flightCount, start_date, end_date]
      );
    }

    // Fetch all diesel fuel records with issue details for the date range
    const [fuelRecords] = await connection.query<RowDataPacket[]>(
      `SELECT 
        DATE(i.issue_date) as date,
        DAYNAME(i.issue_date) as day_name,
        i.issued_for,
        f.fuel_price,
        MAX(f.week_number) as week_number,
        SUM(i.issue_quantity) as issue_quantity,
        MAX(f.kilometers) as kilometers,
        SUM(i.issue_quantity * f.fuel_price) as daily_cost
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fuel_type = 'diesel' 
      AND i.issue_date BETWEEN ? AND ?
      AND i.approval_status = 'APPROVED'
      GROUP BY DATE(i.issue_date), DAYNAME(i.issue_date), i.issued_for, f.fuel_price
      ORDER BY date, i.issued_for`,
      [start_date, end_date]
    );

    // Process the data
    interface EquipmentData {
      quantity: number;
      kilometers: number;
      cost: number;
    }

    interface DailyData {
      date: string;
      day_name: string;
      fuel_price: number;
      equipmentData: Map<string, EquipmentData>;
    }

    interface EquipmentTotal {
      totalQuantity: number;
      totalCost: number;
    }

    interface ProcessedData {
      dailyData: Map<string, DailyData>;
      equipmentTotals: Map<string, EquipmentTotal>;
      grandTotal: {
        quantity: number;
        cost: number;
      };
    }

    const processedData: ProcessedData = {
      dailyData: new Map(),
      equipmentTotals: new Map(),
      grandTotal: {
        quantity: 0,
        cost: 0
      }
    };

    // Initialize daily data structure
    fuelRecords.forEach(record => {
      const dateKey = record.date;
      if (!processedData.dailyData.has(dateKey)) {
        processedData.dailyData.set(dateKey, {
          date: record.date,
          day_name: record.day_name,
          fuel_price: record.fuel_price,
          equipmentData: new Map()
        });
      }
    });

    // Process each record
    fuelRecords.forEach(record => {
      const dateKey = record.date;
      const dailyData = processedData.dailyData.get(dateKey);
      if (!dailyData) return; // Skip if no daily data found
      
      const equipment = record.issued_for;

      if (!dailyData.equipmentData.has(equipment)) {
        dailyData.equipmentData.set(equipment, {
          quantity: 0,
          kilometers: 0,
          cost: 0
        });
      }

      const equipmentData = dailyData.equipmentData.get(equipment);
      if (!equipmentData) return; // Skip if no equipment data found

      equipmentData.quantity += record.issue_quantity;
      equipmentData.kilometers = Math.max(equipmentData.kilometers, record.kilometers || 0);
      equipmentData.cost += record.daily_cost;

      // Update equipment totals
      if (!processedData.equipmentTotals.has(equipment)) {
        processedData.equipmentTotals.set(equipment, {
          totalQuantity: 0,
          totalCost: 0
        });
      }
      const equipmentTotal = processedData.equipmentTotals.get(equipment);
      if (!equipmentTotal) return; // Skip if no equipment total found

      equipmentTotal.totalQuantity += record.issue_quantity;
      equipmentTotal.totalCost += record.daily_cost;

      // Update grand totals
      processedData.grandTotal.quantity += record.issue_quantity;
      processedData.grandTotal.cost += record.daily_cost;
    });



    // Continue with Excel generation...
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

      // Fill date range in H6
      const startBsStr = BS.ADToBS(String(start_date));
      const endBsStr = BS.ADToBS(String(end_date));
      sheet.cell('H6').value(`${startBsStr} to ${endBsStr}`);
      
      // Get week number and previous week's data
      const [weekData] = await connection.query<RowDataPacket[]>(
        `SELECT 
          MAX(f.week_number) as week_number,
          MAX(f.number_of_flights) as number_of_flights,
          SUM(i.issue_quantity) as total_quantity,
          SUM(i.issue_quantity * f.fuel_price) as total_cost
         FROM fuel_records f
         JOIN issue_details i ON f.issue_fk = i.id
         WHERE f.fuel_type = 'diesel'
         AND i.issue_date BETWEEN ? AND ?
         AND i.approval_status = 'APPROVED'
         GROUP BY f.week_number, f.number_of_flights`,
        [start_date, end_date]
      );

      const currentWeek = weekData[0]?.week_number || 0;
      const previousWeek = currentWeek - 1;

      // Get previous week's data
      const [previousWeekData] = await connection.query<RowDataPacket[]>(
        `SELECT 
          MAX(f.week_number) as week_number,
          MAX(f.number_of_flights) as number_of_flights,
          SUM(i.issue_quantity) as total_quantity,
          SUM(i.issue_quantity * f.fuel_price) as total_cost
         FROM fuel_records f
         JOIN issue_details i ON f.issue_fk = i.id
         WHERE f.fuel_type = 'diesel'
         AND f.week_number = ?
         AND i.approval_status = 'APPROVED'
         GROUP BY f.week_number, f.number_of_flights`,
        [previousWeek]
      );

      const currentWeekData = weekData[0] || { total_quantity: 0, total_cost: 0, number_of_flights: 0 };
      const prevWeekData = previousWeekData[0] || { total_quantity: 0, total_cost: 0, number_of_flights: 0 };

      // Calculate differences
      const quantityDiff = Math.abs(currentWeekData.total_quantity - prevWeekData.total_quantity);
      const flightsDiff = Math.abs(currentWeekData.number_of_flights - prevWeekData.number_of_flights);
      const costDiff = Math.abs(currentWeekData.total_cost - prevWeekData.total_cost);

      // Fill week numbers and data
      sheet.cell('B159').value(`Previous Week (Week ${previousWeek}) Consumption (in Ltrs)`);
      sheet.cell('B160').value(`Current Week (Week ${currentWeek}) (in Ltrs)`);
      sheet.cell('B165').value(`Total number of flights handled in Week ${previousWeek}`);
      sheet.cell('B166').value(`Total number of flights handled in Week ${currentWeek}`);
      sheet.cell('B170').value(`Total cost of diesel issued in Week ${previousWeek}`);
      sheet.cell('B171').value(`Total cost of diesel issued in Week ${currentWeek}`);

      // Fill values
      sheet.cell('F159').value(prevWeekData.total_quantity);
      sheet.cell('F160').value(currentWeekData.total_quantity);
      sheet.cell('F161').value(quantityDiff);
      sheet.cell('F165').value(prevWeekData.number_of_flights);
      sheet.cell('F166').value(currentWeekData.number_of_flights);
      sheet.cell('F167').value(flightsDiff);
      sheet.cell('F170').value(prevWeekData.total_cost);
      sheet.cell('F171').value(currentWeekData.total_cost);
      sheet.cell('F172').value(costDiff);

      // Fill comparison messages
      if (currentWeekData.total_quantity !== prevWeekData.total_quantity) {
        sheet.cell('I161').value(
          currentWeekData.total_quantity > prevWeekData.total_quantity 
            ? 'Increase in fuel consumption' 
            : 'Decrease in fuel consumption'
        );
      } else {
        sheet.cell('I161').value('No change in fuel consumption');
      }

      if (currentWeekData.number_of_flights !== prevWeekData.number_of_flights) {
        sheet.cell('I167').value(
          currentWeekData.number_of_flights > prevWeekData.number_of_flights 
            ? 'Increase in flight frequency this week' 
            : 'Decrease in flight frequency this week'
        );
      } else {
        sheet.cell('I167').value('No change in flight frequency');
      }

      if (currentWeekData.total_cost !== prevWeekData.total_cost) {
        sheet.cell('I172').value(
          currentWeekData.total_cost > prevWeekData.total_cost 
            ? 'Increase in total cost this week' 
            : 'Decrease in total cost this week'
        );
      } else {
        sheet.cell('I172').value('No change in total cost');
      }

      // Fill week number in R5
      if (currentWeek) {
        sheet.cell('R5').value(currentWeek);
      }

      // Fill today's date in R6
      const today = new Date().toISOString().split('T')[0];
      sheet.cell('R6').value(today);
      
      // Get unique dates and their data
      const dateColumns = ['C', 'E', 'G', 'I', 'K', 'M', 'O'];
      const dateData = new Map();

      // Helper function to format date as YYYY-MM-DD
      const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      // Generate all dates in the range
      const allDates = [];
      const start = new Date(String(start_date));
      const end = new Date(String(end_date));
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        allDates.push(formatDate(d.toISOString()));
      }

      // Initialize dateData with all dates in range
      allDates.forEach(date => {
        dateData.set(date, {
          day_name: new Date(date).toLocaleDateString('en-US', { weekday: 'long' }),
          fuel_price: null,
          equipmentData: new Map()
        });
      });

      // Fill in actual data
      fuelRecords.forEach(record => {
        const dateKey = formatDate(record.date);
        if (dateData.has(dateKey)) {
          const dateInfo = dateData.get(dateKey);
          dateInfo.fuel_price = record.fuel_price;
          
          if (!dateInfo.equipmentData.has(record.issued_for)) {
            dateInfo.equipmentData.set(record.issued_for, {
              quantity: null,
              kilometers: null,
              cost: 0
            });
          }
          const equipmentData = dateInfo.equipmentData.get(record.issued_for);
          
          // Sum up quantities
          equipmentData.quantity = (equipmentData.quantity || 0) + record.issue_quantity;
          
          // Always update kilometers with the latest value
          if (record.kilometers !== null && record.kilometers !== undefined) {
            equipmentData.kilometers = Number(record.kilometers);
          }
          
          // Sum up costs
          equipmentData.cost += record.daily_cost;
        }
      });
      
      // Fill day names and dates in row 7
      allDates.forEach((date, index) => {
        if (index < 7) {
          const col = dateColumns[index];
          const data = dateData.get(date);
          sheet.cell(7, col).value(`${data.day_name}           (${date})`);
        }
      });

      // Fill fuel prices in row 9
      let lastPrice: number | null = null;
      allDates.forEach((date, index) => {
        if (index < 7) {
          const col = dateColumns[index];
          const data = dateData.get(date);
          let priceToUse = data.fuel_price;
          if (priceToUse === null || priceToUse === undefined) {
            priceToUse = lastPrice;
          } else {
            lastPrice = priceToUse;
          }
          if (priceToUse !== null && priceToUse !== undefined) {
            sheet.cell(9, col).value(priceToUse);
          }
        }
      });

      // Fill equipment data starting from row 11
      let row = 11;
      const dailyTotals = new Map();

      // Initialize daily totals
      allDates.forEach(date => {
        dailyTotals.set(date, { quantity: 0, cost: 0 });
      });

      // Process each equipment
      for (const equipment of equipmentList) {
        let totalQuantity = 0;
        let totalCost = 0;

        // Fill equipment number
        sheet.cell(row, 'B').value(equipment);

        // Fill daily data
        allDates.forEach((date, index) => {
          if (index < 7) {
            const col = dateColumns[index];
            const data = dateData.get(date);
            const equipmentData = data.equipmentData.get(equipment) || { quantity: null, kilometers: null, cost: 0 };
            
            // Fill quantity and kilometers only if they exist
            if (equipmentData.quantity !== null) {
              sheet.cell(row, col).value(equipmentData.quantity);
              totalQuantity += equipmentData.quantity;
              dailyTotals.get(date).quantity += equipmentData.quantity;
            }
            // Fill kilometers if it exists
            if (equipmentData.kilometers !== null && equipmentData.kilometers !== undefined) {
              // Calculate the kilometers column (next column after quantity)
              const kmCol = String.fromCharCode(col.charCodeAt(0) + 1);
              const kmCell = sheet.cell(row, kmCol);
              kmCell.value(Number(equipmentData.kilometers));
              // Ensure the cell is properly formatted
              kmCell.style({
                numberFormat: '#,##0'
              });
            }
            if (equipmentData.cost !== 0) {
              totalCost += equipmentData.cost;
              dailyTotals.get(date).cost += equipmentData.cost;
            }
          }
        });

        // Fill equipment totals (always show these)
        sheet.cell(row, 'Q').value(totalQuantity);
        sheet.cell(row, 'R').value(totalCost);

        row++;
      }

      // Fill daily totals in row 154 and 155 (always show these)
      allDates.forEach((date, index) => {
        if (index < 7) {
          const col = dateColumns[index];
          const totals = dailyTotals.get(date);
          sheet.cell(154, col).value(totals.quantity);
          sheet.cell(155, col).value(totals.cost);
        }
      });

      // Calculate and fill grand totals (always show these)
      const grandTotalQuantity = Array.from(dailyTotals.values()).reduce((sum, day) => sum + day.quantity, 0);
      const grandTotalCost = Array.from(dailyTotals.values()).reduce((sum, day) => sum + day.cost, 0);
      sheet.cell('Q154').value(grandTotalQuantity);
      sheet.cell('R155').value(grandTotalCost);

      // Get authority details for fuel
      const [authorityRows] = await connection.query<RowDataPacket[]>(
        'SELECT level_1_authority_name, level_1_authority_staffid, level_1_authority_designation, ' +
        'level_2_authority_name, level_2_authority_staffid, level_2_authority_designation, ' +
        'level_3_authority_name, level_3_authority_staffid, level_3_authority_designation ' +
        'FROM authority_details WHERE authority_type = ? ORDER BY id DESC LIMIT 1',
        ['fuel']
      );
      if ((authorityRows as RowDataPacket[]).length > 0) {
        const auth = (authorityRows as RowDataPacket[])[0];
        sheet.cell('A190').value(auth.level_1_authority_name || '');
        sheet.cell('A191').value(auth.level_1_authority_designation || '');
        sheet.cell('I190').value(auth.level_2_authority_name || '');
        sheet.cell('I191').value(auth.level_2_authority_designation || '');
        sheet.cell('P190').value(auth.level_3_authority_name || '');
        sheet.cell('P191').value(auth.level_3_authority_designation || '');
      }

      // Save the final file with charts preserved
      await workbook.toFileAsync(outputPath);
      
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
    console.error(error);
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

export const generateWeeklyPetrolReport = async (req: Request, res: Response): Promise<void> => {
  const { start_date, end_date } = req.query;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Fetch valid equipment list from app_config
    const [configResult] = await connection.query<RowDataPacket[]>(
      'SELECT config_value FROM app_config WHERE config_name = ? AND config_type = "fuel"',
      ['valid_equipment_list_petrol']
    );

    if (configResult.length === 0) {
      throw new Error('Valid equipment list configuration not found');
    }

    // Parse the comma-separated equipment list
    const equipmentList = configResult[0].config_value
      .replace(/\r\n/g, '')
      .split(',')
      .map((item: string) => item.trim())
      .filter((item: string) => item && !item.includes(' '));

    // Fetch all petrol fuel records with issue details for the date range
    const [fuelRecords] = await connection.query<RowDataPacket[]>(
            `SELECT 
        DATE(i.issue_date) as date,
        DAYNAME(i.issue_date) as day_name,
        i.issued_for,
              f.fuel_price,
        MAX(f.week_number) as week_number,
        SUM(i.issue_quantity) as issue_quantity,
        MAX(f.kilometers) as kilometers,
        SUM(i.issue_quantity * f.fuel_price) as daily_cost
            FROM fuel_records f
            JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fuel_type = 'Petrol' 
      AND i.issue_date BETWEEN ? AND ?
      AND i.approval_status = 'APPROVED'
      GROUP BY DATE(i.issue_date), DAYNAME(i.issue_date), i.issued_for, f.fuel_price
      ORDER BY date, i.issued_for`,
      [start_date, end_date]
    );

    // Get week number and previous week's data
    const [weekData] = await connection.query<RowDataPacket[]>(
      `SELECT 
        f.week_number,
        SUM(i.issue_quantity) as total_quantity,
        SUM(i.issue_quantity * f.fuel_price) as total_cost
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fuel_type = 'Petrol'
       AND i.issue_date BETWEEN ? AND ?
       AND i.approval_status = 'APPROVED'
       GROUP BY f.week_number`,
      [start_date, end_date]
    );

    const currentWeek = weekData[0]?.week_number || 0;


    // Continue with Excel generation...
    const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
    
    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate a unique filename
    const filename = `Petrol_Weekly_Report_${start_date}_to_${end_date}.xlsx`;
    const outputPath = path.join(tempDir, filename);

    try {
      // Use xlsx-populate to preserve charts
      const XlsxPopulate = require('xlsx-populate');
      
      // Load template with charts preserved
      const workbook = await XlsxPopulate.fromFileAsync(templatePath);
      const sheet = workbook.sheet('Petrol Weekly Template'); // You may want to use a petrol-specific template

      // Fill date range in H6
      sheet.cell('J6').value(`${start_date} to ${end_date}`);
      
      // Fill week number in R5
      if (currentWeek) {
        sheet.cell('R5').value(currentWeek);
      }
      
      // Fill today's date in R6
      const today = new Date().toISOString().split('T')[0];
      sheet.cell('R6').value(today);
      
      // Get unique dates and their data
      const dateColumns = ['C', 'E', 'G', 'I', 'K', 'M', 'O'];
      const dateData = new Map();

      // Helper function to format date as YYYY-MM-DD
      const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      // Generate all dates in the range
      const allDates = [];
      const start = new Date(String(start_date));
      const end = new Date(String(end_date));
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        allDates.push(formatDate(d.toISOString()));
      }

      // Initialize dateData with all dates in range
      allDates.forEach(date => {
        dateData.set(date, {
          day_name: new Date(date).toLocaleDateString('en-US', { weekday: 'long' }),
          fuel_price: null,
          equipmentData: new Map()
        });
      });

      // Fill in actual data
      fuelRecords.forEach(record => {
        const dateKey = formatDate(record.date);
        if (dateData.has(dateKey)) {
          const dateInfo = dateData.get(dateKey);
          dateInfo.fuel_price = record.fuel_price;
          
          if (!dateInfo.equipmentData.has(record.issued_for)) {
            dateInfo.equipmentData.set(record.issued_for, {
              quantity: null,
              kilometers: null,
              cost: 0
            });
          }
          const equipmentData = dateInfo.equipmentData.get(record.issued_for);
          
          // Sum up quantities
          equipmentData.quantity = (equipmentData.quantity || 0) + record.issue_quantity;
          
          // Always update kilometers with the latest value
          if (record.kilometers !== null && record.kilometers !== undefined) {
            equipmentData.kilometers = Number(record.kilometers);
          }
          
          // Sum up costs
          equipmentData.cost += record.daily_cost;
        }
      });
      
      // Fill day names and dates in row 7
      allDates.forEach((date, index) => {
        if (index < 7) {
          const col = dateColumns[index];
          const data = dateData.get(date);
          sheet.cell(7, col).value(`${data.day_name}             (${date})`);
        }
      });

      // Fill fuel prices in row 9
      let lastPrice: number | null = null;
      allDates.forEach((date, index) => {
        if (index < 7) {
          const col = dateColumns[index];
          const data = dateData.get(date);
          let priceToUse = data.fuel_price;
          if (priceToUse === null || priceToUse === undefined) {
            priceToUse = lastPrice;
          } else {
            lastPrice = priceToUse;
          }
          if (priceToUse !== null && priceToUse !== undefined) {
            sheet.cell(9, col).value(priceToUse);
          }
        }
      });

      // Fill equipment data starting from row 11
      let row = 11;
      const dailyTotals = new Map();

      // Initialize daily totals
      allDates.forEach(date => {
        dailyTotals.set(date, { quantity: 0, cost: 0 });
      });

      // Process each equipment
      for (const equipment of equipmentList) {
        let totalQuantity = 0;
        let totalCost = 0;

        // Fill equipment number
        sheet.cell(row, 'B').value(equipment);

        // Fill daily data
        allDates.forEach((date, index) => {
          if (index < 7) {
            const col = dateColumns[index];
            const data = dateData.get(date);
            const equipmentData = data.equipmentData.get(equipment) || { quantity: null, kilometers: null, cost: 0 };
            
            // Fill quantity and kilometers only if they exist
            if (equipmentData.quantity !== null) {
              sheet.cell(row, col).value(equipmentData.quantity);
              totalQuantity += equipmentData.quantity;
              dailyTotals.get(date).quantity += equipmentData.quantity;
            }
            // Fill kilometers if it exists
            if (equipmentData.kilometers !== null && equipmentData.kilometers !== undefined) {
              // Calculate the kilometers column (next column after quantity)
              const kmCol = String.fromCharCode(col.charCodeAt(0) + 1);
              const kmCell = sheet.cell(row, kmCol);
              kmCell.value(Number(equipmentData.kilometers));
              // Ensure the cell is properly formatted
              kmCell.style({
                numberFormat: '#,##0'
              });
            }
            if (equipmentData.cost !== 0) {
              totalCost += equipmentData.cost;
              dailyTotals.get(date).cost += equipmentData.cost;
            }
          }
        });

        // Fill equipment totals (always show these)
        sheet.cell(row, 'Q').value(totalQuantity);
        sheet.cell(row, 'R').value(totalCost);

        row++;
      }

      // Fill daily totals in row 154 and 155 (always show these)
      allDates.forEach((date, index) => {
        if (index < 7) {
          const col = dateColumns[index];
          const totals = dailyTotals.get(date);
          sheet.cell(21, col).value(totals.quantity);
          sheet.cell(22, col).value(totals.cost);
        }
      });

      // Calculate and fill grand totals (always show these)
      const grandTotalQuantity = Array.from(dailyTotals.values()).reduce((sum, day) => sum + day.quantity, 0);
      const grandTotalCost = Array.from(dailyTotals.values()).reduce((sum, day) => sum + day.cost, 0);
      sheet.cell('Q20').value(grandTotalQuantity);
      sheet.cell('R20').value(grandTotalCost);
      sheet.cell('Q21').value(grandTotalQuantity);
      sheet.cell('R22').value(grandTotalCost);


      // Get authority details for fuel
      const [authorityRows] = await connection.query<RowDataPacket[]>(
        'SELECT level_1_authority_name, level_1_authority_staffid, level_1_authority_designation, ' +
        'level_2_authority_name, level_2_authority_staffid, level_2_authority_designation, ' +
        'level_3_authority_name, level_3_authority_staffid, level_3_authority_designation ' +
        'FROM authority_details WHERE authority_type = ? ORDER BY id DESC LIMIT 1',
        ['fuel']
      );
      if ((authorityRows as RowDataPacket[]).length > 0) {
        const auth = (authorityRows as RowDataPacket[])[0];
        sheet.cell('A27').value(auth.level_1_authority_name || '');
        sheet.cell('A28').value(auth.level_1_authority_designation || '');
        sheet.cell('H27').value(auth.level_2_authority_name || '');
        sheet.cell('H28').value(auth.level_2_authority_designation || '');
        sheet.cell('Q27').value(auth.level_3_authority_name || '');
        sheet.cell('Q28').value(auth.level_3_authority_designation || '');
      }

      // Save the final file with charts preserved
      await workbook.toFileAsync(outputPath);
      
    } catch (error) {
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
    logEvents(`Error generating weekly petrol report: ${errorMessage}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while generating report'
    });
  } finally {
    connection.release();
  }
};

export const generateOilConsumptionReport = async (req: Request, res: Response): Promise<void> => {
  const { start_date, end_date } = req.query;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Get oil NAC codes from config
    const [oilConfigRows] = await connection.query<RowDataPacket[]>(
      `SELECT config_value FROM app_config WHERE config_type = 'fuel' AND config_name = 'oil_codes'`
    );
    if (!oilConfigRows.length) throw new Error('Oil codes not configured');
    const oilCodes = oilConfigRows[0].config_value.split(',').map((c: string) => c.trim()).filter(Boolean);
    // 2. For each oil code, get total issued quantity and item details
    const oilData: { naccode: string, total_issued: number, item_name: string, part_number: string, unit: string }[] = [];
    for (const naccode of oilCodes) {
      // Get total issued quantity
      const [issueRows] = await connection.query<RowDataPacket[]>(
        `SELECT SUM(issue_quantity) as total_issued FROM issue_details WHERE nac_code = ? AND issue_date BETWEEN ? AND ? AND approval_status = 'APPROVED'`,
        [naccode, start_date, end_date]
      );
      const total_issued = Number(issueRows[0]?.total_issued) || 0;

      // Get item name, part number, unit
      const [stockRows] = await connection.query<RowDataPacket[]>(
        `SELECT item_name, part_numbers, unit FROM stock_details WHERE nac_code = ? LIMIT 1`,
        [naccode]
      );
      let item_name = '', part_number = '', unit = '';
      if (stockRows.length) {
        item_name = String(stockRows[0].item_name || '').split(',')[0].trim();
        part_number = String(stockRows[0].part_numbers || '').split(',')[0].trim();
        unit = stockRows[0].unit || '';
      }
      oilData.push({ naccode, total_issued, item_name, part_number, unit });
    }

    // 3. Get week number for the starting date from diesel fuel_records
    const [weekRows] = await connection.query<RowDataPacket[]>(
      `SELECT week_number FROM fuel_records f JOIN issue_details i ON f.issue_fk = i.id WHERE f.fuel_type = 'diesel' AND i.issue_date = ? LIMIT 1`,
      [start_date]
    );
    const weekNumber = weekRows.length ? weekRows[0].week_number : 0;

    // 4. Get today's date
    const today = new Date().toISOString().split('T')[0];

    // 5. Get level 3 authority name and designation
    const [authRows] = await connection.query<RowDataPacket[]>(
      `SELECT level_3_authority_name, level_3_authority_designation FROM authority_details WHERE authority_type = 'fuel' ORDER BY id DESC LIMIT 1`
    );
    const level3Name = authRows.length ? authRows[0].level_3_authority_name : '';
    const level3Designation = authRows.length ? authRows[0].level_3_authority_designation : '';

    // 6. Fill the Excel template
    const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const filename = `oil_consumption_report_${start_date}_to_${end_date}.xlsx`;
    const outputPath = path.join(tempDir, filename);

    try {
      const XlsxPopulate = require('xlsx-populate');
      const workbook = await XlsxPopulate.fromFileAsync(templatePath);
      const sheet = workbook.sheet('Oil Weekly Template');
      // Convert to Nepali (Bikram Sambat) date range
      const startBsStr = BS.ADToBS(String(start_date));
      const endBsStr = BS.ADToBS(String(end_date));
      sheet.cell('E13').value(`${startBsStr} - ${endBsStr}`);
      sheet.cell('D13').value(`${start_date} - ${end_date}`);
      sheet.cell('C13').value(weekNumber);
      sheet.cell('E6').value(today);

      // Fill oil data starting from row 16
      let row = 16;

      oilData.forEach((oil, idx) => {
        sheet.cell(row, 'A').value(idx + 1);
        sheet.cell(row, 'B').value(`${oil.item_name} (${oil.part_number})`);
        sheet.cell(row, 'C').value(oil.unit);
        sheet.cell(row, 'D').value(oil.total_issued);
        // Add full borders
        ['A','B','C','D'].forEach(col => {
          sheet.cell(row, col).style({
            border: true
          });
        });
        row++;
      });

      // After 3 rows from last item, fill submitted by and authority
      row += 3;
      sheet.cell(row, 'E').value('Submitted By:');
      sheet.cell(row + 1, 'E').value(level3Name);
      sheet.cell(row + 2, 'E').value(level3Designation);

      await workbook.toFileAsync(outputPath);
    } catch (error) {
      console.log('Error generating oil report:', error);
      fs.copyFileSync(templatePath, outputPath);
    }

    // Send the file
    res.download(outputPath, filename, (err) => {
      if (err) {
        logEvents(`Error sending file: ${err.message}`, 'fuelLog.log');
      }
      fs.unlink(outputPath, (unlinkErr) => {
        if (unlinkErr) {
          logEvents(`Error deleting temporary file: ${unlinkErr.message}`, 'fuelLog.log');
        }
      });
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error generating oil consumption report: ${errorMessage}`, 'fuelLog.log');
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};