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

export const getRRPSuppliers = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT config_name, config_value 
       FROM app_config 
       WHERE config_name IN ('supplier_list_local', 'supplier_list_foreign')`
    );

    const suppliers = rows.reduce((acc: any, row) => {
      const type = row.config_name === 'supplier_list_local' ? 'local' : 'foreign';
      const names = row.config_value ? row.config_value.split(', ').map((name: string) => name.trim()) : [];
      
      return [
        ...acc,
        ...names.map((name: string, index: number) => ({
          id: `${type}-${index + 1}`,
          name,
          type
        }))
      ];
    }, []);

    res.status(200).json(suppliers);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in getRRPSuppliers: ${errorMessage}`, "settingsLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

export const addRRPSupplier = async (req: Request, res: Response): Promise<void> => {
  const { name, type } = req.body;
  const connection = await pool.getConnection();

  try {
    const configName = type === 'local' ? 'supplier_list_local' : 'supplier_list_foreign';
    
    // Get current list
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT config_value FROM app_config WHERE config_name = ?',
      [configName]
    );

    if (rows.length === 0) {
      // If no config exists, create new
      await connection.execute(
        'INSERT INTO app_config (config_name, config_value) VALUES (?, ?)',
        [configName, name]
      );
    } else {
      // Append to existing list
      const currentList = rows[0].config_value;
      const newList = currentList ? `${currentList}, ${name}` : name;
      
      await connection.execute(
        'UPDATE app_config SET config_value = ? WHERE config_name = ?',
        [newList, configName]
      );
    }

    res.status(201).json({
      id: `${type}-${Date.now()}`,
      name,
      type
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in addRRPSupplier: ${errorMessage}`, "settingsLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

export const updateRRPSupplier = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name, type } = req.body;
  const connection = await pool.getConnection();

  try {
    const configName = type === 'local' ? 'supplier_list_local' : 'supplier_list_foreign';
    
    // Get current list
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT config_value FROM app_config WHERE config_name = ?',
      [configName]
    );

    if (rows.length > 0) {
      const currentList = rows[0].config_value.split(', ');
      const index = parseInt(id.split('-')[1]) - 1;
      
      if (index >= 0 && index < currentList.length) {
        currentList[index] = name;
        const newList = currentList.join(', ');
        
        await connection.execute(
          'UPDATE app_config SET config_value = ? WHERE config_name = ?',
          [newList, configName]
        );

        res.status(200).json({
          id,
          name,
          type
        });
      } else {
        res.status(404).json({
          error: 'Not Found',
          message: 'Supplier not found'
        });
      }
    } else {
      res.status(404).json({
        error: 'Not Found',
        message: 'Supplier list not found'
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in updateRRPSupplier: ${errorMessage}`, "settingsLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

export const deleteRRPSupplier = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name, type } = req.body;
  const connection = await pool.getConnection();

  try {
    const configName = type === 'local' ? 'supplier_list_local' : 'supplier_list_foreign';
    
    // Get current list
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT config_value FROM app_config WHERE config_name = ?',
      [configName]
    );

    if (rows.length > 0) {
      const currentList = rows[0].config_value.split(', ');
      const index = currentList.findIndex((supplier: string) => supplier.trim() === name.trim());
      
      if (index >= 0) {
        currentList.splice(index, 1);
        const newList = currentList.join(', ');
        
        await connection.execute(
          'UPDATE app_config SET config_value = ? WHERE config_name = ?',
          [newList, configName]
        );

        res.status(200).json({
          message: 'Supplier deleted successfully'
        });
      } else {
        res.status(404).json({
          error: 'Not Found',
          message: 'Supplier not found'
        });
      }
    } else {
      res.status(404).json({
        error: 'Not Found',
        message: 'Supplier list not found'
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in deleteRRPSupplier: ${errorMessage}`, "settingsLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

export const getFuelSettings = async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    // 1. Get fuel authority details
    const [authorityRows] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM authority_details WHERE authority_type = ? ORDER BY id DESC LIMIT 1',
      ['fuel']
    );
    let authorityDetails;
    if (authorityRows.length === 0) {
      authorityDetails = [{
        id: 1,
        authority_type: 'fuel',
        level_1_authority_name: '',
        level_1_authority_staffid: '',
        level_1_authority_designation: null,
        level_2_authority_name: null,
        level_2_authority_staffid: null,
        level_2_authority_designation: null,
        level_3_authority_name: null,
        level_3_authority_staffid: null,
        level_3_authority_designation: null,
        quality_check_authority_name: null,
        quality_check_authority_staffid: null,
        quality_check_authority_designation: null,
        created_at: new Date(),
        updated_at: new Date()
      }];
    } else {
      authorityDetails = authorityRows;
    }

    // 2. Get valid equipment lists for petrol and diesel
    const [petrolConfig] = await connection.execute<RowDataPacket[]>(
      'SELECT config_value FROM app_config WHERE config_name = ? AND config_type = "fuel"',
      ['valid_equipment_list_petrol']
    );
    const [dieselConfig] = await connection.execute<RowDataPacket[]>(
      'SELECT config_value FROM app_config WHERE config_name = ? AND config_type = "fuel"',
      ['valid_equipment_list_diesel']
    );
    const petrolList = petrolConfig.length > 0 ? petrolConfig[0].config_value.replace(/\r\n/g, '').split(',').map((item: string) => item.trim()).filter((item: string) => item) : [];
    const dieselList = dieselConfig.length > 0 ? dieselConfig[0].config_value.replace(/\r\n/g, '').split(',').map((item: string) => item.trim()).filter((item: string) => item) : [];

    // 3. For each equipment, get the latest is_kilometer_reset value from fuel_records
    const allEquipment = Array.from(new Set([...petrolList, ...dieselList]));
    let equipmentStatus: { [key: string]: { is_kilometer_reset: boolean | null, kilometers: number | null } } = {};
    if (allEquipment.length > 0) {
      const [records] = await connection.query<RowDataPacket[]>(
        `SELECT fr.kilometers, fr.is_kilometer_reset, id.issued_for
         FROM fuel_records fr
         JOIN issue_details id ON fr.issue_fk = id.id
         WHERE id.issued_for IN (?)
         ORDER BY id.issue_date DESC, fr.id DESC`,
        [allEquipment]
      );
      // Map to latest per equipment
      for (const equipment of allEquipment) {
        const record = records.find((r: any) => r.issued_for === equipment);
        equipmentStatus[equipment] = record ? {
          is_kilometer_reset: !!record.is_kilometer_reset,
          kilometers: record.kilometers
        } : { is_kilometer_reset: null, kilometers: null };
      }
    }

    res.status(200).json({
      authorityDetails,
      petrolList,
      dieselList,
      equipmentStatus
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in getFuelSettings: ${errorMessage}`, "settingsLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
};

export const updateFuelSettings = async (req: Request, res: Response): Promise<void> => {
  const { authorityDetails, petrolList, dieselList, equipmentStatus } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Update authority details for fuel
    await connection.execute('DELETE FROM authority_details WHERE authority_type = ?', ['fuel']);
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
          'fuel',
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

    // 2. Update valid equipment lists in app_config
    const petrolListStr = petrolList.join(',');
    const dieselListStr = dieselList.join(',');
    // Petrol
    const [petrolConfig] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM app_config WHERE config_name = ? AND config_type = "fuel"',
      ['valid_equipment_list_petrol']
    );
    if (petrolConfig.length > 0) {
      await connection.execute(
        'UPDATE app_config SET config_value = ? WHERE config_name = ? AND config_type = "fuel"',
        [petrolListStr, 'valid_equipment_list_petrol']
      );
    } else {
      await connection.execute(
        'INSERT INTO app_config (config_name, config_value, config_type) VALUES (?, ?, "fuel")',
        ['valid_equipment_list_petrol', petrolListStr]
      );
    }
    // Diesel
    const [dieselConfig] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM app_config WHERE config_name = ? AND config_type = "fuel"',
      ['valid_equipment_list_diesel']
    );
    if (dieselConfig.length > 0) {
      await connection.execute(
        'UPDATE app_config SET config_value = ? WHERE config_name = ? AND config_type = "fuel"',
        [dieselListStr, 'valid_equipment_list_diesel']
      );
    } else {
      await connection.execute(
        'INSERT INTO app_config (config_name, config_value, config_type) VALUES (?, ?, "fuel")',
        ['valid_equipment_list_diesel', dieselListStr]
      );
    }

    // 3. For each equipment, if is_kilometer_reset is true, update the latest fuel_records
    for (const equipment of Object.keys(equipmentStatus)) {
      const status = equipmentStatus[equipment];
      if (status && status.is_kilometer_reset === true) {
        // Find the latest fuel_record for this equipment
        const [latest] = await connection.query<RowDataPacket[]>(
          `SELECT fr.id
           FROM fuel_records fr
           JOIN issue_details id ON fr.issue_fk = id.id
           WHERE id.issued_for = ?
           ORDER BY id.issue_date DESC, fr.id DESC
           LIMIT 1`,
          [equipment]
        );
        if (latest.length > 0) {
          await connection.execute(
            'UPDATE fuel_records SET is_kilometer_reset = 1 WHERE id = ?',
            [latest[0].id]
          );
        }
      }
    }

    await connection.commit();
    res.status(200).json({ message: 'Fuel settings updated successfully' });
  } catch (error) {
    await connection.rollback();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error in updateFuelSettings: ${errorMessage}`, "settingsLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  } finally {
    connection.release();
  }
}; 