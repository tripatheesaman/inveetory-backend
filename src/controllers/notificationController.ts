import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';

interface Notification extends RowDataPacket {
    id: number;
    reference_id: string;
    referenceType:string;
    message: string;
    created_at: Date;
    is_read: boolean;
}

interface User extends RowDataPacket {
    id: number;
}

export const getUserNotifications = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const { username } = req.params;

        // First get the user ID
        const [users] = await connection.query<User[]>(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }

        const userId = users[0].id;

        // Then get notifications for this user
        const [rows] = await connection.query<Notification[]>(
            `SELECT id, reference_id,reference_type, message, created_at, is_read
             FROM notifications
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );

        const notifications = rows.map(row => ({
            id: row.id,
            referenceNumber: row.reference_id,
            referenceType: row.reference_type,
            message: row.message,
            createdAt: row.created_at,
            isRead: row.is_read
        }));
        
        res.status(200).json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching notifications'
        });
    } finally {
        connection.release();
    }
};

export const markNotificationAsRead = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const { notificationId } = req.params;

        const [result] = await connection.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = ?',
            [notificationId]
        );

        if ((result as any).affectedRows === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Notification not found'
            });
            return;
        }
        
        res.status(200).json({ 
            message: 'Notification marked as read successfully',
            notificationId
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while marking notification as read'
        });
    } finally {
        connection.release();
    }
};

export const deleteNotification = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    
    try {
        const { notificationId } = req.params;

        const [result] = await connection.query(
            'DELETE FROM notifications WHERE id = ?',
            [notificationId]
        );

        if ((result as any).affectedRows === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Notification not found'
            });
            return;
        }
        
        res.status(200).json({ 
            message: 'Notification deleted successfully',
            notificationId
        });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while deleting notification'
        });
    } finally {
        connection.release();
    }
}; 