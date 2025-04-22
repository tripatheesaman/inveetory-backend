import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';

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

// Function to get current balance for a NAC code
const getCurrentBalance = async (nacCode: string): Promise<number> => {
  try {
    const [results] = await pool.execute<StockDetails[]>(
      'SELECT current_balance FROM stock_details WHERE nac_code = ?',
      [nacCode]
    );
    return results[0]?.current_balance || 0;
  } catch (error) {
    console.error('Error getting current balance:', error);
    throw error;
  }
};

// Function to calculate issue cost
const calculateIssueCost = (openAmount: number, openQuantity: number, quantity: number): number => {
  if (openAmount === 0 || openQuantity === 0) return 0;
  return (openAmount / openQuantity) * quantity;
};

// Function to format date for MySQL
const formatDateForMySQL = (isoDate: string): string => {
  const date = new Date(isoDate);
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

export const createIssue = async (req: Request, res: Response): Promise<void> => {
  const { issueDate, items, issuedBy }: IssueRequest = req.body;
  console.log("reacehd")
  if (!issueDate || !items || !items.length || !issuedBy) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Missing required fields'
    });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Format the date for MySQL
    const formattedIssueDate = formatDateForMySQL(issueDate);

    for (const item of items) {
      // Get current stock details
      const [stockResults] = await connection.execute<StockDetails[]>(
        'SELECT current_balance, open_quantity, open_amount FROM stock_details WHERE nac_code = ?',
        [item.nacCode]
      );

      if (stockResults.length === 0) {
        throw new Error(`Item with NAC code ${item.nacCode} not found`);
      }

      const stockDetails = stockResults[0];
      const newBalance = stockDetails.current_balance - item.quantity;

      if (newBalance < 0) {
        throw new Error(`Insufficient balance for item ${item.nacCode}`);
      }

      // Update stock balance
      await connection.execute(
        'UPDATE stock_details SET current_balance = ? WHERE nac_code = ?',
        [newBalance, item.nacCode]
      );

      // Calculate issue cost
      const issueCost = calculateIssueCost(
        stockDetails.open_amount,
        stockDetails.open_quantity,
        item.quantity
      );

      // Create issue record
      await connection.execute(
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
          issued_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          formattedIssueDate,
          item.nacCode,
          item.partNumber,
          item.quantity,
          item.equipmentNumber,
          newBalance,
          issueCost,
          JSON.stringify(issuedBy),
          JSON.stringify(issuedBy)
        ]
      );
    }

    await connection.commit();
    res.status(201).json({
      message: 'Issue created successfully',
      issueDate,
      items
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating issue:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while creating the issue'
    });
  } finally {
    connection.release();
  }
}; 