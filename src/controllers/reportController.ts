import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';
import { ExcelService, StockCardData } from '../services/excelService';
import path from 'path';

export const getDailyIssueReport = async (req: Request, res: Response): Promise<void> => {
  const { fromDate, toDate, equipmentNumber, page = 1, limit = 10 } = req.query;
  const connection = await pool.getConnection();

  try {
    // Validate required parameters
    if (!fromDate || !toDate) {
      throw new Error('fromDate and toDate are required parameters');
    }

    // Calculate offset for pagination
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    // Base query for counting total records
    let countQuery = `
      SELECT COUNT(*) as total
      FROM issue_details i
      WHERE i.issue_date BETWEEN ? AND ?
      AND i.approval_status = ?
    `;

    // Base query for fetching paginated data
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

    // Initialize query parameters array with explicit types
    const countParams = [String(fromDate), String(toDate), "APPROVED"];
    const dataParams = [String(fromDate), String(toDate), "APPROVED"];

    // Add equipment number filter if provided
    if (equipmentNumber) {
      countQuery += ` AND i.issued_for = ?`;
      dataQuery += ` AND i.issued_for = ?`;
      countParams.push(String(equipmentNumber));
      dataParams.push(String(equipmentNumber));
    }

    // Add pagination to data query
    dataQuery += ` ORDER BY i.issue_date DESC, i.issue_slip_number LIMIT ? OFFSET ?`;
    dataParams.push(String(limitNum), String(offset));

    // Log the queries and parameters for debugging
    logEvents(`Count Query: ${countQuery}`, "reportLog.log");
    logEvents(`Count Params: ${JSON.stringify(countParams)}`, "reportLog.log");
    logEvents(`Data Query: ${dataQuery}`, "reportLog.log");
    logEvents(`Data Params: ${JSON.stringify(dataParams)}`, "reportLog.log");

    // Execute count query
    const [totalResult] = await connection.execute<RowDataPacket[]>(countQuery, countParams);
    
    // Execute data query
    const [issues] = await connection.execute<RowDataPacket[]>(dataQuery, dataParams);

    // Parse the issued_by JSON string for each issue
    const formattedIssues = issues.map(issue => ({
      ...issue,
      issued_by: JSON.parse(issue.issued_by)
    }));

    logEvents(`Successfully generated daily issue report from ${fromDate} to ${toDate}${equipmentNumber ? ` for equipment ${equipmentNumber}` : ''}`, "reportLog.log");
    res.status(200).json({
      message: 'Daily issue report generated successfully',
      issues: formattedIssues,
      total: totalResult[0].total
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error generating daily issue report: ${errorMessage}`, "reportLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while generating the report'
    });
  } finally {
    connection.release();
  }
};

export const exportDailyIssueReport = async (req: Request, res: Response): Promise<void> => {
  const { fromDate, toDate, equipmentNumber } = req.body;
  const connection = await pool.getConnection();

  try {
    // Validate required parameters
    if (!fromDate || !toDate) {
      throw new Error('fromDate and toDate are required parameters');
    }

    // Base query for fetching all data
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

    // Initialize query parameters array with explicit types
    const queryParams = [String(fromDate), String(toDate), "APPROVED"];

    // Add equipment number filter if provided
    if (equipmentNumber) {
      query += ` AND i.issued_for = ?`;
      queryParams.push(String(equipmentNumber));
    }

    // Add ordering
    query += ` ORDER BY i.issue_date DESC, i.issue_slip_number`;

    // Log the query and parameters for debugging
    logEvents(`Export Query: ${query}`, "reportLog.log");
    logEvents(`Export Params: ${JSON.stringify(queryParams)}`, "reportLog.log");

    // Execute query
    const [issues] = await connection.execute<RowDataPacket[]>(query, queryParams);

    // Parse the issued_by JSON string for each issue
    const formattedIssues = issues.map(issue => ({
      ...issue,
      issued_by: JSON.parse(issue.issued_by)
    }));

    logEvents(`Successfully exported daily issue report from ${fromDate} to ${toDate}${equipmentNumber ? ` for equipment ${equipmentNumber}` : ''}`, "reportLog.log");
    res.status(200).json({
      message: 'Daily issue report exported successfully',
      issues: formattedIssues
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error exporting daily issue report: ${errorMessage}`, "reportLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while exporting the report'
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

  // Split the equipment numbers by commas
  const items = normalized.split(',').map(item => item.trim());

  // Separate numbers and string-based descriptions
  const numbers: number[] = [];
  const descriptions = new Set<string>();

  for (const item of items) {
    // Check if it's a number or a description
    if (/^\d+$/.test(item)) {
      numbers.push(parseInt(item, 10));
    } else {
      const cleanedItem = item.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      if (cleanedItem) {
        descriptions.add(cleanedItem.toLowerCase());
      }
    }
  }

  // Process numbers to create ranges if possible
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

  // Combine ranges and descriptions
  const result = [...rangeNumbers, ...Array.from(descriptions)].join(', ');
  return result.toUpperCase();
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

    // If generateByIssueDate is true, get unique naccodes from issue_details
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
      // If naccodes are provided, use them directly
      if (!naccodes || naccodes.length === 0) {
        throw new Error('naccodes are required when generateByIssueDate is false');
      }
      targetNaccodes = naccodes;
    }
    
    // First verify the record exists and check its format
    const verifyQuery = `
      SELECT nac_code, LENGTH(nac_code) as code_length, HEX(nac_code) as code_hex
      FROM stock_details 
      WHERE nac_code LIKE ?
    `;
    
    const searchPattern = `%${targetNaccodes[0].replace(/\s+/g, '%')}%`;
    logEvents(`Verifying record with pattern: ${searchPattern}`, "reportLog.log");
    
    const [verifyResults] = await connection.execute<RowDataPacket[]>(verifyQuery, [searchPattern]);
    logEvents(`Verification results: ${JSON.stringify(verifyResults)}`, "reportLog.log");

    // Get stock details for the target naccodes with all required fields
    const stockQuery = `
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
    `;

    // Clean and normalize the NAC codes
    const searchNaccode = targetNaccodes[0].replace(/\s+/g, '%');
    
    logEvents(`Stock Query: ${stockQuery}`, "reportLog.log");
    logEvents(`Original NAC code: ${targetNaccodes[0]}`, "reportLog.log");
    logEvents(`Search pattern: ${searchNaccode}`, "reportLog.log");

    const [stockDetails] = await connection.execute<StockCardData[]>(stockQuery, [searchNaccode]);

    // Debug log to see what was found
    logEvents(`Raw stock details result: ${JSON.stringify(stockDetails)}`, "reportLog.log");

    if (!stockDetails || stockDetails.length === 0) {
      logEvents(`No stock details found for naccodes: ${targetNaccodes.join(', ')}`, "reportLog.log");
      throw new Error('No stock details found for the specified NAC codes');
    }

    logEvents(`Found ${stockDetails.length} stock details for processing`, "reportLog.log");

    // Process each stock item
    for (const stock of stockDetails) {
      // Normalize equipment numbers
      stock.equipment_number = normalizeEquipmentNumbers(stock.equipment_number);

      // Process part numbers
      const { primary, secondary } = processPartNumbers(stock.part_number);
      (stock as any).primary_part_number = primary;
      (stock as any).secondary_part_numbers = secondary;

      // Process item name
      stock.item_name = processItemName(stock.item_name);

      let openingBalanceQty = stock.open_quantity;
      let openingBalanceAmt = stock.open_amount;
      let openingBalanceDate: Date;

      // If dates are provided and generateByIssueDate is false, calculate opening balance
      if (fromDate && !generateByIssueDate) {
        // Set opening balance date to day before fromDate
        openingBalanceDate = new Date(fromDate);
        openingBalanceDate.setDate(openingBalanceDate.getDate() - 1);

        // Get all receive records before fromDate
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

        // Get all issue records before fromDate
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
        // Set opening balance date to July 17, 2025
        openingBalanceDate = new Date('2025-07-17');
      }

      stock.open_quantity = openingBalanceQty;
      stock.open_amount = openingBalanceAmt;

      // Build the base queries for issue and receive records
      let issueQuery = `
        SELECT 
          DATE_FORMAT(issue_date, '%Y-%m-%d') as date,
          issue_slip_number as reference,
          issue_quantity as quantity,
          issue_cost as amount,
          issued_for
        FROM issue_details
        WHERE nac_code = ?
        AND approval_status = 'APPROVED'
      `;

      let receiveQuery = `
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
      `;

      const queryParams: any[] = [stock.nac_code];
      const receiveParams: any[] = [stock.nac_code];

      // Add date filters if provided
      if (fromDate && toDate) {
        issueQuery += ` AND issue_date BETWEEN ? AND ?`;
        receiveQuery += ` AND rd.receive_date BETWEEN ? AND ?`;
        queryParams.push(fromDate, toDate);
        receiveParams.push(fromDate, toDate);
      }

      // Add ordering
      issueQuery += ` ORDER BY issue_date ASC`;
      receiveQuery += ` ORDER BY rd.receive_date ASC`;

      // Get issue records
      const [issueRecords] = await connection.execute<RowDataPacket[]>(issueQuery, queryParams);

      // Get receive records
      const [receiveRecords] = await connection.execute<RowDataPacket[]>(receiveQuery, receiveParams);

      // Combine and sort all movements
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

      // If equipment number contains 'consumable' or 'consumables', aggregate issues by date
      if (stock.equipment_number.toLowerCase().includes('consumable')) {
        const aggregatedMovements: StockMovement[] = [];
        const dateMap = new Map<string, StockMovement>();

        // First, add all receive movements as they are
        movements.filter(m => m.type === 'receive').forEach(movement => {
          aggregatedMovements.push(movement);
        });

        // Then aggregate issues by date
        movements.filter(m => m.type === 'issue').forEach(movement => {
          const dateKey = movement.date.toISOString().split('T')[0];
          if (dateMap.has(dateKey)) {
            const existing = dateMap.get(dateKey)!;
            existing.quantity += movement.quantity;
            existing.amount += movement.amount;
            // Use the first reference for the aggregated record
            existing.reference = existing.reference || movement.reference;
          } else {
            dateMap.set(dateKey, { ...movement });
          }
        });

        // Add aggregated issue movements
        aggregatedMovements.push(...Array.from(dateMap.values()));

        // Sort all movements by date
        movements = aggregatedMovements.sort((a, b) => a.date.getTime() - b.date.getTime());
      }

      // Calculate running balances starting from the calculated opening balance
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

      // Add movements and opening balance date to stock details
      (stock as any).movements = movements;
      (stock as any).openingBalanceDate = openingBalanceDate;
    }

    // Generate Excel file
    const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
    const excelBuffer = await ExcelService.generateStockCardExcel(stockDetails, templatePath);

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=stock_card_report.xlsx');

    logEvents(`Successfully generated stock card report for ${targetNaccodes.length} items`, "reportLog.log");
    res.send(excelBuffer);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error generating stock card report: ${errorMessage}`, "reportLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while generating the report'
    });
  } finally {
    connection.release();
  }
}; 