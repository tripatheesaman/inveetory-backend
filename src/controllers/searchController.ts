import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';

interface SearchResult extends RowDataPacket {
  id: number;
  nac_code: string;
  name: string;
  partNumber: string;
  equipmentNumber: string;
  currentBalance: number;
  location: string;
  cardNumber: string;
}

interface SearchError extends Error {
  code?: string;
  errno?: number;
  sqlState?: string;
  sqlMessage?: string;
}

export const searchStockDetails = async (req: Request, res: Response): Promise<void> => {
  const { universal, equipmentNumber, partNumber } = req.query;
  // Input validation
  if (!universal && !equipmentNumber && !partNumber) {
    res.status(400).json({ 
      error: 'Bad Request',
      message: 'At least one search parameter is required'
    });
    return;
  }

  try {
    // Build the base query
    let query = `
      SELECT 
        id,
        nac_code,
        item_name as name,
        part_numbers as partNumber,
        applicable_equipments as equipmentNumber,
        current_balance as currentBalance,
        location,
        card_number as cardNumber
      FROM stock_details
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    // Add search conditions
    if (universal) {
      // Try FULLTEXT search first
      try {
        const fulltextQuery = query + ` AND (
          MATCH(nac_code, item_name, part_numbers, applicable_equipments) AGAINST(? IN BOOLEAN MODE)
        ) LIMIT 50`;
        const [results] = await pool.execute<SearchResult[]>(fulltextQuery, [`${universal}*`]);
        res.json(results.length === 0 ? null : results);
        return;
      } catch (error) {
        const searchError = error as SearchError;
        if (searchError.code === 'ER_FT_MATCHING_KEY_NOT_FOUND') {
          // Fallback to LIKE search if FULLTEXT fails
          query += ` AND (
            nac_code LIKE ? OR
            item_name LIKE ? OR
            part_numbers LIKE ? OR
            applicable_equipments LIKE ?
          )`;
          params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
        } else {
          throw error;
        }
      }
    }

    if (equipmentNumber) {
      query += ` AND applicable_equipments LIKE ?`;
      params.push(`%${equipmentNumber}%`);
    }

    if (partNumber) {
      query += ` AND part_numbers LIKE ?`;
      params.push(`%${partNumber}%`);
    }

    // Add LIMIT to prevent overwhelming results
    query += ' LIMIT 50';

    const [results] = await pool.execute<SearchResult[]>(query, params);
    res.json(results.length === 0 ? null : results);
  } catch (error) {
    const searchError = error as SearchError;
    console.error('Search error:', searchError);

    // Handle specific MySQL errors
    if (searchError.code === 'ER_FT_MATCHING_KEY_NOT_FOUND') {
      res.status(400).json({
        error: 'Search Configuration Error',
        message: 'Full-text search is not properly configured',
        details: 'Please contact system administrator to set up the required FULLTEXT index',
        fallback: 'Using basic search instead'
      });
      return;
    }

    // Handle other database errors
    if (searchError.code?.startsWith('ER_')) {
      res.status(500).json({
        error: 'Database Error',
        message: 'An error occurred while searching',
        details: searchError.sqlMessage
      });
      return;
    }

    // Handle general errors
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      details: searchError.message
    });
  }
}; 