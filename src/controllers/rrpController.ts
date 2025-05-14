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

interface RRPSubmissionItem {
    receive_id: number;
    price: number;
    vat_status: boolean;
    customs_charge: number;
    quantity: number;
    unit: string;
    nac_code: string;
    item_name: string;
    part_number: string;
    equipment_number: string;
    request_number: string;
    request_date: string;
    currency: string;
    forex_rate: number;
}

interface RRPSubmission {
    type: 'local' | 'foreign';
    rrp_date: string;
    invoice_date: string;
    supplier: string;
    inspection_user: string;
    invoice_number: string;
    freight_charge: number;
    custom_service_charge: number;
    vat_rate: number;
    created_by: string;
    customs_date?: string;
    po_number?: string;
    airway_bill_number?: string;
    currency?: string;
    forex_rate?: number;
    items: RRPSubmissionItem[];
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

export const createRRP = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const submissionData: RRPSubmission = req.body;
        
        // Get RRP configuration
        const [configRows] = await connection.query<ConfigRow[]>(
            'SELECT config_name, config_value FROM app_config WHERE config_type = ?',
            ['rrp']
        );
        
        const config: Record<string, any> = {};
        configRows.forEach(row => {
            try {
                config[row.config_name] = JSON.parse(row.config_value);
            } catch {
                config[row.config_name] = row.config_value;
            }
        });

        // Generate RRP number
        const [lastRRP] = await connection.query<RowDataPacket[]>(
            `SELECT rrp_number FROM rrp_details 
            WHERE rrp_number LIKE ? 
            ORDER BY id DESC LIMIT 1`,
            [`${submissionData.type === 'local' ? 'L' : 'F'}%`]
        );
        
        const prefix = submissionData.type === 'local' ? 'L' : 'F';
        const lastNumber = lastRRP.length > 0 
            ? parseInt(lastRRP[0].rrp_number.substring(1)) 
            : 0;
        const rrpNumber = `${prefix}${String(lastNumber + 1).padStart(3, '0')}`;

        // Process each item
        for (const item of submissionData.items) {
            // Get receive details
            const [receiveDetails] = await connection.query<RowDataPacket[]>(
                'SELECT * FROM receive_details WHERE id = ?',
                [item.receive_id]
            );

            if (receiveDetails.length === 0) {
                throw new Error(`Receive details not found for ID: ${item.receive_id}`);
            }

            const receive = receiveDetails[0];

            // Insert into rrp_details
            await connection.query(
                `INSERT INTO rrp_details (
                    receive_fk, rrp_number, supplier_name, date, currency, forex_rate,
                    item_price, customs_charge, customs_service_charge, vat_percentage,
                    invoice_number, invoice_date, po_number, airway_bill_number,
                    inspection_details, approval_status, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
                [
                    item.receive_id,
                    rrpNumber,
                    submissionData.supplier,
                    submissionData.rrp_date,
                    submissionData.type === 'foreign' ? submissionData.currency : 'NPR',
                    submissionData.type === 'foreign' ? submissionData.forex_rate : 1,
                    item.price,
                    item.customs_charge,
                    submissionData.custom_service_charge,
                    submissionData.vat_rate,
                    submissionData.invoice_number,
                    submissionData.invoice_date,
                    submissionData.po_number || null,
                    submissionData.airway_bill_number || null,
                    JSON.stringify({
                        inspection_user: submissionData.inspection_user,
                        inspection_details: config.inspection_details || {}
                    }),
                    submissionData.created_by
                ]
            );

            // Update receive_details with rrp_fk
            await connection.query(
                'UPDATE receive_details SET rrp_fk = ? WHERE id = ?',
                [rrpNumber, item.receive_id]
            );
        }

        await connection.commit();
        res.status(201).json({ 
            message: 'RRP created successfully',
            rrp_number: rrpNumber
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating RRP:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while creating RRP'
        });
    } finally {
        connection.release();
    }
}; 