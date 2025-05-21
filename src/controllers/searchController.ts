import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';

interface SearchResult extends RowDataPacket {
  id: number;
  nacCode: string;
  itemName: string;
  partNumber: string;
  equipmentNumber: string;
  currentBalance: number;
  location: string;
  cardNumber: string;
}

interface ItemDetails extends RowDataPacket {
  id: number;
  nacCode: string;
  itemName: string;
  partNumber: string;
  equipmentNumber: string;
  currentBalance: number;
  location: string;
  cardNumber: string;
  unit: string;
  openQuantity: number;
  openAmount: number;
  imageUrl: string;
  altText: string;
  trueBalance: number;
  averageCostPerUnit: number;
}

interface SearchError extends Error {
  code?: string;
  errno?: number;
  sqlState?: string;
  sqlMessage?: string;
}

export const getItemDetails = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Item ID is required'
    });
    return;
  }

  try {
    const query = `
      WITH stock_info AS (
        SELECT 
          sd.id,
          sd.nac_code,
          sd.item_name,
          sd.part_numbers,
          sd.applicable_equipments,
          sd.current_balance,
          sd.location,
          sd.card_number,
          sd.unit,
          sd.open_quantity,
          sd.open_amount,
          sd.image_url,
          CASE 
            WHEN INSTR(sd.item_name, ',') > 0 
            THEN SUBSTRING_INDEX(sd.item_name, ',', 1)
            ELSE sd.item_name
          END as altText,
          COALESCE(sd.open_quantity, 0) as openQuantity,
          (
            SELECT COALESCE(SUM(rd.received_quantity), 0)
            FROM receive_details rd
            WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
            AND rd.rrp_fk IS NOT NULL
          ) as rrpQuantity,
          (
            SELECT COALESCE(SUM(id.issue_quantity), 0)
            FROM issue_details id
            WHERE id.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
          ) as issueQuantity,
          (
            SELECT COALESCE(SUM(rrp.total_amount), 0)
            FROM receive_details rd
            JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
            JOIN request_details rqd ON rd.request_fk = rqd.id
            WHERE rqd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
            AND rd.rrp_fk IS NOT NULL
          ) as totalCost
        FROM stock_details sd
        WHERE sd.id = ?
      )
      SELECT 
        id,
        nac_code as nacCode,
        item_name as itemName,
        part_numbers as partNumber,
        applicable_equipments as equipmentNumber,
        current_balance as currentBalance,
        location,
        card_number as cardNumber,
        unit,
        openQuantity,
        open_amount as openAmount,
        image_url as imageUrl,
        altText,
        openQuantity,
        rrpQuantity,
        issueQuantity,
        (openQuantity + rrpQuantity - issueQuantity) as trueBalance,
        CASE 
          WHEN rrpQuantity > 0 
          THEN totalCost / rrpQuantity
          ELSE 0 
        END as averageCostPerUnit
      FROM stock_info
    `;

    const [results] = await pool.execute<ItemDetails[]>(query, [id]);

    if (results.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Item not found'
      });
      return;
    }

    res.json(results[0]);
  } catch (error) {
    const searchError = error as SearchError;
    console.error('Error fetching item details:', searchError);

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while fetching item details',
      details: searchError.message
    });
  }
};

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
        nac_code as nacCode,
        item_name as itemName,
        part_numbers as partNumber,
        applicable_equipments as equipmentNumber,
        current_balance as currentBalance,
        location,
        card_number as cardNumber
      FROM stock_details
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    // Add search conditions with AND logic
    if (universal) {
      // Try FULLTEXT search first
      try {
        query += ` AND (
          MATCH(nac_code, item_name, part_numbers, applicable_equipments) AGAINST(? IN BOOLEAN MODE)
        )`;
        params.push(`${universal}*`);
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