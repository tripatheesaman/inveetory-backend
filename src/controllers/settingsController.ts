import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';

export const getFiscalYear = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT config_value FROM app_config WHERE config_name = ?',
      ['current_fy']
    );

    if (rows.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Fiscal year configuration not found'
      });
      return;
    }

    res.status(200).json({
      fiscalYear: rows[0].config_value
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in getFiscalYear: ${errorMessage}`, "settingsLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

export const updateFiscalYear = async (req: Request, res: Response): Promise<void> => {
  const { fiscalYear } = req.body;
  const connection = await pool.getConnection();

  try {
    if (!fiscalYear) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Fiscal year is required'
      });
      return;
    }

    // Validate fiscal year format (YYYY/YY)
    const fiscalYearRegex = /^\d{4}\/\d{2}$/;
    if (!fiscalYearRegex.test(fiscalYear)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid fiscal year format. Must be in format YYYY/YY (e.g., 2081/82)'
      });
      return;
    }

    const [result] = await connection.execute(
      'UPDATE app_config SET config_value = ? WHERE config_name = ?',
      [fiscalYear, 'current_fy']
    );

    if ((result as any).affectedRows === 0) {
      // If no rows were updated, insert a new record
      await connection.execute(
        'INSERT INTO app_config (config_name, config_value) VALUES (?, ?)',
        ['current_fy', fiscalYear]
      );
    }

    res.status(200).json({
      message: 'Fiscal year updated successfully',
      fiscalYear
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in updateFiscalYear: ${errorMessage}`, "settingsLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

export const getRequestAuthorityDetails = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM authority_details WHERE authority_type = ?',
      ['request']
    );

    res.status(200).json(rows);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in getRequestAuthorityDetails: ${errorMessage}`, "settingsLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

export const updateRequestAuthorityDetails = async (req: Request, res: Response): Promise<void> => {
  const { authorityDetails } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Delete existing request authority details
    await connection.execute(
      'DELETE FROM authority_details WHERE authority_type = ?',
      ['request']
    );

    // Insert new authority details
    for (const auth of authorityDetails) {
      await connection.execute(
        `INSERT INTO authority_details (
          authority_type,
          level_1_authority_name,
          level_1_authority_staffid,
          level_1_authority_designation,
          level_2_authority_name,
          level_2_authority_staffid,
          level_2_authority_designation,
          level_3_authority_name,
          level_3_authority_staffid,
          level_3_authority_designation,
          quality_check_authority_name,
          quality_check_authority_staffid,
          quality_check_authority_designation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'request',
          auth.level_1_authority_name,
          auth.level_1_authority_staffid,
          auth.level_1_authority_designation,
          auth.level_2_authority_name,
          auth.level_2_authority_staffid,
          auth.level_2_authority_designation,
          auth.level_3_authority_name,
          auth.level_3_authority_staffid,
          auth.level_3_authority_designation,
          auth.quality_check_authority_name,
          auth.quality_check_authority_staffid,
          auth.quality_check_authority_designation
        ]
      );
    }

    await connection.commit();
    res.status(200).json({ message: 'Authority details updated successfully' });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in updateRequestAuthorityDetails: ${errorMessage}`, "settingsLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

export const getRRPAuthorityDetails = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM authority_details WHERE authority_type = ?',
      ['rrp']
    );

    res.status(200).json(rows);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in getRRPAuthorityDetails: ${errorMessage}`, "settingsLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

export const updateRRPAuthorityDetails = async (req: Request, res: Response): Promise<void> => {
  const { authorityDetails } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Delete existing RRP authority details
    await connection.execute(
      'DELETE FROM authority_details WHERE authority_type = ?',
      ['rrp']
    );

    // Insert new authority details
    for (const auth of authorityDetails) {
      await connection.execute(
        `INSERT INTO authority_details (
          authority_type,
          level_1_authority_name,
          level_1_authority_staffid,
          level_1_authority_designation,
          level_2_authority_name,
          level_2_authority_staffid,
          level_2_authority_designation,
          level_3_authority_name,
          level_3_authority_staffid,
          level_3_authority_designation,
          quality_check_authority_name,
          quality_check_authority_staffid,
          quality_check_authority_designation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'rrp',
          auth.level_1_authority_name,
          auth.level_1_authority_staffid,
          auth.level_1_authority_designation,
          auth.level_2_authority_name,
          auth.level_2_authority_staffid,
          auth.level_2_authority_designation,
          auth.level_3_authority_name,
          auth.level_3_authority_staffid,
          auth.level_3_authority_designation,
          auth.quality_check_authority_name,
          auth.quality_check_authority_staffid,
          auth.quality_check_authority_designation
        ]
      );
    }

    await connection.commit();
    res.status(200).json({ message: 'Authority details updated successfully' });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in updateRRPAuthorityDetails: ${errorMessage}`, "settingsLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
}; 