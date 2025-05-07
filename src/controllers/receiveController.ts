import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';

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

        const pendingReceives = results.map(item => {
            const date = new Date(item.receive_date);
            const formattedDate = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
            
            return {
                id: item.id,
                nacCode: item.nac_code,
                itemName: item.item_name,
                partNumber: item.part_number,
                receivedQuantity: item.received_quantity,
                receiveDate: formattedDate,
                equipmentNumber: item.equipment_number
            };
        });

        res.status(200).json(pendingReceives);
    } catch (error) {
        console.error('Error fetching pending receives:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching pending receives'
        });
    }
};

export const searchReceivables = async (req: Request, res: Response): Promise<void> => {
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
                rd.remarks
            FROM request_details rd
            WHERE rd.approval_status = 'APPROVED'
            AND rd.is_received = FALSE
        `;
        const params: (string | number)[] = [];

        // Add search conditions with AND logic
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

        // Add LIMIT to prevent overwhelming results
        query += ' ORDER BY rd.request_date DESC LIMIT 50';

        const [results] = await pool.execute<SearchRequestResult[]>(query, params);
        
        // Group results by request number
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
                remarks: result.remarks
            });
            return acc;
        }, {} as Record<string, any>);

        const response = Object.values(groupedResults);
        res.json(response);
    } catch (error) {
        console.error('Error searching receivables:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while searching receivables'
        });
    }
};

export const createReceive = async (req: Request, res: Response): Promise<void> => {
    const receiveData: ReceiveRequest = req.body;

    // Input validation
    if (!receiveData.receiveDate || !receiveData.receivedBy || !receiveData.items || receiveData.items.length === 0) {
        res.status(400).json({
            error: 'Bad Request',
            message: 'Missing required fields'
        });
        return;
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Format the date to YYYY-MM-DD format
        const formattedDate = new Date(receiveData.receiveDate).toISOString().split('T')[0];

        // Insert all items into receive_details table and store their IDs
        const receiveIds: number[] = [];
        for (const item of receiveData.items) {
            // First verify that the request exists
            const [requestCheck] = await connection.execute(
                `SELECT id, request_number FROM request_details 
                WHERE id = ?`,
                [item.requestId]
            );

            if (!(requestCheck as any[]).length) {
                throw new Error(`Request ID ${item.requestId} not found`);
            }

            const requestNumber = (requestCheck as any[])[0].request_number;

            // Build dynamic columns and values for optional fields
            const columns = [
                'receive_date', 'request_fk', 'nac_code', 'part_number', 'item_name',
                'received_quantity', 'unit', 'approval_status', 'approved_by', 'image_path'
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

            // Add optional fields if they exist
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

            // Update the specific request with its corresponding receive_fk
            await connection.execute(
                `UPDATE request_details 
                SET is_received = TRUE, receive_fk = ?
                WHERE id = ?`,
                [receiveId, item.requestId]
            );
        }

        await connection.commit();
        res.status(201).json({
            message: 'Items received successfully',
            receiveIds
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating receive:', error);
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
            res.status(404).json({
                error: 'Not Found',
                message: 'Receive details not found'
            });
            return;
        }

        const result = results[0];
        const requestDate = new Date(result.request_date);
        const receiveDate = new Date(result.receive_date);

        const formattedResponse: any = {
            receiveId: parseInt(receiveId),
            requestNumber: result.request_number,
            requestDate: `${requestDate.getFullYear()}/${String(requestDate.getMonth() + 1).padStart(2, '0')}/${String(requestDate.getDate()).padStart(2, '0')}`,
            receiveDate: `${receiveDate.getFullYear()}/${String(receiveDate.getMonth() + 1).padStart(2, '0')}/${String(receiveDate.getDate()).padStart(2, '0')}`,
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
        res.status(200).json(formattedResponse);
    } catch (error) {
        console.error('Error fetching receive details:', error);
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
        console.log(receivedQuantity);
        console.log(receiveId);
        // Input validation
        if (!receivedQuantity || typeof receivedQuantity !== 'number' || receivedQuantity <= 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Valid received quantity is required'
            });
            return;
        }

        // Update the receive details
        const [result] = await pool.execute(
            `UPDATE receive_details 
            SET received_quantity = ?, 
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [receivedQuantity, receiveId]
        );

        const affectedRows = (result as any).affectedRows;

        if (affectedRows === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Receive record not found'
            });
            return;
        }

        res.status(200).json({
            message: 'Receive quantity updated successfully',
            receiveId,
            receivedQuantity
        });
    } catch (error) {
        console.error('Error updating receive quantity:', error);
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

        // 1. Get receive details with equipment_number from request_details
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
            throw new Error('Receive record not found');
        }

        const receive = receiveDetails[0];

        // 2. Update receive approval status
        await connection.execute(
            `UPDATE receive_details 
            SET approval_status = 'APPROVED',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [receiveId]
        );

        // 3. Check if stock record exists for this NAC code
        const [stockDetails] = await connection.execute<StockDetailResult[]>(
            `SELECT * FROM stock_details 
            WHERE nac_code = ?`,
            [receive.nac_code]
        );

        if (stockDetails.length > 0) {
            // Stock record exists - update it
            const stock = stockDetails[0];
            
            // Update current balance - ensure proper numeric addition
            const currentBalance = typeof stock.current_balance === 'string' 
                ? parseFloat(stock.current_balance) 
                : stock.current_balance;
            const receivedQty = typeof receive.received_quantity === 'string'
                ? parseFloat(receive.received_quantity)
                : receive.received_quantity;
            const newBalance = currentBalance + receivedQty;

            // Update part numbers - only add if not exists
            let partNumbers = stock.part_numbers.split(',').map(pn => pn.trim()).filter(pn => pn !== '');
            if (!partNumbers.includes(receive.part_number)) {
                partNumbers = [receive.part_number, ...partNumbers];
            }
            const updatedPartNumbers = partNumbers.join(',');

            // Update item names - only add if not exists
            let itemNames = stock.item_name.split(',').map(name => name.trim()).filter(name => name !== '');
            if (!itemNames.includes(receive.item_name)) {
                itemNames = [receive.item_name, ...itemNames];
            }
            const updatedItemNames = itemNames.join(',');

            // Process equipment numbers
            const existingEquipmentNumbers = new Set(stock.applicable_equipments.split(',').map(num => num.trim()).filter(num => num !== ''));
            const newEquipmentNumbers = expandEquipmentNumbers(receive.equipment_number);
            const uniqueNewNumbers = Array.from(newEquipmentNumbers).filter(num => !existingEquipmentNumbers.has(num));
            
            const updatedEquipmentNumbers = uniqueNewNumbers.length > 0 
                ? [...uniqueNewNumbers, ...Array.from(existingEquipmentNumbers)].join(',')
                : stock.applicable_equipments;

            // Prepare update query with optional fields
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

            // Add optional fields if they exist in receive record
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

            // Add receiveId to updateValues
            updateValues.push(stock.id);

            // Execute update
            await connection.execute(
                `UPDATE stock_details 
                SET ${updateFields.join(', ')},
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                updateValues
            );
        } else {
            // No stock record exists - create new one
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

            // Add optional fields if they exist
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
        }

        await connection.commit();
        res.status(200).json({
            message: 'Receive approved and stock updated successfully'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error approving receive:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while approving receive'
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
            // If it's purely alphabets & spaces
            numbers.add(trimmedPart);
        } else if (/^\d+-\d+$/.test(trimmedPart)) {
            // If it's a number range (e.g., "1000-1024")
            const [start, end] = trimmedPart.split('-').map(Number);
            for (let num = start; num <= end; num++) {
                numbers.add(num.toString());
            }
        } else if (/^\d+$/.test(trimmedPart)) {
            // If it's a single number
            numbers.add(trimmedPart);
        }
    }

    return numbers;
} 