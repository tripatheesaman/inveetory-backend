import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';

interface StockBalance extends RowDataPacket {
  current_balance: number;
}

export const updateStock = async (req: Request, res: Response): Promise<void> => {
  const { stockId, transactionType, quantity, referenceNumber, notes, updatedBy } = req.body;

  try {
    // Start transaction
    await pool.execute('START TRANSACTION');

    // Get current stock details
    const [currentStock] = await pool.execute<StockBalance[]>(
      'SELECT current_balance FROM stock_details WHERE id = ? FOR UPDATE',
      [stockId]
    );

    if (!currentStock || currentStock.length === 0) {
      throw new Error('Stock item not found');
    }

    const previousBalance = currentStock[0].current_balance;
    let newBalance = previousBalance;

    // Calculate new balance based on transaction type
    switch (transactionType) {
      case 'issue':
        newBalance = previousBalance - quantity;
        break;
      case 'receive':
        newBalance = previousBalance + quantity;
        break;
      case 'adjustment':
        newBalance = quantity; // Direct set for adjustments
        break;
      default:
        throw new Error('Invalid transaction type');
    }

    // Update stock details
    await pool.execute(
      `UPDATE stock_details 
       SET current_balance = ?, 
           updated_at = CURRENT_TIMESTAMP,
           updated_by = ?
       WHERE id = ?`,
      [newBalance, updatedBy, stockId]
    );

    // Record transaction
    await pool.execute(
      `INSERT INTO stock_transactions 
       (stock_id, transaction_type, quantity, previous_balance, new_balance, reference_number, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [stockId, transactionType, quantity, previousBalance, newBalance, referenceNumber, notes, updatedBy]
    );

    // Commit transaction
    await pool.execute('COMMIT');

    res.json({
      success: true,
      message: 'Stock updated successfully',
      data: {
        stockId,
        previousBalance,
        newBalance,
        transactionType
      }
    });
  } catch (error: unknown) {
    // Rollback transaction on error
    await pool.execute('ROLLBACK');
    console.error('Transaction error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ 
      error: 'Failed to update stock',
      details: errorMessage 
    });
  }
}; 