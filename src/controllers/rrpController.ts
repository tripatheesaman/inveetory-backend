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
    rrp_number: string;
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
    customs_number?: string;
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
    freight_charge?: number;
    total_amount?: number;
}

interface RRPUpdateData {
    rrp_number: string;
    supplier_name: string;
    date: string;
    currency: string;
    forex_rate: number;
    invoice_number: string;
    invoice_date: string;
    customs_date: string;
    customs_number?: string;
    po_number?: string;
    airway_bill_number?: string;
    inspection_user: string;
    created_by: string;
    items: RRPUpdateItem[];
}

interface RRPType {
    type: 'local' | 'foreign';
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

        // Get current FY from config
        const currentFY = config.current_fy;
        if (!currentFY) {
            await connection.rollback();
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Current FY configuration not found'
            });
            return;
        }

        // Get the RRP number from frontend
        const inputRRPNumber = submissionData.rrp_number;
        let rrpNumber = inputRRPNumber;

        // Check if the RRP number already contains 'T'
        if (inputRRPNumber.includes('T')) {
            // Search for existing RRP with this exact number
            const [existingRRP] = await connection.query<RowDataPacket[]>(
                'SELECT approval_status FROM rrp_details WHERE rrp_number = ?',
                [inputRRPNumber]
            );

            if (existingRRP.length > 0) {
                // Check if the existing RRP is rejected
                if (existingRRP[0].approval_status !== 'REJECTED') {
                    await connection.rollback();
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'RRP number already exists and is not rejected'
                    });
                    return;
                }

                // If rejected, delete the existing entries
                await connection.query(
                    'DELETE FROM rrp_details WHERE rrp_number = ?',
                    [inputRRPNumber]
                );

                // Reset rrp_fk in receive_details for the deleted items
                await connection.query(
                    `UPDATE receive_details rd
                     SET rrp_fk = NULL
                     WHERE EXISTS (
                         SELECT 1 FROM rrp_details rrp
                         WHERE rrp.receive_fk = rd.id
                         AND rrp.rrp_number = ?
                     )`,
                    [inputRRPNumber]
                );
            }
        } else {
            // If no 'T' in the number, generate new RRP number as before
            const [lastRRP] = await connection.query<RowDataPacket[]>(
                `SELECT rrp_number FROM rrp_details 
                WHERE rrp_number LIKE ? 
                ORDER BY rrp_number DESC LIMIT 1`,
                [`${inputRRPNumber}T%`]
            );
            
            if (lastRRP.length > 0) {
                // Extract the T number from the last RRP number
                const lastTNumber = parseInt(lastRRP[0].rrp_number.split('T')[1]);
                // Increment the T number
                rrpNumber = `${inputRRPNumber}T${lastTNumber + 1}`;
            } else {
                // If no previous RRP exists for this base number, start with T1
                rrpNumber = `${inputRRPNumber}T1`;
            }
        }

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
                    freight_charge, customs_date, customs_number, current_fy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)`,
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
                    formattedCustomsDate,
                    submissionData.customs_number || null,
                    currentFY
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
                rd.customs_number,
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

        // Reset rrp_fk in receive_details for all items in this RRP
        await connection.query(
            `UPDATE receive_details rd
             SET rrp_fk = NULL
             WHERE EXISTS (
                 SELECT 1 FROM rrp_details rrp
                 WHERE rrp.receive_fk = rd.id
                 AND rrp.rrp_number = ?
             )`,
            [rrpNumber]
        );

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
        const updateData: RRPUpdateData = req.body;

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
                    'customs_number = ?',
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
                    }),
                    item.freight_charge,
                    item.total_amount,
                    updateData.customs_number || null
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
                        freight_charge, customs_date, customs_number
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                        formattedCustomsDate,
                        updateData.customs_number || null
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

const getRRPType = (rrpNumber: string): RRPType => {
    const firstChar = rrpNumber.charAt(0).toUpperCase();
    
    return {
        type: firstChar === 'L' ? 'local' : 'foreign'
    };
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
        const rrpType = getRRPType(rrpNumber);

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
                rd.customs_number,
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
            rrpDetails: formattedRows,
            type: rrpType.type
        });
    } catch (error) {
        console.error('Error fetching RRP details:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching RRP details'
        });
    }
};

export const searchRRP = async (req: Request, res: Response): Promise<void> => {
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
            SELECT DISTINCT
                rrp.id,
                rrp.rrp_number,
                rrp.date as rrp_date,
                rrp.supplier_name,
                rrp.currency,
                rrp.forex_rate,
                rrp.item_price,
                rrp.customs_charge,
                rrp.customs_service_charge,
                rrp.vat_percentage,
                rrp.invoice_number,
                rrp.invoice_date,
                rrp.po_number,
                rrp.airway_bill_number,
                rrp.inspection_details,
                rrp.approval_status,
                rrp.created_by,
                rrp.total_amount,
                rrp.freight_charge,
                rrp.customs_date,
                rd.item_name,
                rd.part_number,
                rd.received_quantity,
                rd.unit,
                rqd.equipment_number
            FROM rrp_details rrp
            JOIN receive_details rd ON rrp.receive_fk = rd.id
            JOIN request_details rqd ON rd.request_fk = rqd.id
            WHERE 1=1
        `;
        const params: (string | number)[] = [];

        // Add search conditions with AND logic
        if (universal) {
            query += ` AND (
                rrp.rrp_number LIKE ? OR
                rd.item_name LIKE ? OR
                rd.part_number LIKE ? OR
                rqd.equipment_number LIKE ?
            )`;
            params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
        }

        if (equipmentNumber) {
            query += ` AND rqd.equipment_number LIKE ?`;
            params.push(`%${equipmentNumber}%`);
        }

        if (partNumber) {
            query += ` AND rd.part_number LIKE ?`;
            params.push(`%${partNumber}%`);
        }

        // Add LIMIT to prevent overwhelming results
        query += ' ORDER BY rrp.date DESC LIMIT 50';

        const [results] = await pool.execute<RowDataPacket[]>(query, params);
        
        // Group results by RRP number
        const groupedResults = results.reduce((acc, result) => {
            if (!acc[result.rrp_number]) {
                acc[result.rrp_number] = {
                    rrpNumber: result.rrp_number,
                    type: getRRPType(result.rrp_number).type,
                    rrpDate: formatDate(result.rrp_date),
                    supplierName: result.supplier_name,
                    currency: result.currency,
                    forexRate: result.forex_rate,
                    invoiceNumber: result.invoice_number,
                    invoiceDate: formatDate(result.invoice_date),
                    poNumber: result.po_number,
                    airwayBillNumber: result.airway_bill_number,
                    inspectionDetails: JSON.parse(result.inspection_details),
                    approvalStatus: result.approval_status,
                    createdBy: result.created_by,
                    customsDate: formatDate(result.customs_date),
                    items: []
                };
            }
            acc[result.rrp_number].items.push({
                id: result.id,
                itemName: result.item_name,
                partNumber: result.part_number,
                equipmentNumber: result.equipment_number,
                receivedQuantity: result.received_quantity,
                unit: result.unit,
                itemPrice: result.item_price,
                customsCharge: result.customs_charge,
                customsServiceCharge: result.customs_service_charge,
                vatPercentage: result.vat_percentage,
                freightCharge: result.freight_charge,
                totalAmount: result.total_amount
            });
            return acc;
        }, {} as Record<string, any>);

        const response = Object.values(groupedResults);
        res.json(response);
    } catch (error) {
        console.error('Error searching RRP:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while searching RRP'
        });
    }
};

export const getLatestRRPDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { type } = req.params;

        if (!type || (type !== 'local' && type !== 'foreign')) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid RRP type. Must be either "local" or "foreign"'
            });
            return;
        }

        const prefix = type === 'local' ? 'L' : 'F';

        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT 
                rrp_number,
                date as rrp_date
             FROM rrp_details 
             WHERE rrp_number LIKE ?
             ORDER BY CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) DESC
             LIMIT 1`,
            [`${prefix}%`]
        );

        const latestRRP = rows.length > 0 ? {
            rrpNumber: rows[0].rrp_number,
            rrpDate: rows[0].rrp_date
        } : {};

        res.status(200).json(latestRRP);
    } catch (error) {
        console.error('Error fetching latest RRP details:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching latest RRP details'
        });
    }
};

export const verifyRRPNumber = async (req: Request, res: Response): Promise<void> => {
    try {
        const { rrpNumber } = req.params;
        const { date } = req.query;

        if (!rrpNumber || !rrpNumber.match(/^[LF]\d{3}(T\d+)?$/)) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid RRP number format. Must be in format L001 or L001T1'
            });
            return;
        }

        if (!date) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'RRP date is required'
            });
            return;
        }

        // If RRP number contains T
        if (rrpNumber.includes('T')) {
            // First check if there's a rejected record with this exact number
            const [rejectedRecord] = await pool.query<RowDataPacket[]>(
                `SELECT rrp_number, date 
                 FROM rrp_details 
                 WHERE rrp_number = ? AND approval_status = 'REJECTED'`,
                [rrpNumber]
            );

            if (rejectedRecord.length === 0) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'Invalid RRP Number'
                });
                return;
            }

            // Get the base number (part before T)
            const baseNumber = rrpNumber.split('T')[0];
            const currentTNumber = parseInt(rrpNumber.split('T')[1]);

            // Get the previous T record
            const [previousRecord] = await pool.query<RowDataPacket[]>(
                `SELECT rrp_number, date 
                 FROM rrp_details 
                 WHERE rrp_number LIKE ? 
                 AND CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) < ?
                 ORDER BY CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) DESC
                 LIMIT 1`,
                [`${baseNumber}T%`, currentTNumber]
            );

            // Get the next T record
            const [nextRecord] = await pool.query<RowDataPacket[]>(
                `SELECT rrp_number, date 
                 FROM rrp_details 
                 WHERE rrp_number LIKE ? 
                 AND CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) > ?
                 ORDER BY CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) ASC
                 LIMIT 1`,
                [`${baseNumber}T%`, currentTNumber]
            );

            // Convert dates to Date objects for comparison
            const inputDate = new Date(date as string);
            
            // Check against previous record if it exists
            if (previousRecord.length > 0) {
                const previousDate = new Date(previousRecord[0].date);
                if (inputDate < previousDate) {
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'RRP date cannot be before the previous RRP date'
                    });
                    return;
                }
            }

            // Check against next record if it exists
            if (nextRecord.length > 0) {
                const nextDate = new Date(nextRecord[0].date);
                if (inputDate > nextDate) {
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'RRP date cannot be greater than the next RRP date'
                    });
                    return;
                }
            }

            // If all validations pass, return the RRP number
            res.status(200).json({
                rrpNumber: rrpNumber
            });
        } else {
            // Get current FY from RRP config
            const [configRows] = await pool.query<RowDataPacket[]>(
                'SELECT config_value FROM app_config WHERE config_type = ? AND config_name = ?',
                ['rrp', 'current_fy']
            );

            if (configRows.length === 0) {
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: 'Current FY configuration not found'
                });
                return;
            }

            const currentFY = configRows[0].config_value;

            // Get the latest record with this base RRP number
            const [rows] = await pool.query<RowDataPacket[]>(
                `SELECT rrp_number, approval_status, current_fy
                 FROM rrp_details 
                 WHERE rrp_number LIKE ?
                 ORDER BY CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) DESC
                 LIMIT 1`,
                [`${rrpNumber}T%`]
            );

            if (rows.length > 0) {

                const recordFY = rows[0].current_fy;
                console.log
                // Check if the record's FY matches current FY
                if (recordFY === currentFY) {
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'Duplicate RRP number in current fiscal year'
                    });
                    return;
                }
            }

            // If no records found or FY doesn't match, return empty
            res.status(200).json({});
        }
    } catch (error) {
        console.error('Error verifying RRP number:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while verifying RRP number'
        });
    }
}; 