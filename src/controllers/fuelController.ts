import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import { logEvents } from '../middlewares/logger';
import { createIssue } from './issueController';

interface FuelRecordResult {
  issue_id: number;
  fuel_id: number | null;
}

export const createFuelRecord = async (req: Request, res: Response): Promise<void> => {
  const { issue_date, issued_by, fuel_type, records } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const results: FuelRecordResult[] = [];

    for (const record of records) {
      const { quantity, equipment_number, kilometers, is_kilometer_reset } = record;
      const nac_code = fuel_type === 'Diesel' ? 'GT 07986' : 'GT 00000';

      // Create issue record using createIssue function
      const issueReq = {
        body: {
          issue_date,
          issued_by,
          records: [{
            quantity,
            nac_code,
            equipment_number
          }]
        }
      } as Request;

      const issueRes = {
        status: (code: number) => ({
          json: (data: any) => {
            if (code === 201) {
              results.push({
                issue_id: data.records[0].id,
                fuel_id: null
              });
            }
          }
        })
      } as Response;

      await createIssue(issueReq, issueRes);

      // Get the last inserted issue ID
      const issueId = results[results.length - 1].issue_id;

      // Create the fuel record
      const [fuelResult] = await connection.execute(
        `INSERT INTO fuel_records 
        (fuel_type, kilometers, issue_fk, is_kilometer_reset)
        VALUES (?, ?, ?, ?)`,
        [fuel_type, kilometers, issueId, is_kilometer_reset || 0]
      );

      results[results.length - 1].fuel_id = (fuelResult as any).insertId;
    }

    await connection.commit();
    logEvents(`Successfully created fuel records for date: ${issue_date}`, "fuelLog.log");
    res.status(201).json({
      message: 'Fuel records created successfully',
      records: results
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error creating fuel records: ${errorMessage}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while creating fuel records'
    });
  } finally {
    connection.release();
  }
};

export const updateFuelRecord = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { kilometers, fuel_type, is_kilometer_reset } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get the current fuel record with its issue details
    const [fuelDetails] = await connection.query<RowDataPacket[]>(
      `SELECT f.*, i.issue_quantity, i.nac_code 
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.id = ?`,
      [id]
    );

    if (fuelDetails.length === 0) {
      throw new Error('Fuel record not found');
    }

    const fuel = fuelDetails[0];

    // Update the fuel record
    await connection.execute(
      `UPDATE fuel_records 
       SET fuel_type = ?,
           kilometers = ?,
           is_kilometer_reset = ?,
           updated_datetime = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [fuel_type, kilometers, is_kilometer_reset || 0, id]
    );

    await connection.commit();
    logEvents(`Successfully updated fuel record ID: ${id}`, "fuelLog.log");
    res.status(200).json({
      message: 'Fuel record updated successfully'
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error updating fuel record: ${errorMessage} for ID: ${id}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while updating fuel record'
    });
  } finally {
    connection.release();
  }
};

export const deleteFuelRecord = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get the fuel record details before deletion
    const [fuelDetails] = await connection.query<RowDataPacket[]>(
      `SELECT f.*, i.issue_quantity, i.nac_code 
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.id = ?`,
      [id]
    );

    if (fuelDetails.length === 0) {
      throw new Error('Fuel record not found');
    }

    const fuel = fuelDetails[0];

    // Delete the fuel record (this will cascade delete the issue record)
    await connection.execute(
      'DELETE FROM fuel_records WHERE id = ?',
      [id]
    );

    await connection.commit();
    logEvents(`Successfully deleted fuel record ID: ${id}`, "fuelLog.log");
    res.status(200).json({
      message: 'Fuel record deleted successfully'
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error deleting fuel record: ${errorMessage} for ID: ${id}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while deleting fuel record'
    });
  } finally {
    connection.release();
  }
};

export const approveFuelRecord = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { approvedBy } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get the fuel record with its issue details
    const [fuelDetails] = await connection.query<RowDataPacket[]>(
      `SELECT f.*, i.issue_quantity, i.nac_code 
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.id = ?`,
      [id]
    );

    if (fuelDetails.length === 0) {
      throw new Error('Fuel record not found');
    }

    const fuel = fuelDetails[0];

    // Update the fuel record
    await connection.execute(
      `UPDATE fuel_records 
       SET approval_status = 'APPROVED',
           approved_by = ?,
           updated_datetime = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(approvedBy), id]
    );

    // Update the issue record
    await connection.execute(
      `UPDATE issue_details 
       SET approval_status = 'APPROVED',
           approved_by = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(approvedBy), fuel.issue_fk]
    );

    await connection.commit();
    logEvents(`Successfully approved fuel record ID: ${id}`, "fuelLog.log");
    res.status(200).json({
      message: 'Fuel record approved successfully'
    });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error approving fuel record: ${errorMessage} for ID: ${id}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while approving fuel record'
    });
  } finally {
    connection.release();
  }
};

export const getFuelConfig = async (req: Request, res: Response): Promise<void> => {
  const { type } = req.params;
  const connection = await pool.getConnection();

  try {
    // Get the equipment list from config
    const [configResult] = await connection.query<RowDataPacket[]>(
      'SELECT config_value FROM app_config WHERE config_name = ? AND config_type = "fuel"',
      [`valid_equipment_list_${type.toLowerCase()}`]
    );
    if (configResult.length === 0) {
      throw new Error('Fuel configuration not found');
    }

    // Clean and split the equipment list
    const equipmentList = configResult[0].config_value
      .replace(/\r\n/g, '')  // Remove newlines
      .split(',')
      .map((item: string) => item.trim())
      .filter((item: string) => item && !item.includes(' ')); // Remove empty items and items with spaces

    // Get latest kilometers for each equipment
    const [kilometerResults] = await connection.query<RowDataPacket[]>(
      `SELECT f.issue_fk, f.kilometers, i.nac_code
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE i.nac_code IN (?)
       AND f.id IN (
         SELECT MAX(id)
         FROM fuel_records
         GROUP BY issue_fk
       )
       ORDER BY f.created_datetime DESC`,
      [equipmentList]
    );

    // Create equipment-kilometer mapping
    const equipmentKilometers = equipmentList.reduce((acc: { [key: string]: number }, equipment: string) => {
      const record = kilometerResults.find(r => r.nac_code === equipment);
      acc[equipment] = record ? record.kilometers : 0;
      return acc;
    }, {});

    res.status(200).json({
      equipment_list: equipmentList,
      equipment_kilometers: equipmentKilometers
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error getting fuel config: ${errorMessage}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while getting fuel configuration'
    });
  } finally {
    connection.release();
  }
}; 