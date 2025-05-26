import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { formatDate, formatDateForDB } from '../utils/dateUtils';
import { logEvents } from '../middlewares/logger';

export interface SearchRequestResult extends RowDataPacket {
    id: number;
    request_number: string;
    request_date: Date;
    requested_by: string;
    part_number: string;
    item_name: string;
    equipment_number: string;
    requested_quantity: number;
    approval_status: string;
    nac_code: string;
    unit: string;
    current_balance: number | string;
    previous_rate: number | string;
    image_path: string;
    specifications: string;
    remarks: string;
}

export interface ReceiveItem {
    nacCode: string;
    partNumber: string;
    itemName: string;
    receiveQuantity: number;
    equipmentNumber: string;
    imagePath: string;
    unit: string;
    requestId: number;
    location?: string;
    cardNumber?: string;
}

export interface ReceiveRequest {
    receiveDate: string;
    remarks: string;
    receivedBy: string;
    items: ReceiveItem[];
}

interface PendingReceiveItem extends RowDataPacket {
    id: number;
    nac_code: string;
    item_name: string;
    part_number: string;
    received_quantity: number;
    equipment_number: string;
    receive_date: Date;
}

interface ReceiveDetailResult extends RowDataPacket {
    request_number: string;
    request_date: Date;
    receive_date: Date;
    item_name: string;
    requested_part_number: string;
    received_part_number: string;
    requested_quantity: number;
    received_quantity: number;
    equipment_number: string;
    unit: string;
    requested_image: string;
    received_image: string;
    location?: string;
    card_number?: string;
}

interface StockDetailResult extends RowDataPacket {
    id: number;
    nac_code: string;
    item_name: string;
    part_numbers: string;
    applicable_equipments: string;
    current_balance: number;
    location: string;
    card_number: string;
    image_url: string;
    unit: string;
}

export const getPendingReceives = async (req: Request, res: Response): Promise<void> => {
    try {
        const [results] = await pool.execute<PendingReceiveItem[]>(
            `SELECT 
                rd.id,
                rd.nac_code,
                rd.item_name,
                rd.part_number,
                rd.received_quantity,
                rd.receive_date,
                req.equipment_number
            FROM receive_details rd
            JOIN request_details req ON rd.request_fk = req.id
            WHERE rd.approval_status = 'PENDING'
            ORDER BY rd.created_at DESC`
        );

        const pendingReceives = results.map(item => ({
            id: item.id,
            nacCode: item.nac_code,
            itemName: item.item_name,
            partNumber: item.part_number,
            receivedQuantity: item.received_quantity,
            receiveDate: formatDate(item.receive_date),
            equipmentNumber: item.equipment_number
        }));

        logEvents(`Successfully fetched ${pendingReceives.length} pending receives`, "receiveLog.log");
        res.status(200).json(pendingReceives);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching pending receives: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching pending receives'
        });
    }
};

export const searchReceivables = async (req: Request, res: Response): Promise<void> => {
    const { universal, equipmentNumber, partNumber } = req.query;
    
    if (!universal && !equipmentNumber && !partNumber) {
        logEvents(`Failed to search receivables - No search parameters provided`, "receiveLog.log");
        res.status(400).json({ 
            error: 'Bad Request',
            message: 'At least one search parameter is required'
        });
        return;
    }

    try {
        let query = `
            SELECT DISTINCT
                rd.id,
                rd.request_number,
                rd.request_date,
                rd.requested_by,
                rd.part_number,
                rd.item_name,
                rd.equipment_number,
                rd.requested_quantity,
                rd.approval_status,
                rd.nac_code,
                rd.unit,
                rd.current_balance,
                rd.previous_rate,
                rd.image_path,
                rd.specifications,
                rd.remarks,
                COALESCE(sd.location, '') as location,
                COALESCE(sd.card_number, '') as card_number
            FROM request_details rd
            LEFT JOIN stock_details sd ON rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
            WHERE rd.approval_status = 'APPROVED'
            AND rd.is_received = 0
        `;
        const params: (string | number)[] = [];

        if (universal) {
            query += ` AND (
                rd.request_number LIKE ? OR
                rd.item_name LIKE ? OR
                rd.part_number LIKE ? OR
                rd.equipment_number LIKE ? OR
                rd.nac_code LIKE ?
            )`;
            params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
        }

        if (equipmentNumber) {
            query += ` AND rd.equipment_number LIKE ?`;
            params.push(`%${equipmentNumber}%`);
        }

        if (partNumber) {
            query += ` AND rd.part_number LIKE ?`;
            params.push(`%${partNumber}%`);
        }

        query += ' ORDER BY rd.request_date DESC LIMIT 50';

        const [results] = await pool.execute<SearchRequestResult[]>(query, params);
        
        const groupedResults = results.reduce((acc, result) => {
            if (!acc[result.request_number]) {
                acc[result.request_number] = {
                    requestNumber: result.request_number,
                    requestDate: result.request_date,
                    requestedBy: result.requested_by,
                    approvalStatus: result.approval_status,
                    items: []
                };
            }
            acc[result.request_number].items.push({
                id: result.id,
                partNumber: result.part_number,
                itemName: result.item_name,
                equipmentNumber: result.equipment_number,
                requestedQuantity: result.requested_quantity,
                nacCode: result.nac_code,
                unit: result.unit,
                currentBalance: result.current_balance,
                previousRate: result.previous_rate,
                imageUrl: result.image_path,
                specifications: result.specifications,
                remarks: result.remarks,
                location: result.location,
                cardNumber: result.card_number
            });
            return acc;
        }, {} as Record<string, any>);

        const response = Object.values(groupedResults);
        logEvents(`Successfully searched receivables with ${response.length} results`, "receiveLog.log");
        res.json(response);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error searching receivables: ${errorMessage}`, "receiveLog.log");
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while searching receivables'
        });
    }
}; 

export const createReceive = async (req: Request, res: Response): Promise<void> => {
    const receiveData: ReceiveRequest = req.body;

    if (!receiveData.receiveDate || !receiveData.receivedBy || !receiveData.items || receiveData.items.length === 0) {
        logEvents(`Failed to create receive - Missing required fields by user: ${receiveData.receivedBy || 'Unknown'}`, "receiveLog.log");
        res.status(400).json({
            error: 'Bad Request',
            message: 'Missing required fields'
        });
        return;
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const formattedDate = formatDateForDB(receiveData.receiveDate);
        const receiveIds: number[] = [];

        for (const item of receiveData.items) {
            const [requestCheck] = await connection.execute(
                `SELECT id, request_number FROM request_details 
                WHERE id = ?`,
                [item.requestId]
            );

            if (!(requestCheck as any[]).length) {
                logEvents(`Failed to create receive - Request not found: ${item.requestId} by user: ${receiveData.receivedBy}`, "receiveLog.log");
                throw new Error(`Request ID ${item.requestId} not found`);
            }

            const requestNumber = (requestCheck as any[])[0].request_number;

            const columns = [
                'receive_date', 'request_fk', 'nac_code', 'part_number', 'item_name',
                'received_quantity', 'unit', 'approval_status', 'received_by', 'image_path'
            ];
            const values = [
                formattedDate,
                item.requestId,
                item.nacCode,
                item.partNumber,
                item.itemName,
                item.receiveQuantity,
                item.unit,
                'PENDING',
                receiveData.receivedBy,
                item.imagePath
            ];

            if (item.location !== undefined && item.location !== null && item.location !== '') {
                columns.push('location');
                values.push(item.location);
            }
            if (item.cardNumber !== undefined && item.cardNumber !== null && item.cardNumber !== '') {
                columns.push('card_number');
                values.push(item.cardNumber);
            }

            const placeholders = columns.map(() => '?').join(', ');
            const [result] = await connection.execute(
                `INSERT INTO receive_details (${columns.join(', ')}) VALUES (${placeholders})`,
                values
            );

            const receiveId = (result as any).insertId;
            receiveIds.push(receiveId);

            // Update request_details to set is_received and receive_fk
            await connection.execute(
                `UPDATE request_details 
                SET is_received = TRUE,
                    receive_fk = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [receiveId, item.requestId]
            );

            logEvents(`Created receive item for request ${requestNumber} with ID ${receiveId} by user: ${receiveData.receivedBy}`, "receiveLog.log");
        }

        await connection.commit();
        logEvents(`Successfully created receive with ${receiveIds.length} items by user: ${receiveData.receivedBy}`, "receiveLog.log");
        res.status(201).json({
            message: 'Receive created successfully',
            receiveDate: formatDate(receiveData.receiveDate),
            receiveIds
        });
    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error creating receive: ${errorMessage} by user: ${receiveData.receivedBy}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while creating receive'
        });
    } finally {
        connection.release();
    }
};

export const getReceiveDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { receiveId } = req.params;

        const [results] = await pool.execute<ReceiveDetailResult[]>(
            `SELECT 
                req.request_number,
                req.request_date,
                rd.receive_date,
                rd.item_name,
                req.part_number as requested_part_number,
                rd.part_number as received_part_number,
                req.requested_quantity,
                rd.received_quantity,
                req.equipment_number,
                req.unit,
                req.image_path as requested_image,
                rd.image_path as received_image,
                rd.location,
                rd.card_number
            FROM receive_details rd
            JOIN request_details req ON rd.request_fk = req.id
            WHERE rd.id = ?`,
            [receiveId]
        );

        if (!results.length) {
            logEvents(`Failed to fetch receive details - Receive not found: ${receiveId}`, "receiveLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Receive details not found'
            });
            return;
        }

        const result = results[0];
        const formattedResponse: any = {
            receiveId: parseInt(receiveId),
            requestNumber: result.request_number,
            requestDate: formatDate(result.request_date),
            receiveDate: formatDate(result.receive_date),
            itemName: result.item_name,
            requestedPartNumber: result.requested_part_number,
            receivedPartNumber: result.received_part_number,
            requestedQuantity: result.requested_quantity,
            receivedQuantity: result.received_quantity,
            equipmentNumber: result.equipment_number,
            unit: result.unit,
            requestedImage: result.requested_image,
            receivedImage: result.received_image
        };

        if (result.location !== undefined && result.location !== null && result.location !== '') {
            formattedResponse.location = result.location;
        }
        if (result.card_number !== undefined && result.card_number !== null && result.card_number !== '') {
            formattedResponse.cardNumber = result.card_number;
        }

        logEvents(`Successfully fetched receive details for ID: ${receiveId}`, "receiveLog.log");
        res.status(200).json(formattedResponse);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching receive details: ${errorMessage} for ID: ${req.params.receiveId}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching receive details'
        });
    }
};

export const updateReceiveQuantity = async (req: Request, res: Response): Promise<void> => {
    try {
        const { receiveId } = req.params;
        const { receivedQuantity } = req.body;

        if (!receivedQuantity || typeof receivedQuantity !== 'number' || receivedQuantity <= 0) {
            logEvents(`Failed to update receive quantity - Invalid quantity: ${receivedQuantity} for ID: ${receiveId}`, "receiveLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Valid received quantity is required'
            });
            return;
        }

        const [result] = await pool.execute(
            `UPDATE receive_details 
            SET received_quantity = ?, 
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [receivedQuantity, receiveId]
        );

        const affectedRows = (result as any).affectedRows;

        if (affectedRows === 0) {
            logEvents(`Failed to update receive quantity - Receive not found: ${receiveId}`, "receiveLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Receive record not found'
            });
            return;
        }

        logEvents(`Successfully updated receive quantity to ${receivedQuantity} for ID: ${receiveId}`, "receiveLog.log");
        res.status(200).json({
            message: 'Receive quantity updated successfully',
            receiveId,
            receivedQuantity
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error updating receive quantity: ${errorMessage} for ID: ${req.params.receiveId}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating receive quantity'
        });
    }
};

export const approveReceive = async (req: Request, res: Response): Promise<void> => {
    const { receiveId } = req.params;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [receiveDetails] = await connection.execute<ReceiveDetailResult[]>(
            `SELECT 
                rd.nac_code,
                rd.item_name,
                rd.part_number,
                rd.received_quantity,
                req.equipment_number,
                rd.location,
                rd.card_number,
                rd.image_path,
                rd.unit
            FROM receive_details rd
            JOIN request_details req ON rd.request_fk = req.id
            WHERE rd.id = ?`,
            [receiveId]
        );

        if (!receiveDetails.length) {
            logEvents(`Failed to approve receive - Receive not found: ${receiveId}`, "receiveLog.log");
            throw new Error('Receive record not found');
        }

        const receive = receiveDetails[0];

        await connection.execute(
            `UPDATE receive_details 
            SET approval_status = 'APPROVED',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [receiveId]
        );

        const [stockDetails] = await connection.execute<StockDetailResult[]>(
            `SELECT * FROM stock_details 
            WHERE nac_code = ?`,
            [receive.nac_code]
        );

        if (stockDetails.length > 0) {
            const stock = stockDetails[0];
            const currentBalance = typeof stock.current_balance === 'string' 
                ? parseFloat(stock.current_balance) 
                : stock.current_balance;
            const receivedQty = typeof receive.received_quantity === 'string'
                ? parseFloat(receive.received_quantity)
                : receive.received_quantity;
            const newBalance = currentBalance + receivedQty;

            let partNumbers = stock.part_numbers.split(',').map(pn => pn.trim()).filter(pn => pn !== '');
            if (!partNumbers.includes(receive.part_number)) {
                partNumbers = [receive.part_number, ...partNumbers];
            }
            const updatedPartNumbers = partNumbers.join(',');

            let itemNames = stock.item_name.split(',').map(name => name.trim()).filter(name => name !== '');
            if (!itemNames.includes(receive.item_name)) {
                itemNames = [receive.item_name, ...itemNames];
            }
            const updatedItemNames = itemNames.join(',');

            const existingEquipmentNumbers = new Set(stock.applicable_equipments.split(',').map(num => num.trim()).filter(num => num !== ''));
            const newEquipmentNumbers = expandEquipmentNumbers(receive.equipment_number);
            const uniqueNewNumbers = Array.from(newEquipmentNumbers).filter(num => !existingEquipmentNumbers.has(num));
            
            const updatedEquipmentNumbers = uniqueNewNumbers.length > 0 
                ? [...uniqueNewNumbers, ...Array.from(existingEquipmentNumbers)].join(',')
                : stock.applicable_equipments;

            const updateFields = [
                'current_balance = ?',
                'part_numbers = ?',
                'item_name = ?',
                'applicable_equipments = ?'
            ];
            const updateValues = [
                newBalance,
                updatedPartNumbers,
                updatedItemNames,
                updatedEquipmentNumbers
            ];

            if (receive.location && receive.location.trim() !== '') {
                updateFields.push('location = ?');
                updateValues.push(receive.location);
            }
            if (receive.card_number && receive.card_number.trim() !== '') {
                updateFields.push('card_number = ?');
                updateValues.push(receive.card_number);
            }
            if (receive.image_path && receive.image_path.trim() !== '') {
                updateFields.push('image_url = ?');
                updateValues.push(receive.image_path);
            }
            if (receive.unit && receive.unit.trim() !== '') {
                updateFields.push('unit = ?');
                updateValues.push(receive.unit);
            }

            updateValues.push(stock.id);

            await connection.execute(
                `UPDATE stock_details 
                SET ${updateFields.join(', ')},
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                updateValues
            );

            logEvents(`Successfully updated stock for NAC code: ${receive.nac_code} with new balance: ${newBalance}`, "receiveLog.log");
        } else {
            const insertFields = [
                'nac_code',
                'item_name',
                'part_numbers',
                'applicable_equipments',
                'current_balance',
                'unit'
            ];
            const insertValues = [
                receive.nac_code,
                receive.item_name,
                receive.part_number,
                receive.equipment_number,
                receive.received_quantity,
                receive.unit
            ];

            if (receive.location && receive.location.trim() !== '') {
                insertFields.push('location');
                insertValues.push(receive.location);
            }
            if (receive.card_number && receive.card_number.trim() !== '') {
                insertFields.push('card_number');
                insertValues.push(receive.card_number);
            }
            if (receive.image_path && receive.image_path.trim() !== '') {
                insertFields.push('image_url');
                insertValues.push(receive.image_path);
            }

            const placeholders = insertFields.map(() => '?').join(', ');
            await connection.execute(
                `INSERT INTO stock_details (${insertFields.join(', ')}) 
                VALUES (${placeholders})`,
                insertValues
            );

            logEvents(`Successfully created new stock record for NAC code: ${receive.nac_code}`, "receiveLog.log");
        }

        await connection.commit();
        logEvents(`Successfully approved receive ID: ${receiveId}`, "receiveLog.log");
        res.status(200).json({
            message: 'Receive approved and stock updated successfully'
        });
    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error approving receive: ${errorMessage} for ID: ${receiveId}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while approving receive'
        });
    } finally {
        connection.release();
    }
};

export const rejectReceive = async (req: Request, res: Response): Promise<void> => {
    const { receiveId } = req.params;
    const { rejectedBy, rejectionReason } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [receiveDetails] = await connection.execute<RowDataPacket[]>(
            `SELECT rd.request_fk, rd.received_by, rd.item_name 
            FROM receive_details rd 
            WHERE rd.id = ?`,
            [receiveId]
        );

        if (!receiveDetails.length) {
            logEvents(`Failed to reject receive - Receive not found: ${receiveId}`, "receiveLog.log");
            throw new Error('Receive record not found');
        }

        const requestFk = receiveDetails[0].request_fk;
        const receivedBy = receiveDetails[0].received_by;
        const itemName = receiveDetails[0].item_name;

        await connection.execute(
            `UPDATE receive_details 
            SET approval_status = 'REJECTED',
                rejected_by = ?,
                rejection_reason = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [rejectedBy, rejectionReason, receiveId]
        );

        await connection.execute(
            `UPDATE request_details 
            SET is_received = FALSE,
                receive_fk = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [requestFk]
        );

        const [users] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM users WHERE username = ?',
            [receivedBy]
        );

        if (users.length === 0) {
            logEvents(`Failed to reject receive - User not found: ${receivedBy}`, "receiveLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }

        const userId = users[0].id;

        await connection.query(
            `INSERT INTO notifications 
             (user_id, reference_type, message, reference_id)
             VALUES (?, ?, ?, ?)`,
            [
                userId,
                'receive',
                `Your receive for ${itemName} has been rejected for the following reason: ${rejectionReason}`,
                receiveId
            ]
        );

        await connection.commit();
        logEvents(`Successfully rejected receive ID: ${receiveId} by user: ${rejectedBy}`, "receiveLog.log");
        res.status(200).json({
            message: 'Receive rejected successfully'
        });
    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error rejecting receive: ${errorMessage} for ID: ${receiveId} by user: ${rejectedBy}`, "receiveLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while rejecting receive'
        });
    } finally {
        connection.release();
    }
};

// Helper function to expand equipment numbers
function expandEquipmentNumbers(equipmentNumber: string): Set<string> {
    const numbers = new Set<string>();
    const parts = equipmentNumber.split(',');

    for (const part of parts) {
        const trimmedPart = part.trim();
        if (/^[A-Za-z\s]+$/.test(trimmedPart)) {
            numbers.add(trimmedPart);
        } else if (/^\d+-\d+$/.test(trimmedPart)) {
            const [start, end] = trimmedPart.split('-').map(Number);
            for (let num = start; num <= end; num++) {
                numbers.add(num.toString());
            }
        } else if (/^\d+$/.test(trimmedPart)) {
            numbers.add(trimmedPart);
        }
    }

    return numbers;
} 