import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket, PoolConnection } from 'mysql2/promise';
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

const calculateIssueCost = async (connection: PoolConnection, nacCode: string, quantity: number): Promise<number> => {
  // First check for received quantity and RRP total amount
  const [rrpResults] = await connection.query<RowDataPacket[]>(
    `SELECT 
      COALESCE(SUM(rd.received_quantity), 0) as total_received_quantity,
      COALESCE(SUM(rrp.total_amount), 0) as total_amount
    FROM receive_details rd
    JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
    WHERE rd.nac_code = ?
    AND rd.rrp_fk IS NOT NULL
    AND rrp.approval_status = 'APPROVED'`,
    [nacCode]
  );

  const totalReceivedQuantity = rrpResults[0].total_received_quantity;
  const totalAmount = rrpResults[0].total_amount;

  // If we have received quantity and total amount, use that for calculation
  if (totalReceivedQuantity > 0 && totalAmount > 0) {
    return (totalAmount / totalReceivedQuantity) * quantity;
  }

  // Fall back to open quantity logic if no RRP records found
  const [stockResults] = await connection.query<RowDataPacket[]>(
    'SELECT open_quantity, open_amount FROM stock_details WHERE nac_code = ?',
      [nacCode]
    );

  if (stockResults.length === 0) {
    return 0;
  }

  const { open_quantity, open_amount } = stockResults[0];
  if (open_quantity === 0 || open_amount === 0) {
    return 0;
  }

  return (open_amount / open_quantity) * quantity;
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

    // Get the day number based on days since first issue
    const [dayNumberResult] = await connection.query<RowDataPacket[]>(
      `SELECT 
        CASE 
          WHEN MIN(issue_date) IS NULL THEN 1
          ELSE DATEDIFF(?, MIN(issue_date)) + 1
        END as day_number
      FROM issue_details 
      WHERE current_fy = ?`,
      [formattedIssueDate, currentFY]
    );
    const dayNumber = dayNumberResult[0].day_number;

    const issueSlipNumber = `${dayNumber}Y${currentFY}`;
    const issueIds: number[] = [];

    for (const item of items) {
      // Get the latest issue before the current issue date
      const [previousIssues] = await connection.query<RowDataPacket[]>(
        `SELECT remaining_balance 
         FROM issue_details 
         WHERE nac_code = ? 
         AND issue_date < ? 
         AND approval_status = 'APPROVED'
         ORDER BY issue_date DESC, id DESC 
         LIMIT 1`,
        [item.nacCode, formattedIssueDate]
      );

      // Get current stock balance
      const [stockResults] = await connection.query<RowDataPacket[]>(
        'SELECT current_balance FROM stock_details WHERE nac_code = ?',
        [item.nacCode]
      );

      if (stockResults.length === 0) {
        logEvents(`Issue creation failed - Item not found: ${item.nacCode} by user: ${issuedByName}`, "issueLog.log");
        throw new Error(`Item with NAC code ${item.nacCode} not found`);
      }

      const stockDetails = stockResults[0];
      const issueCost = await calculateIssueCost(connection, item.nacCode, item.quantity);

      // Get all issues for this NAC code ordered by date
      const [allIssues] = await connection.execute<RowDataPacket[]>(
        `SELECT id, issue_date, issue_quantity, remaining_balance
         FROM issue_details
         WHERE nac_code = ?
         ORDER BY issue_date ASC`,
        [item.nacCode]
      );

      // Split issues into before and after current issue date
      const beforeIssues = allIssues.filter(issue => issue.issue_date < formattedIssueDate!);
      const afterIssues = allIssues.filter(issue => issue.issue_date >= formattedIssueDate!);

      // Calculate adjusted balance
      let adjustedBalance;
      if (beforeIssues.length === 0) {
        // If no previous issues, use the minimum balance from after issues
        adjustedBalance = afterIssues.length > 0 
          ? Math.min(...afterIssues.map(issue => issue.remaining_balance))
          : stockDetails.current_balance;
      } else {
        // Use max balance from before issues minus current issue quantity
        const maxBalance = Math.max(...beforeIssues.map(issue => issue.remaining_balance));
        adjustedBalance = maxBalance - item.quantity;
      }

      // Insert the new issue record
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
          0,
          issueCost,
          JSON.stringify(issuedBy),
          JSON.stringify(issuedBy),
          issueSlipNumber,
          currentFY
        ]
      );

      const issueId = (result as any).insertId;
      issueIds.push(issueId);

      // Update stock balance immediately
      await connection.execute(
        'UPDATE stock_details SET current_balance = current_balance - ? WHERE nac_code = ?',
        [item.quantity, item.nacCode]
      );

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
    logEvents(`Error in createIssue: ${errorMessage}`, "issueLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

export const approveIssue = async (req: Request, res: Response): Promise<void> => {
  const { itemIds, approvedBy } = req.body;
  const connection = await pool.getConnection();
  const issueIds = Array.isArray(itemIds) ? itemIds : [itemIds];

  try {
    await connection.beginTransaction();

    if (!issueIds.length) {
      throw new Error('No issue IDs provided');
    }

    // First check if the issues exist and are pending
    const [issueCheck] = await connection.execute<RowDataPacket[]>(
      `SELECT id, approval_status 
       FROM issue_details 
       WHERE id IN (${issueIds.map(() => '?').join(',')})`,
      issueIds
    );

    if (issueCheck.length === 0) {
      logEvents(`Failed to approve issues - No issues found with IDs: ${issueIds.join(', ')}`, "issueLog.log");
      throw new Error('Issue records not found');
    }

    // Check if any issues are already approved
    const alreadyApproved = issueCheck.filter(issue => issue.approval_status === 'APPROVED');
    if (alreadyApproved.length > 0) {
      logEvents(`Failed to approve issues - Some issues are already approved: ${alreadyApproved.map(i => i.id).join(', ')}`, "issueLog.log");
      throw new Error(`Issues ${alreadyApproved.map(i => i.id).join(', ')} are already approved`);
    }

    // Get all issue details
    const [issueDetails] = await connection.execute<RowDataPacket[]>(
      `SELECT 
        i.id,
        i.nac_code,
        i.issue_quantity,
        i.issue_date,
        i.issue_slip_number,
        s.current_balance
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.id IN (${issueIds.map(() => '?').join(',')})`,
      issueIds
    );

    // Process each issue
    for (const issue of issueDetails) {
      // Get all issues for this NAC code ordered by date
      const [allIssues] = await connection.execute<RowDataPacket[]>(
        `SELECT id, issue_date, issue_quantity, remaining_balance
         FROM issue_details
         WHERE nac_code = ?
         ORDER BY issue_date ASC`,
        [issue.nac_code]
      );

      // Split issues into before and after current issue date
      const beforeIssues = allIssues.filter(i => i.issue_date < issue.issue_date);
      const afterIssues = allIssues.filter(i => i.issue_date >= issue.issue_date);

      // Calculate adjusted balance
      let adjustedBalance;
      if (beforeIssues.length === 0) {
        // If no previous issues, use the minimum balance from after issues
        adjustedBalance = afterIssues.length > 0 
          ? Math.min(...afterIssues.map(i => i.remaining_balance))
          : issue.current_balance;
      } else {
        // Use max balance from before issues minus current issue quantity
        const maxBalance = Math.max(...beforeIssues.map(i => i.remaining_balance));
        adjustedBalance = maxBalance - issue.issue_quantity;
      }

      // Update the current issue's remaining balance
      await connection.execute(
        'UPDATE issue_details SET remaining_balance = ? WHERE id = ?',
        [adjustedBalance, issue.id]
      );

      // Update subsequent issues' remaining balances
      let runningBalance = adjustedBalance;
      for (const afterIssue of afterIssues) {
        if (afterIssue.id === issue.id) continue; // Skip the current issue
        runningBalance -= afterIssue.issue_quantity;
        await connection.execute(
          'UPDATE issue_details SET remaining_balance = ? WHERE id = ?',
          [runningBalance, afterIssue.id]
        );
      }
    }

    // Update all issues status
    await connection.execute(
      `UPDATE issue_details 
      SET approval_status = 'APPROVED',
          approved_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${issueIds.map(() => '?').join(',')})`,
      [approvedBy, ...issueIds]
    );

    await connection.commit();
    logEvents(`Successfully approved issues with IDs: ${issueIds.join(', ')} by user: ${approvedBy}`, "issueLog.log");
    res.status(200).json({
      message: 'Issues approved and stock updated successfully',
      approvedCount: issueDetails.length
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error approving issues: ${errorMessage} for IDs: ${issueIds.join(', ')}`, "issueLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while approving issues'
    });
  } finally {
    connection.release();
  }
};

export const rejectIssue = async (req: Request, res: Response): Promise<void> => {
  const { itemIds, rejectedBy } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get issue details for notifications, logging, and stock updates
    const [issueDetails] = await connection.execute<RowDataPacket[]>(
      `SELECT 
        i.id, 
        i.issue_slip_number, 
        i.issued_by, 
        i.issue_date,
        i.nac_code,
        i.issue_quantity
      FROM issue_details i
      WHERE i.id IN (${Array.isArray(itemIds) ? itemIds.map(() => '?').join(',') : '?'})`,
      Array.isArray(itemIds) ? itemIds : [itemIds]
    );

    if (issueDetails.length === 0) {
      logEvents(`Failed to reject issues - No issues found with IDs: ${Array.isArray(itemIds) ? itemIds.join(', ') : itemIds}`, "issueLog.log");
      throw new Error('Issue records not found');
    }

    // Get the first issue's issued_by for notification
    const issuedBy = JSON.parse(issueDetails[0].issued_by);
    
    const [users] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM users WHERE username = ?',
      [issuedBy.staffId]
    );

    if (users.length > 0) {
      const userId = users[0].id;
      // Create a single notification with all issue details
      const issueDetailsText = issueDetails.map(issue => 
        `Issue Slip: ${issue.issue_slip_number} (${formatDate(issue.issue_date)})`
      ).join(', ');

      await connection.query(
        `INSERT INTO notifications 
         (user_id, reference_type, message, reference_id)
         VALUES (?, ?, ?, ?)`,
        [
          userId,
          'issue',
          `Your issues have been rejected: ${issueDetailsText}`,
          issueDetails[0].id
        ]
      );
    }

    // Add back quantities to stock for each issue
    for (const issue of issueDetails) {
      await connection.execute(
        'UPDATE stock_details SET current_balance = current_balance + ? WHERE nac_code = ?',
        [issue.issue_quantity, issue.nac_code]
      );
    }

    // Delete all the issue records
    await connection.execute(
      `DELETE FROM issue_details WHERE id IN (${Array.isArray(itemIds) ? itemIds.map(() => '?').join(',') : '?'})`,
      Array.isArray(itemIds) ? itemIds : [itemIds]
    );

    await connection.commit();
    logEvents(`Successfully rejected issues with IDs: ${Array.isArray(itemIds) ? itemIds.join(', ') : itemIds} by user: ${rejectedBy}`, "issueLog.log");
    res.status(200).json({
      message: 'Issues rejected successfully',
      rejectedCount: issueDetails.length
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error rejecting issues: ${errorMessage} for IDs: ${Array.isArray(itemIds) ? itemIds.join(', ') : itemIds}`, "issueLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while rejecting issues'
    });
  } finally {
    connection.release();
  }
};

export const getPendingIssues = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    const [issues] = await connection.execute<RowDataPacket[]>(
      `SELECT 
        i.id,
        i.nac_code,
        i.part_number,
        i.issue_quantity,
        i.issue_cost,
        i.remaining_balance,
        i.issue_slip_number,
        i.issued_by,
        i.issued_for,
        SUBSTRING_INDEX(s.item_name, ',', 1) as item_name
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.approval_status = 'PENDING'
      ORDER BY i.issue_date DESC`
    );

    // Parse the issued_by JSON string for each issue
    const formattedIssues = issues.map(issue => ({
      ...issue,
      issued_by: JSON.parse(issue.issued_by)
    }));

    logEvents(`Successfully retrieved ${formattedIssues.length} pending issues`, "issueLog.log");
    res.status(200).json({
      message: 'Pending issues retrieved successfully',
      issues: formattedIssues
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error retrieving pending issues: ${errorMessage}`, "issueLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while retrieving pending issues'
    });
  } finally {
    connection.release();
  }
};

export const updateIssueItem = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { quantity } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get the current issue details
    const [issueDetails] = await connection.query<RowDataPacket[]>(
      `SELECT 
        i.nac_code,
        i.issue_quantity,
        i.issue_slip_number,
        s.current_balance
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.id = ?`,
      [id]
    );

    if (issueDetails.length === 0) {
      throw new Error('Issue item not found');
    }

    const issue = issueDetails[0];
    const quantityDifference = quantity - issue.issue_quantity;

    // Calculate new issue cost
    const issueCost = await calculateIssueCost(connection, issue.nac_code, quantity);

    // Update the issue details
    await connection.execute(
      `UPDATE issue_details 
      SET issue_quantity = ?,
          issue_cost = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [quantity, issueCost, id]
    );

    // Update stock balance based on quantity difference
    if (quantityDifference !== 0) {
      // If quantity increased, subtract the difference
      // If quantity decreased, add back the difference
      await connection.execute(
        'UPDATE stock_details SET current_balance = current_balance - ? WHERE nac_code = ?',
        [quantityDifference, issue.nac_code]
      );
    }

    await connection.commit();
    logEvents(`Successfully updated issue item ID: ${id} with new quantity: ${quantity}`, "issueLog.log");
    res.status(200).json({
      message: 'Issue item updated successfully',
      issueSlipNumber: issue.issue_slip_number
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error updating issue item: ${errorMessage} for ID: ${id}`, "issueLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while updating issue item'
    });
  } finally {
    connection.release();
  }
};

export const deleteIssueItem = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get the current issue details
    const [issueDetails] = await connection.execute<RowDataPacket[]>(
      `SELECT 
        i.nac_code,
        i.issue_quantity,
        i.issue_slip_number,
        s.current_balance
      FROM issue_details i
      LEFT JOIN stock_details s ON i.nac_code COLLATE utf8mb4_unicode_ci = s.nac_code COLLATE utf8mb4_unicode_ci
      WHERE i.id = ?`,
      [id]
    );

    if (issueDetails.length === 0) {
      throw new Error('Issue item not found');
    }

    const issue = issueDetails[0];

    // Delete the issue item
    await connection.execute(
      'DELETE FROM issue_details WHERE id = ?',
      [id]
    );

    // Add back the quantity to stock balance
    await connection.execute(
      'UPDATE stock_details SET current_balance = current_balance + ? WHERE nac_code = ?',
      [issue.issue_quantity, issue.nac_code]
    );

    await connection.commit();
    logEvents(`Successfully deleted issue item ID: ${id}`, "issueLog.log");
    res.status(200).json({
      message: 'Issue item deleted successfully',
      issueSlipNumber: issue.issue_slip_number
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error deleting issue item: ${errorMessage} for ID: ${id}`, "issueLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while deleting issue item'
    });
  } finally {
    connection.release();
  }
};

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
    `;

    const queryParams: any[] = [fromDate, toDate];

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

    logEvents(`Successfully generated daily issue report from ${fromDate} to ${toDate}${equipmentNumber ? ` for equipment ${equipmentNumber}` : ''}`, "issueLog.log");
    res.status(200).json({
      message: 'Daily issue report generated successfully',
      issues: formattedIssues
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error generating daily issue report: ${errorMessage}`, "issueLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while generating the report'
    });
  } finally {
    connection.release();
  }
}; 