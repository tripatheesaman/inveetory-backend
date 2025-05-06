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

            // Insert receive detail with the specific request_fk
            const [result] = await connection.execute(
                `INSERT INTO receive_details 
                (receive_date, request_fk, nac_code, part_number, item_name, received_quantity, unit, approval_status, approved_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [
                    formattedDate,
                    item.requestId,  // Use the specific request ID for this item
                    item.nacCode,
                    item.partNumber,
                    item.itemName,
                    item.receiveQuantity,
                    item.unit,
                    receiveData.receivedBy
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