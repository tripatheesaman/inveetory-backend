import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { formatDate, formatDateForDB } from '../utils/dateUtils';

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

interface RRPUpdateItem {
    id?: number;
    receive_id?: number;
    item_price: number;
    customs_charge?: number;
    customs_service_charge?: number;
    vat_percentage?: number;
    approval_status?: string;
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

        // Format dates
        const formattedItems = rows.map(item => ({
            ...item,
            request_date: formatDate(item.request_date),
            receive_date: formatDate(item.receive_date)
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

            // Calculate total amount for the item
            const itemPrice = item.price * (submissionData.type === 'foreign' && submissionData.forex_rate ? submissionData.forex_rate : 1);
            
            // Calculate total price of all items for proportion calculation
            const totalItemPrice = submissionData.items.reduce((sum: number, curr: RRPSubmissionItem) => 
                sum + (curr.price * (submissionData.type === 'foreign' && submissionData.forex_rate ? submissionData.forex_rate : 1)), 0);
            
            // Calculate proportional charges
            const freightCharge = (itemPrice / totalItemPrice) * (submissionData.freight_charge || 0) * 
                (submissionData.type === 'foreign' && submissionData.forex_rate ? submissionData.forex_rate : 1);
            
            const customServiceCharge = (itemPrice / totalItemPrice) * (submissionData.custom_service_charge || 0);

            // Calculate VAT if applicable
            let vatAmount = 0;
            if (item.vat_status) {
                const vatBase = itemPrice + freightCharge + (item.customs_charge || 0) + customServiceCharge;
                vatAmount = vatBase * ((submissionData.vat_rate || 0) / 100);
            }

            // Calculate total amount
            const totalAmount = itemPrice + 
                              freightCharge + 
                              (item.customs_charge || 0) + 
                              customServiceCharge + 
                              vatAmount;

            // Format dates for database
            const formattedRRPDate = formatDateForDB(submissionData.rrp_date);
            const formattedInvoiceDate = formatDateForDB(submissionData.invoice_date);
            const formattedCustomsDate = formatDateForDB(submissionData.customs_date);

            // Insert into rrp_details
            const [result] = await connection.query(
                `INSERT INTO rrp_details (
                    receive_fk, rrp_number, supplier_name, date, currency, forex_rate,
                    item_price, customs_charge, customs_service_charge, vat_percentage,
                    invoice_number, invoice_date, po_number, airway_bill_number,
                    inspection_details, approval_status, created_by, total_amount,
                    freight_charge, customs_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
                [
                    item.receive_id,
                    rrpNumber,
                    submissionData.supplier,
                    formattedRRPDate,
                    submissionData.type === 'foreign' ? submissionData.currency : 'NPR',
                    submissionData.type === 'foreign' && submissionData.forex_rate ? submissionData.forex_rate : 1,
                    item.price,
                    item.customs_charge,
                    customServiceCharge,
                    item.vat_status ? submissionData.vat_rate : 0,
                    submissionData.invoice_number,
                    formattedInvoiceDate,
                    submissionData.po_number || null,
                    submissionData.airway_bill_number || null,
                    JSON.stringify({
                        inspection_user: submissionData.inspection_user,
                        inspection_details: config.inspection_details || {}
                    }),
                    submissionData.created_by,
                    totalAmount,
                    freightCharge,
                    formattedCustomsDate
                ]
            );

            // Get the inserted RRP's ID
            const rrpId = (result as any).insertId;

            // Update receive_details with rrp_fk using the ID
            await connection.query(
                'UPDATE receive_details SET rrp_fk = ? WHERE id = ?',
                [rrpId, item.receive_id]
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

export const getPendingRRPs = async (req: Request, res: Response): Promise<void> => {
    try {
        // Get RRP configuration
        const [configRows] = await pool.query<ConfigRow[]>(
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

        // Get pending RRPs
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT 
                rd.id,
                rd.rrp_number,
                rd.supplier_name,
                rd.date,
                rd.currency,
                rd.forex_rate,
                rd.item_price,
                rd.customs_charge,
                rd.customs_service_charge,
                rd.vat_percentage,
                rd.invoice_number,
                rd.invoice_date,
                rd.po_number,
                rd.airway_bill_number,
                rd.inspection_details,
                rd.approval_status,
                rd.created_by,
                rd.total_amount,
                rd.freight_charge,
                rd.customs_date,
                rd.receive_fk,
                red.item_name,
                red.nac_code,
                red.part_number,
                red.received_quantity,
                red.unit,
                red.received_by,
                red.receive_date,
                rqd.request_number,
                rqd.request_date,
                rqd.requested_by,
                rqd.equipment_number
            FROM rrp_details rd
            JOIN receive_details red ON rd.receive_fk = red.id
            JOIN request_details rqd ON red.request_fk = rqd.id
            WHERE rd.approval_status = 'PENDING'
            ORDER BY rd.date DESC`
        );

        // Format dates and parse JSON fields
        const formattedRows = rows.map(row => ({
            ...row,
            date: formatDate(row.date),
            invoice_date: formatDate(row.invoice_date),
            receive_date: formatDate(row.receive_date),
            request_date: formatDate(row.request_date),
            customs_date: formatDate(row.customs_date),
            inspection_details: JSON.parse(row.inspection_details)
        }));

        res.status(200).json({
            config,
            pendingRRPs: formattedRows
        });
    } catch (error) {
        console.error('Error fetching pending RRPs:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching pending RRPs'
        });
    }
};

export const approveRRP = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const rrpNumber = req.params.rrpNumber;
        const { approved_by } = req.body;
        // First check if RRP exists and is not already approved
        const [rrpCheck] = await connection.query<RowDataPacket[]>(
            'SELECT id, approval_status FROM rrp_details WHERE rrp_number = ?',
            [rrpNumber]
        );

        if (rrpCheck.length === 0) {
            await connection.rollback();
            res.status(404).json({ 
                error: 'Not Found',
                message: 'RRP not found'
            });
            return;
        }

        if (rrpCheck[0].approval_status === 'APPROVED') {
            await connection.rollback();
            res.status(400).json({ 
                error: 'Bad Request',
                message: 'RRP is already approved'
            });
            return;
        }

        // Update all RRP records with the same RRP number
        const [result] = await connection.query(
            `UPDATE rrp_details 
            SET approval_status = 'APPROVED',
                approved_by = ?
            WHERE rrp_number = ? AND approval_status != 'APPROVED'`,
            [approved_by, rrpNumber]
        );

        if ((result as any).affectedRows === 0) {
            await connection.rollback();
            res.status(500).json({ 
                error: 'Internal Server Error',
                message: 'Failed to approve RRP'
            });
            return;
        }

        await connection.commit();
        res.status(200).json({ message: 'RRP approved successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error approving RRP:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while approving RRP'
        });
    } finally {
        connection.release();
    }
};

export const rejectRRP = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const rrpNumber = req.params.rrpNumber;
        const { rejected_by, rejection_reason } = req.body;
        
        // First check if RRP exists and is not already rejected
        const [rrpCheck] = await connection.query<RowDataPacket[]>(
            'SELECT id, approval_status FROM rrp_details WHERE rrp_number = ?',
            [rrpNumber]
        );

        if (rrpCheck.length === 0) {
            await connection.rollback();
            res.status(404).json({ 
                error: 'Not Found',
                message: 'RRP not found'
            });
            return;
        }

        if (rrpCheck[0].approval_status === 'REJECTED') {
            await connection.rollback();
            res.status(400).json({ 
                error: 'Bad Request',
                message: 'RRP is already rejected'
            });
            return;
        }

        // Get the first item's ID and the created_by username
        const [rrpDetails] = await connection.query<RowDataPacket[]>(
            `SELECT id, created_by 
             FROM rrp_details 
             WHERE rrp_number = ? 
             ORDER BY id ASC 
             LIMIT 1`,
            [rrpNumber]
        );

        const firstItemId = rrpDetails[0].id;
        const createdBy = rrpDetails[0].created_by;

        // Get the user ID from the username
        const [users] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM users WHERE username = ?',
            [createdBy]
        );

        if (users.length === 0) {
            await connection.rollback();
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }

        const userId = users[0].id;

        // Update all RRP records with the same RRP number
        const [result] = await connection.query(
            `UPDATE rrp_details 
            SET approval_status = 'REJECTED',
                rejected_by = ?,
                rejection_reason = ?
            WHERE rrp_number = ? AND approval_status != 'REJECTED'`,
            [rejected_by, rejection_reason, rrpNumber]
        );

        if ((result as any).affectedRows === 0) {
            await connection.rollback();
            res.status(500).json({ 
                error: 'Internal Server Error',
                message: 'Failed to reject RRP'
            });
            return;
        }

        // Create notification
        await connection.query(
            `INSERT INTO notifications 
             (user_id, reference_type, message, reference_id)
             VALUES (?, ?, ?, ?)`,
            [
                userId,
                'rrp',
                `Your RRP number ${rrpNumber} has been rejected for the following reason: ${rejection_reason}`,
                firstItemId
            ]
        );

        await connection.commit();
        res.status(200).json({ message: 'RRP rejected successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error rejecting RRP:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while rejecting RRP'
        });
    } finally {
        connection.release();
    }
};

export const updateRRP = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const rrpNumber = req.params.rrpNumber;
        const updateData = req.body;

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

        // Format dates for database
        const formattedRRPDate = formatDateForDB(updateData.date);
        const formattedInvoiceDate = formatDateForDB(updateData.invoice_date);
        const formattedCustomsDate = formatDateForDB(updateData.customs_date);

        // Get existing items for this RRP
        const [existingItems] = await connection.query<RowDataPacket[]>(
            'SELECT id, receive_fk FROM rrp_details WHERE rrp_number = ?',
            [rrpNumber]
        );

        const existingItemIds = existingItems.map(item => item.id);
        const updatedItemIds = updateData.items.filter((item: RRPUpdateItem) => item.id).map((item: RRPUpdateItem) => item.id);

        // Delete items that are no longer in the RRP
        const itemsToDelete = existingItemIds.filter(id => !updatedItemIds.includes(id));
        if (itemsToDelete.length > 0) {
            // Get receive_fk for items being deleted
            const [itemsToDeleteDetails] = await connection.query<RowDataPacket[]>(
                'SELECT receive_fk FROM rrp_details WHERE id IN (?)',
                [itemsToDelete]
            );

            // Reset rrp_fk in receive_details for deleted items using receive_fk
            const receiveFks = itemsToDeleteDetails.map(item => item.receive_fk);
            if (receiveFks.length > 0) {
                await connection.query(
                    'UPDATE receive_details SET rrp_fk = NULL WHERE id IN (?)',
                    [receiveFks]
                );
            }

            // Then delete the RRP items
            await connection.query(
                'DELETE FROM rrp_details WHERE id IN (?)',
                [itemsToDelete]
            );
        }

        let updateSuccess = false;

        // Process each item
        for (const item of updateData.items) {
            if (item.id) {
                // Update existing item
                const updateFields = [
                    'rrp_number = ?',
                    'supplier_name = ?',
                    'date = ?',
                    'currency = ?',
                    'forex_rate = ?',
                    'item_price = ?',
                    'customs_charge = ?',
                    'customs_service_charge = ?',
                    'vat_percentage = ?',
                    'invoice_number = ?',
                    'invoice_date = ?',
                    'customs_date = ?',
                    'po_number = ?',
                    'airway_bill_number = ?',
                    'inspection_details = ?',
                    'freight_charge = ?',
                    'total_amount = ?',
                    'updated_at = CURRENT_TIMESTAMP'
                ];

                const updateValues = [
                    updateData.rrp_number,
                    updateData.supplier_name,
                    formattedRRPDate,
                    updateData.currency,
                    updateData.forex_rate,
                    item.item_price,
                    item.customs_charge,
                    item.customs_service_charge,
                    item.vat_percentage,
                    updateData.invoice_number,
                    formattedInvoiceDate,
                    formattedCustomsDate,
                    updateData.po_number || null,
                    updateData.airway_bill_number || null,
                    JSON.stringify({
                        inspection_user: updateData.inspection_user,
                        inspection_details: config.inspection_details || {}
                    }),
                    item.freight_charge,
                    item.total_amount
                ];

                // Only update approval_status if it's provided in the request
                if (item.approval_status) {
                    updateFields.push('approval_status = ?');
                    updateValues.push(item.approval_status);
                }

                updateValues.push(item.id); // Add the ID for WHERE clause

                const [result] = await connection.query(
                    `UPDATE rrp_details 
                    SET ${updateFields.join(', ')}
                    WHERE id = ?`,
                    updateValues
                );

                if ((result as any).affectedRows > 0) {
                    updateSuccess = true;
                }
            } else {
                // Insert new item
                const [result] = await connection.query(
                    `INSERT INTO rrp_details (
                        receive_fk, rrp_number, supplier_name, date, currency, forex_rate,
                        item_price, customs_charge, customs_service_charge, vat_percentage,
                        invoice_number, invoice_date, po_number, airway_bill_number,
                        inspection_details, approval_status, created_by, total_amount,
                        freight_charge, customs_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        item.receive_id,
                        updateData.rrp_number,
                        updateData.supplier_name,
                        formattedRRPDate,
                        updateData.currency,
                        updateData.forex_rate,
                        item.item_price,
                        item.customs_charge,
                        item.customs_service_charge,
                        item.vat_percentage,
                        updateData.invoice_number,
                        formattedInvoiceDate,
                        updateData.po_number || null,
                        updateData.airway_bill_number || null,
                        JSON.stringify({
                            inspection_user: updateData.inspection_user,
                            inspection_details: config.inspection_details || {}
                        }),
                        item.approval_status || 'PENDING', // Use provided status or default to PENDING
                        updateData.created_by,
                        item.total_amount,
                        item.freight_charge,
                        formattedCustomsDate
                    ]
                );

                const rrpId = (result as any).insertId;

                // Update receive_details with rrp_fk
                await connection.query(
                    'UPDATE receive_details SET rrp_fk = ? WHERE id = ?',
                    [rrpId, item.receive_id]
                );

                updateSuccess = true;
            }
        }

        if (!updateSuccess) {
            await connection.rollback();
            res.status(404).json({ 
                error: 'Not Found',
                message: 'No matching RRP items were found to update'
            });
            return;
        }

        await connection.commit();
        res.status(200).json({ message: 'RRP updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating RRP:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating RRP'
        });
    } finally {
        connection.release();
    }
};

export const getRRPById = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id;

        // First get the RRP number for the given ID
        const [rrpNumberResult] = await pool.query<RowDataPacket[]>(
            'SELECT rrp_number FROM rrp_details WHERE id = ?',
            [id]
        );

        if (rrpNumberResult.length === 0) {
            res.status(404).json({ 
                error: 'Not Found',
                message: 'RRP not found'
            });
            return;
        }

        const rrpNumber = rrpNumberResult[0].rrp_number;

        // Get RRP configuration
        const [configRows] = await pool.query<ConfigRow[]>(
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

        // Get all RRP details for this RRP number
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT 
                rd.id,
                rd.rrp_number,
                rd.supplier_name,
                rd.date,
                rd.currency,
                rd.forex_rate,
                rd.item_price,
                rd.customs_charge,
                rd.customs_service_charge,
                rd.vat_percentage,
                rd.invoice_number,
                rd.invoice_date,
                rd.po_number,
                rd.airway_bill_number,
                rd.inspection_details,
                rd.approval_status,
                rd.created_by,
                rd.total_amount,
                rd.freight_charge,
                rd.customs_date,
                rd.receive_fk,
                red.item_name,
                red.nac_code,
                red.part_number,
                red.received_quantity,
                red.unit,
                red.received_by,
                red.receive_date,
                rqd.request_number,
                rqd.request_date,
                rqd.requested_by,
                rqd.equipment_number
            FROM rrp_details rd
            JOIN receive_details red ON rd.receive_fk = red.id
            JOIN request_details rqd ON red.request_fk = rqd.id
            WHERE rd.rrp_number = ?
            ORDER BY rd.id ASC`,
            [rrpNumber]
        );

        // Format dates and parse JSON fields
        const formattedRows = rows.map(row => ({
            ...row,
            date: formatDate(row.date),
            invoice_date: formatDate(row.invoice_date),
            receive_date: formatDate(row.receive_date),
            request_date: formatDate(row.request_date),
            customs_date: formatDate(row.customs_date),
            inspection_details: JSON.parse(row.inspection_details)
        }));

        res.status(200).json({
            config,
            rrpDetails: formattedRows
        });
    } catch (error) {
        console.error('Error fetching RRP details:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching RRP details'
        });
    }
}; 