import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';

export const getDailyIssueReport = async (req: Request, res: Response): Promise<void> => {
  const { fromDate, toDate, equipmentNumber } = req.query;
  const connection = await pool.getConnection();

  try {
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

    const queryParams: any[] = [fromDate, toDate, "APPROVED"];

    // Add equipment number filter if provided
    if (equipmentNumber) {
      query += ` AND i.issued_for = ?`;
      queryParams.push(equipmentNumber);
    }

    query += ` ORDER BY i.issue_date DESC, i.issue_slip_number`;

    const [issues] = await connection.execute<RowDataPacket[]>(query, queryParams);

    // Parse the issued_by JSON string for each issue
    const formattedIssues = issues.map(issue => ({
      ...issue,
      issued_by: JSON.parse(issue.issued_by)
    }));

    logEvents(`Successfully generated daily issue report from ${fromDate} to ${toDate}${equipmentNumber ? ` for equipment ${equipmentNumber}` : ''}`, "reportLog.log");
    res.status(200).json({
      message: 'Daily issue report generated successfully',
      issues: formattedIssues
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