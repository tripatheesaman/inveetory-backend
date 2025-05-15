import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { CreateRequestDTO, RequestDetail } from '../types/request';
import { formatDate, formatDateForDB } from '../utils/dateUtils';

interface StockDetail extends RowDataPacket {
    current_balance: number;
    unit: string;
}

interface ReceiveDetail extends RowDataPacket {
    total_amount: number;
    receive_quantity: number;
}

interface PendingRequest extends RowDataPacket {
    request_number: string;
    request_date: Date;
    requested_by: string;
}

interface RequestItem extends RowDataPacket {
    id: number;
    request_number: string;
    item_name: string;
    part_number: string;
    equipment_number: string;
    requested_quantity: number;
    image_path: string;
    specifications: string;
    remarks: string;
}

interface UpdateRequestDTO {
    requestNumber: string;
    requestDate: string;
    remarks: string;
    items: Array<{
        id?: number;
        requestNumber: string;
        partNumber: string;
        itemName: string;
        requestedQuantity: number;
        equipmentNumber: string;
        specifications: string;
        imageUrl: string;
        approvalStatus?: string;
    }>;
}

interface ApproveRequestDTO {
    approvedBy: string;
}

interface RejectRequestDTO {
    rejectedBy: string;
    rejectionReason: string;
}

interface RequestWithItems extends RowDataPacket {
    id: number;
    request_number: string;
    request_date: Date;
    part_number: string;
    item_name: string;
    unit: string;
    requested_quantity: number;
    current_balance: number | string;
    previous_rate: number | string;
    equipment_number: string;
    image_path: string;
    specifications: string;
    remarks: string;
    requested_by: string;
    approval_status: string;
    nac_code: string;
}

interface SearchRequestResult extends RowDataPacket {
    id: number;
    request_number: string;
    request_date: Date;
    requested_by: string;
    part_number: string;
    item_name: string;
    equipment_number: string;
    requested_quantity: number;
    approval_status: string;
}

// Helper function to format date for MySQL
function formatDateForMySQL(dateString: string): string {
    const date = new Date(dateString);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

// Function to get stock details
const getStockDetails = async (nacCode: string): Promise<StockDetail | null> => {
    const [rows] = await pool.query<StockDetail[]>(
        'SELECT current_balance, unit FROM stock_details WHERE nac_code = ?',
        [nacCode]
    );
    return rows[0] || null;
};

// Function to get previous rate
const getPreviousRate = async (nacCode: string): Promise<string | number> => {
    const [rows] = await pool.query<ReceiveDetail[]>(
        `SELECT rd.received_quantity, rd.receive_date
         FROM rrp_details rrp
         JOIN receive_details rd ON rrp.receive_fk = rd.id
         WHERE rd.nac_code = ? 
         ORDER BY rd.receive_date DESC 
         LIMIT 1`,
        [nacCode]
    );

    if (rows[0]) {
        return Number((rows[0].total_amount / rows[0].receive_quantity).toFixed(2));
    }
    return 'N/A';
};

// Function to process request item
const processRequestItem = async (
    item: CreateRequestDTO['items'][0],
    requestData: CreateRequestDTO
): Promise<RequestDetail> => {
    let currentBalance: number | string = 'N/A';
    let unit = item.unit || 'N/A';

    if (item.nacCode !== 'N/A') {
        const stockDetail = await getStockDetails(item.nacCode);
        if (stockDetail) {
            currentBalance = stockDetail.current_balance;
            unit = stockDetail.unit;
        }
    }

    const previousRate = await getPreviousRate(item.nacCode);

    return {
        request_number: requestData.requestNumber,
        request_date: new Date(requestData.requestDate),
        part_number: item.partNumber,
        item_name: item.itemName,
        unit,
        requested_quantity: item.requestQuantity,
        current_balance: currentBalance,
        previous_rate: previousRate,
        equipment_number: item.equipmentNumber,
        image_path: item.imagePath,
        specifications: item.specifications,
        remarks: requestData.remarks,
        requested_by: requestData.requestedBy,
        approval_status: 'PENDING',
        nac_code: item.nacCode
    };
};

export const createRequest = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const requestData: CreateRequestDTO = req.body;
        
        // Process each item
        const requestDetails = await Promise.all(
            requestData.items.map(item => processRequestItem(item, requestData))
        );

        for (const detail of requestDetails) {
            await connection.query(
                `INSERT INTO request_details 
                (request_number, request_date, part_number, item_name, unit, 
                 requested_quantity, current_balance, previous_rate, equipment_number, 
                 image_path, specifications, remarks, requested_by, approval_status, nac_code)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    detail.request_number,
                    formatDateForDB(detail.request_date),
                    detail.part_number,
                    detail.item_name,
                    detail.unit,
                    detail.requested_quantity,
                    detail.current_balance,
                    detail.previous_rate,
                    detail.equipment_number,
                    detail.image_path,
                    detail.specifications,
                    detail.remarks,
                    detail.requested_by,
                    detail.approval_status,
                    detail.nac_code
                ]
            );
        }

        await connection.commit();
        
        res.status(201).json({ 
            message: 'Request created successfully',
            requestNumber: requestData.requestNumber,
            requestDate: formatDate(requestData.requestDate)
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating request:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while creating the request'
        });
    } finally {
        connection.release();
    }
};

export const getPendingRequests = async (req: Request, res: Response): Promise<void> => {
    try {
        const [rows] = await pool.query<PendingRequest[]>(
            `SELECT id,request_number, request_date, requested_by 
             FROM request_details 
             WHERE approval_status = 'PENDING'`
        );

        const pendingRequests = rows.map(row => ({
            requestId:row.id,
            requestNumber: row.request_number,
            requestDate: row.request_date,
            requestedBy: row.requested_by
        }));
        
        res.status(200).json(pendingRequests);
    } catch (error) {
        console.error('Error fetching pending requests:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching pending requests'
        });
    }
};

export const getRequestItems = async (req: Request, res: Response): Promise<void> => {
    try {
        const { requestNumber } = req.params;

        const [rows] = await pool.query<RequestItem[]>(
            `SELECT id, request_number, item_name, part_number, equipment_number, 
                    requested_quantity, image_path, specifications, remarks
             FROM request_details 
             WHERE request_number = ?`,
            [requestNumber]
        );

        const requestItems = rows.map(row => ({
            id: row.id,
            requestNumber: row.request_number,
            itemName: row.item_name,
            partNumber: row.part_number,
            equipmentNumber: row.equipment_number,
            requestedQuantity: row.requested_quantity,
            imageUrl: row.image_path,
            specifications: row.specifications,
            remarks: row.remarks
        }));
        
        res.status(200).json(requestItems);
    } catch (error) {
        console.error('Error fetching request items:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching request items'
        });
    }
};

export const updateRequest = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const { requestNumber: newRequestNumber, requestDate, remarks, items }: UpdateRequestDTO = req.body;
        const { requestNumber: oldRequestNumber } = req.params;
        await connection.beginTransaction();

        // Get existing items for this request
        const [existingItems] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM request_details WHERE request_number = ?',
            [oldRequestNumber]
        );

        const existingItemIds = existingItems.map(item => item.id);
        const updatedItemIds = items.filter(item => item.id).map(item => item.id);

        // Delete items that are no longer in the request
        const itemsToDelete = existingItemIds.filter(id => !updatedItemIds.includes(id));
        if (itemsToDelete.length > 0) {
            await connection.query(
                'DELETE FROM request_details WHERE id IN (?)',
                [itemsToDelete]
            );
        }

        // Update or insert items
        for (const item of items) {
            if (item.id) {
                // Update existing item
                const updateFields = [
                    'request_number = ?',
                    'request_date = ?',
                    'part_number = ?',
                    'item_name = ?',
                    'requested_quantity = ?',
                    'equipment_number = ?',
                    'specifications = ?',
                    'image_path = ?',
                    'remarks = ?'
                ];
                const updateValues = [
                    newRequestNumber,
                    formatDateForDB(requestDate),
                    item.partNumber,
                    item.itemName,
                    item.requestedQuantity,
                    item.equipmentNumber,
                    item.specifications,
                    item.imageUrl,
                    remarks
                ];

                // Add approval_status to update if provided
                if (item.approvalStatus) {
                    updateFields.push('approval_status = ?');
                    updateValues.push(item.approvalStatus);
                }

                await connection.query(
                    `UPDATE request_details 
                     SET ${updateFields.join(', ')}
                     WHERE id = ?`,
                    [...updateValues, item.id]
                );
            } else {
                // Insert new item
                const insertFields = [
                    'request_number',
                    'request_date',
                    'part_number',
                    'item_name',
                    'requested_quantity',
                    'equipment_number',
                    'specifications',
                    'image_path',
                    'remarks',
                    'approval_status'
                ];
                const insertValues = [
                    newRequestNumber,
                    formatDateForDB(requestDate),
                    item.partNumber,
                    item.itemName,
                    item.requestedQuantity,
                    item.equipmentNumber,
                    item.specifications,
                    item.imageUrl,
                    remarks,
                    item.approvalStatus || 'PENDING'
                ];

                await connection.query(
                    `INSERT INTO request_details 
                     (${insertFields.join(', ')})
                     VALUES (${insertValues.map(() => '?').join(', ')})`,
                    insertValues
                ); 
            }
        }

        await connection.commit();
        
        res.status(200).json({ 
            message: 'Request updated successfully',
            requestNumber: newRequestNumber
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating request:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating the request'
        });
    } finally {
        connection.release();
    }
};

export const approveRequest = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const { requestNumber } = req.params;
        const { approvedBy } = req.body as ApproveRequestDTO;

        await connection.beginTransaction();

        // Update all items for this request
        await connection.query(
            `UPDATE request_details 
             SET approval_status = 'APPROVED',
                 approved_by = ?
             WHERE request_number = ?`,
            [approvedBy, requestNumber]
        );

        await connection.commit();
        
        res.status(200).json({ 
            message: 'Request approved successfully',
            requestNumber
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error approving request:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while approving the request'
        });
    } finally {
        connection.release();
    }
};

export const rejectRequest = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const { requestNumber } = req.params;
        const { rejectedBy, rejectionReason } = req.body as RejectRequestDTO;

        await connection.beginTransaction();

        // Get the first item's ID and the requested_by username
        const [requestDetails] = await connection.query<RowDataPacket[]>(
            `SELECT id, requested_by 
             FROM request_details 
             WHERE request_number = ? 
             ORDER BY id ASC 
             LIMIT 1`,
            [requestNumber]
        );

        if (requestDetails.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Request not found'
            });
            return;
        }

        const firstItemId = requestDetails[0].id;
        const requestedBy = requestDetails[0].requested_by;

        // Get the user ID from the username
        const [users] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM users WHERE username = ?',
            [requestedBy]
        );

        if (users.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }

        const userId = users[0].id;

        // Update all items for this request
        await connection.query(
            `UPDATE request_details 
             SET approval_status = 'REJECTED',
                 rejected_by = ?,
                 rejection_reason = ?
             WHERE request_number = ?`,
            [rejectedBy, rejectionReason, requestNumber]
        );

        // Create notification
        await connection.query(
            `INSERT INTO notifications 
             (user_id, reference_type, message, reference_id)
             VALUES (?, ?, ?, ?)`,
            [
                userId,
                'request',
                `Your request number ${requestNumber} has been rejected for the following reason: ${rejectionReason}`,
                firstItemId
            ]
        );

        await connection.commit();
        
        res.status(200).json({ 
            message: 'Request rejected successfully',
            requestNumber
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error rejecting request:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while rejecting the request'
        });
    } finally {
        connection.release();
    }
};

export const getRequestById = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const { id } = req.params;

        // First get the request number for this ID
        const [requestRows] = await connection.query<RowDataPacket[]>(
            'SELECT request_number FROM request_details WHERE id = ?',
            [id]
        );

        if (requestRows.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Request not found'
            });
            return;
        }

        const requestNumber = requestRows[0].request_number;

        // Then get all items for this request number
        const [items] = await connection.query<RequestWithItems[]>(
            `SELECT id, request_number, request_date, part_number, item_name, unit,
                    requested_quantity, current_balance, previous_rate, equipment_number,
                    image_path, specifications, remarks, requested_by, approval_status, nac_code
             FROM request_details
             WHERE request_number = ?
             ORDER BY id`,
            [requestNumber]
        );

        if (items.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Request items not found'
            });
            return;
        }

        const requestDetails = {
            requestNumber: items[0].request_number,
            requestDate: items[0].request_date,
            requestedBy: items[0].requested_by,
            approvalStatus: items[0].approval_status,
            items: items.map(item => ({
                id: item.id,
                partNumber: item.part_number,
                itemName: item.item_name,
                unit: item.unit,
                requestedQuantity: item.requested_quantity,
                currentBalance: item.current_balance,
                previousRate: item.previous_rate,
                equipmentNumber: item.equipment_number,
                imageUrl: item.image_path,
                specifications: item.specifications,
                remarks: item.remarks,
                nacCode: item.nac_code
            }))
        };
        
        res.status(200).json(requestDetails);
    } catch (error) {
        console.error('Error fetching request:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching the request'
        });
    } finally {
        connection.release();
    }
};

export const searchRequests = async (req: Request, res: Response): Promise<void> => {
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
                rd.nac_code
            FROM request_details rd
            WHERE 1=1
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
                nacCode: result.nac_code
            });
            return acc;
        }, {} as Record<string, any>);

        const response = Object.values(groupedResults);
        res.json(response);
    } catch (error) {
        console.error('Error searching requests:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while searching requests'
        });
    }
}; 