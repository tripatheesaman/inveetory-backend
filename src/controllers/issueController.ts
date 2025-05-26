import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import { formatDate, formatDateForDB } from '../utils/dateUtils';
import { logEvents } from '../middlewares/logger';

interface IssueItem {
  nacCode: string;
  quantity: number;
  equipmentNumber: string;
  partNumber: string;
}

interface IssueRequest {
  issueDate: string;
  items: IssueItem[];
  issuedBy: {
    name: string;
    staffId: string;
  };
}

interface StockDetails extends RowDataPacket {
  current_balance: number;
  open_quantity: number;
  open_amount: number;
}

const calculateIssueCost = (openAmount: number, openQuantity: number, quantity: number): number => {
  if (openAmount === 0 || openQuantity === 0) return 0;
  return (openAmount / openQuantity) * quantity;
};

export const createIssue = async (req: Request, res: Response): Promise<void> => {
  const { issueDate, items, issuedBy }: IssueRequest = req.body;
  
  if (!issueDate || !items || !items.length || !issuedBy) {
    logEvents(`Issue creation failed - Missing required fields by user: ${issuedBy?.name || 'Unknown'}`, "issueLog.log");
    res.status(400).json({
      error: 'Bad Request',
      message: 'Missing required fields'
    });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const formattedIssueDate = formatDateForDB(issueDate);
    const issuedByName = issuedBy.name;

    // Get current FY from app_config
    const [configRows] = await connection.query<RowDataPacket[]>(
      'SELECT config_value FROM app_config WHERE config_type = ? AND config_name = ?',
      ['rrp', 'current_fy']
    );

    if (configRows.length === 0) {
      logEvents(`Failed to create issue - Current FY configuration not found`, "issueLog.log");
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Current FY configuration not found'
      });
      return;
    }

    const currentFY = configRows[0].config_value;

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // Get the latest issue slip number for today
    const [lastIssue] = await connection.query<RowDataPacket[]>(
      `SELECT issue_slip_number FROM issue_details 
      WHERE DATE(issue_date) = ? AND current_fy = ?
      ORDER BY CAST(SUBSTRING_INDEX(issue_slip_number, 'T', -1) AS UNSIGNED) DESC LIMIT 1`,
      [today, currentFY]
    );

    let issueSlipNumber: string;
    if (lastIssue.length > 0) {
      const lastTNumber = parseInt(lastIssue[0].issue_slip_number.split('T')[1]);
      issueSlipNumber = `1T${lastTNumber + 1}`;
    } else {
      issueSlipNumber = '1T1';
    }

    const issueIds: number[] = [];

    for (const item of items) {
      const [stockResults] = await connection.execute<StockDetails[]>(
        'SELECT current_balance, open_quantity, open_amount FROM stock_details WHERE nac_code = ?',
        [item.nacCode]
      );

      if (stockResults.length === 0) {
        logEvents(`Issue creation failed - Item not found: ${item.nacCode} by user: ${issuedByName}`, "issueLog.log");
        throw new Error(`Item with NAC code ${item.nacCode} not found`);
      }

      const stockDetails = stockResults[0];
      const issueCost = calculateIssueCost(
        stockDetails.open_amount,
        stockDetails.open_quantity,
        item.quantity
      );

      const [result] = await connection.execute(
        `INSERT INTO issue_details (
          issue_date,
          nac_code,
          part_number,
          issue_quantity,
          issued_for,
          remaining_balance,
          issue_cost,
          issued_by,
          updated_by,
          issue_slip_number,
          current_fy,
          approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [
          formattedIssueDate,
          item.nacCode,
          item.partNumber,
          item.quantity,
          item.equipmentNumber,
          stockDetails.current_balance,
          issueCost,
          JSON.stringify(issuedBy),
          JSON.stringify(issuedBy),
          issueSlipNumber,
          currentFY
        ]
      );

      const issueId = (result as any).insertId;
      issueIds.push(issueId);

      logEvents(`Item issued successfully - NAC: ${item.nacCode}, Quantity: ${item.quantity} by user: ${issuedByName}`, "issueLog.log");
    }

    await connection.commit();
    logEvents(`Issue created successfully for date: ${formatDate(issueDate)} by user: ${issuedByName}`, "issueLog.log");
    res.status(201).json({
      message: 'Issue created successfully',
      issueDate: formatDate(issueDate),
      issueSlipNumber,
      issueIds
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error creating issue: ${errorMessage} by user: ${issuedBy.name}`, "issueLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while creating the issue'
    });
  } finally {
    connection.release();
  }
};

export const approveIssue = async (req: Request, res: Response): Promise<void> => {
  const { issueId } = req.params;
  const { approvedBy } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Split issueId into array if it contains commas
    const issueIds = issueId.split(',').map(id => id.trim());

    // Get all issue details
    const [issueDetails] = await connection.execute<RowDataPacket[]>(
      `SELECT 
        id,
        nac_code,
        issue_quantity,
        issue_slip_number
      FROM issue_details 
      WHERE id IN (?)`,
      [issueIds]
    );

    if (issueDetails.length === 0) {
      logEvents(`Failed to approve issue - No issues found with IDs: ${issueId}`, "issueLog.log");
      throw new Error('Issue records not found');
    }

    // Update all issues status
    await connection.execute(
      `UPDATE issue_details 
      SET approval_status = 'APPROVED',
          approved_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (?)`,
      [approvedBy, issueIds]
    );

    // Update stock balance for each issue
    for (const issue of issueDetails) {
      const [stockDetails] = await connection.execute<RowDataPacket[]>(
        'SELECT current_balance FROM stock_details WHERE nac_code = ?',
        [issue.nac_code]
      );

      if (stockDetails.length === 0) {
        throw new Error(`Stock not found for NAC code: ${issue.nac_code}`);
      }

      const currentBalance = stockDetails[0].current_balance;
      const newBalance = currentBalance - issue.issue_quantity;

      if (newBalance < 0) {
        throw new Error(`Insufficient balance for item ${issue.nac_code}`);
      }

      await connection.execute(
        'UPDATE stock_details SET current_balance = ? WHERE nac_code = ?',
        [newBalance, issue.nac_code]
      );
    }

    await connection.commit();
    logEvents(`Successfully approved issues with IDs: ${issueId} by user: ${approvedBy}`, "issueLog.log");
    res.status(200).json({
      message: 'Issues approved and stock updated successfully'
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error approving issues: ${errorMessage} for IDs: ${issueId}`, "issueLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while approving issues'
    });
  } finally {
    connection.release();
  }
};

export const rejectIssue = async (req: Request, res: Response): Promise<void> => {
  const { issueId } = req.params;
  const { rejectedBy, rejectionReason } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [issueDetails] = await connection.execute<RowDataPacket[]>(
      `SELECT id, issued_by, issue_slip_number 
      FROM issue_details 
      WHERE id = ?`,
      [issueId]
    );

    if (!issueDetails.length) {
      logEvents(`Failed to reject issue - Issue not found: ${issueId}`, "issueLog.log");
      throw new Error('Issue record not found');
    }

    const issuedBy = JSON.parse(issueDetails[0].issued_by);
    const issueSlipNumber = issueDetails[0].issue_slip_number;

    // Delete the issue record
    await connection.execute(
      'DELETE FROM issue_details WHERE id = ?',
      [issueId]
    );

    const [users] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM users WHERE username = ?',
      [issuedBy.name]
    );

    if (users.length === 0) {
      logEvents(`Failed to reject issue - User not found: ${issuedBy.name}`, "issueLog.log");
      res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
      return;
    }

    const userId = users[0].id;

    await connection.query(
      `INSERT INTO notifications 
       (user_id, reference_type, message, reference_id)
       VALUES (?, ?, ?, ?)`,
      [
        userId,
        'issue',
        `Your issue slip number ${issueSlipNumber} has been rejected for the following reason: ${rejectionReason}`,
        issueId
      ]
    );

    await connection.commit();
    logEvents(`Successfully rejected issue ID: ${issueId} with slip number: ${issueSlipNumber} by user: ${rejectedBy}`, "issueLog.log");
    res.status(200).json({
      message: 'Issue rejected successfully'
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error rejecting issue: ${errorMessage} for ID: ${issueId} by user: ${rejectedBy}`, "issueLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while rejecting issue'
    });
  } finally {
    connection.release();
  }
}; 