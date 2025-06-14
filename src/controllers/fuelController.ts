import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import { logEvents } from '../middlewares/logger';
import { createIssue } from './issueController';

interface FuelRecordResult {
  issue_id: number;
  fuel_id: number | null;
}

interface FuelRecord {
  equipment_number: string;
  kilometers: number;
  quantity: number;
  is_kilometer_reset: boolean;
}

interface FuelPayload {
  issue_date: string;
  issued_by: string;
  fuel_type: string;
  price: number;
  records: FuelRecord[];
}

export const createFuelRecord = async (req: Request, res: Response): Promise<void> => {
  const payload: FuelPayload = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get the correct NAC code based on fuel type
    const getNacCode = (fuelType: string) => {
      switch (fuelType.toLowerCase()) {
        case 'diesel':
          return 'GT 07986';
        case 'petrol':
          return 'GT 00000';
        default:
          throw new Error(`Invalid fuel type: ${fuelType}`);
      }
    };

    // Check if stock exists for each equipment and create if needed
    for (const record of payload.records) {
      const nacCode = getNacCode(payload.fuel_type);
      
      // First check with exact match
      const [stockResults] = await connection.query<RowDataPacket[]>(
        'SELECT id, nac_code FROM stock_details WHERE nac_code = ? COLLATE utf8mb4_unicode_ci',
        [nacCode]
      );

      if (stockResults.length === 0) {
        // Create stock record if it doesn't exist
        const [insertResult] = await connection.query(
          `INSERT INTO stock_details 
          (nac_code, item_name, part_numbers, applicable_equipments, current_balance, unit) 
          VALUES (?, ?, ?, ?, ?, ?)`,
          [
            nacCode,
            `${payload.fuel_type.charAt(0).toUpperCase() + payload.fuel_type.slice(1)} Fuel`,
            'N/A',
            record.equipment_number,
            0,
            'Liters'
          ]
        );
        
        // Verify the stock was created
        const [verifyResults] = await connection.query<RowDataPacket[]>(
          'SELECT id, nac_code FROM stock_details WHERE id = ?',
          [(insertResult as any).insertId]
        );
        
        if (verifyResults.length === 0) {
          throw new Error(`Failed to create stock record for fuel type ${payload.fuel_type}`);
        }
        
        logEvents(`Created stock record for fuel type ${payload.fuel_type} with NAC code: ${nacCode}`, "fuelLog.log");
      } else {
        logEvents(`Found existing stock record for fuel type ${payload.fuel_type} with NAC code: ${nacCode}`, "fuelLog.log");
      }
    }

    // Create issue record using createIssue function
    const issueReq = {
      body: {
        issueDate: payload.issue_date,
        issuedBy: {
          name: payload.issued_by,
          staffId: payload.issued_by
        },
        items: payload.records.map(record => ({
          nacCode: getNacCode(payload.fuel_type),
          quantity: record.quantity,
          equipmentNumber: record.equipment_number,
          partNumber: 'N/A'
        }))
      }
    } as Request;

    let issueIds: number[] = [];

    const issueRes = {
      status: (code: number) => ({
        json: (data: any) => {
          logEvents(`CreateIssue response data: ${JSON.stringify(data)}`, "fuelLog.log");
          
          if (code === 201) {
            if (data.issueIds && Array.isArray(data.issueIds)) {
              issueIds = data.issueIds;
              logEvents(`Issue records created successfully with IDs: ${issueIds.join(', ')}`, "fuelLog.log");
            } else {
              logEvents(`Failed to find issue IDs in response: ${JSON.stringify(data)}`, "fuelLog.log");
            }
          } else {
            logEvents(`Failed to create issue record. Status: ${code}, Response: ${JSON.stringify(data)}`, "fuelLog.log");
          }
        }
      })
    } as Response;

    try {
      logEvents(`Sending createIssue request: ${JSON.stringify(issueReq.body)}`, "fuelLog.log");
      await createIssue(issueReq, issueRes);
      
      if (issueIds.length === 0) {
        throw new Error('Failed to create issue record - No issue IDs returned');
      }
    } catch (error) {
      logEvents(`Error in createIssue: ${error instanceof Error ? error.message : 'Unknown error'}`, "fuelLog.log");
      throw new Error('Failed to create issue record');
    }

    // Create fuel records for each equipment
    for (let i = 0; i < payload.records.length; i++) {
      const record = payload.records[i];
      const issueId = issueIds[i];
      // Create fuel record
      const [fuelResult] = await connection.query<RowDataPacket[]>(
        `INSERT INTO fuel_records 
        (fuel_type, kilometers, issue_fk, is_kilometer_reset, fuel_price) 
        VALUES (?, ?, ?, ?, ?)`,
        [
          payload.fuel_type,
          record.kilometers,
          issueId,
          record.is_kilometer_reset ? 1 : 0,
          payload.price
        ]
      );

      const fuelId = (fuelResult as any).insertId;

      // Log the creation
      logEvents(
        `Fuel record created - Issue ID: ${issueId}, Fuel ID: ${fuelId}, Equipment: ${record.equipment_number}, Fuel Type: ${payload.fuel_type}`,
        "fuelLog.log"
      );
    }

    await connection.commit();

    res.status(201).json({
      message: 'Fuel records created successfully',
      issue_ids: issueIds
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
      `SELECT fr.kilometers, fr.is_kilometer_reset, id.issued_for
       FROM fuel_records fr
       JOIN issue_details id ON fr.issue_fk = id.id
       WHERE id.issued_for IN (?)
       AND (id.issued_for, id.issue_date, fr.id) IN (
         SELECT id2.issued_for, id2.issue_date, MAX(fr2.id)
         FROM fuel_records fr2
         JOIN issue_details id2 ON fr2.issue_fk = id2.id
         WHERE id2.issued_for IN (?)
         GROUP BY id2.issued_for, id2.issue_date
       )
       ORDER BY id.issue_date DESC, fr.id DESC`,
      [equipmentList, equipmentList]
    );

    // Get the latest fuel price for the type
    const [priceResult] = await connection.query<RowDataPacket[]>(
      `SELECT fuel_price 
       FROM fuel_records 
       WHERE fuel_type = ?
       ORDER BY created_datetime DESC 
       LIMIT 1`,
      [type]
    );
    const latestFuelPrice = priceResult.length > 0 ? priceResult[0].fuel_price : 0;

    // Create equipment-kilometer mapping
    const equipmentKilometers = equipmentList.reduce((acc: { [key: string]: number }, equipment: string) => {
      const record = kilometerResults.find(r => r.issued_for === equipment);
      acc[equipment] = record && !record.is_kilometer_reset ? record.kilometers : 0;
      return acc;
    }, {});

    res.status(200).json({
      equipment_list: equipmentList,
      equipment_kilometers: equipmentKilometers,
      latest_fuel_price: latestFuelPrice
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error getting fuel config: ${errorMessage}`, "fuelLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An error occurred while getting fuel config'
    });
  } finally {
    connection.release();
  }
}; 