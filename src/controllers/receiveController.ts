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

            // Insert receive detail with the specific request_fk and image_path
            const [result] = await connection.execute(
                `INSERT INTO receive_details 
                (receive_date, request_fk, nac_code, part_number, item_name, received_quantity, unit, approval_status, approved_by, image_path, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [
                    formattedDate,
                    item.requestId,  // Use the specific request ID for this item
                    item.nacCode,
                    item.partNumber,
                    item.itemName,
                    item.receiveQuantity,
                    item.unit,
                    receiveData.receivedBy,
                    item.imagePath
                ]
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
                rd.image_path as received_image
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

        const formattedResponse = {
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