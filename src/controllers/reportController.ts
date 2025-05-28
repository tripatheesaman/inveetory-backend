import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';

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