import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';

interface ConfigRow extends RowDataPacket {
    config_name: string;
    config_value: string;
}

interface RRPItem extends RowDataPacket {
    id: number;
    request_number: string;
    request_date: Date;
    receive_date: Date;
    equipment_number: string;
    requested_by: string;
    received_by: string;
    item_name: string;
    nac_code: string;
    part_number: string;
    received_quantity: number;
    unit: string;
}

export const getRRPConfig = async (req: Request, res: Response): Promise<void> => {
    try {
        // Query to get all RRP configurations
        const [rows] = await pool.query<ConfigRow[]>(
            'SELECT config_name, config_value FROM app_config WHERE config_type = ?',
            ['rrp']
        );

        // Convert rows to the desired format
        const config: Record<string, any> = {};
        rows.forEach(row => {
            // Try to parse JSON strings
            try {
                config[row.config_name] = JSON.parse(row.config_value);
            } catch {
                // If parsing fails, use the original string value
                config[row.config_name] = row.config_value;
            }
        });

        res.status(200).json(config);
    } catch (error) {
        console.error('Error fetching RRP configuration:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching RRP configuration'
        });
    }
};

export const getRRPItems = async (req: Request, res: Response): Promise<void> => {
    try {
        const [rows] = await pool.query<RRPItem[]>(
            `SELECT 
                rd.id,
                rq.request_number,
                rq.request_date,
                rd.receive_date,
                rq.equipment_number,
                rq.requested_by,
                rd.received_by,
                rd.item_name,
                rd.nac_code,
                rd.part_number,
                rd.received_quantity,
                rd.unit
            FROM receive_details rd
            JOIN request_details rq ON rd.request_fk = rq.id
            WHERE rd.approval_status = 'APPROVED'
            AND (rd.rrp_fk IS NULL OR rd.rrp_fk = '')
            ORDER BY rd.receive_date DESC`
        );

        // Format dates to YYYY/MM/DD
        const formattedItems = rows.map(item => ({
            ...item,
            request_date: new Date(item.request_date).toISOString().split('T')[0].replace(/-/g, '/'),
            receive_date: new Date(item.receive_date).toISOString().split('T')[0].replace(/-/g, '/')
        }));

        res.status(200).json(formattedItems);
    } catch (error) {
        console.error('Error fetching RRP items:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching RRP items'
        });
    }
}; 