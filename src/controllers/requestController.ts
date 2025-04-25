import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { CreateRequestDTO, RequestDetail } from '../types/request';

interface StockDetail extends RowDataPacket {
    current_balance: number;
    unit: string;
}

interface ReceiveDetail extends RowDataPacket {
    total_amount: number;
    receive_quantity: number;
}

// Function to format date for MySQL
const formatDateForMySQL = (isoDate: string): string => {
    const date = new Date(isoDate);
    return date.toISOString().slice(0, 19).replace('T', ' ');
};

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
        `SELECT total_amount, receive_quantity 
         FROM receive_details 
         WHERE nac_code = ? 
         ORDER BY receive_date DESC 
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
        approval_status: 'PENDING'
    };
};

export const createRequest = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const requestData: CreateRequestDTO = req.body;
        
        // Basic validation
        if (!requestData.requestNumber || !requestData.requestDate || !requestData.items || !requestData.items.length) {
            res.status(400).json({ 
                error: 'Bad Request',
                message: 'Missing required fields: requestNumber, requestDate, and items are required' 
            });
            return;
        }

        await connection.beginTransaction();

        const requestDetails: RequestDetail[] = await Promise.all(
            requestData.items.map(item => processRequestItem(item, requestData))
        );

        for (const detail of requestDetails) {
            await connection.query(
                `INSERT INTO request_details 
                (request_number, request_date, part_number, item_name, unit, 
                 requested_quantity, current_balance, previous_rate, equipment_number, 
                 image_path, specifications, remarks, requested_by, approval_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    detail.request_number,
                    formatDateForMySQL(detail.request_date.toISOString()),
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
                    detail.approval_status
                ]
            );
        }

        await connection.commit();
        
        res.status(201).json({ 
            message: 'Request created successfully',
            requestNumber: requestData.requestNumber,
            requestDate: requestData.requestDate
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