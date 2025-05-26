import { Request, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../config/db';
import { logEvents } from '../middlewares/logger';

interface Notification extends RowDataPacket {
    id: number;
    reference_id: string;
    reference_type: string;
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

        const [users] = await connection.query<User[]>(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            logEvents(`Failed to fetch notifications - User not found: ${username}`, "notificationLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }

        const userId = users[0].id;

        const [rows] = await connection.query<Notification[]>(
            `SELECT id, reference_id, reference_type, message, created_at, is_read
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
        
        logEvents(`Successfully fetched ${notifications.length} notifications for user: ${username}`, "notificationLog.log");
        res.status(200).json(notifications);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching notifications: ${errorMessage}`, "notificationLog.log");
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

        const [result] = await connection.query<ResultSetHeader>(
            'UPDATE notifications SET is_read = TRUE WHERE id = ?',
            [notificationId]
        );

        if (result.affectedRows === 0) {
            logEvents(`Failed to mark notification as read - Notification not found: ${notificationId}`, "notificationLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Notification not found'
            });
            return;
        }
        
        logEvents(`Successfully marked notification as read: ${notificationId}`, "notificationLog.log");
        res.status(200).json({ 
            message: 'Notification marked as read successfully',
            notificationId
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error marking notification as read: ${errorMessage} for notification: ${req.params.notificationId}`, "notificationLog.log");
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

        const [result] = await connection.query<ResultSetHeader>(
            'DELETE FROM notifications WHERE id = ?',
            [notificationId]
        );

        if (result.affectedRows === 0) {
            logEvents(`Failed to delete notification - Notification not found: ${notificationId}`, "notificationLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Notification not found'
            });
            return;
        }
        
        logEvents(`Successfully deleted notification: ${notificationId}`, "notificationLog.log");
        res.status(200).json({ 
            message: 'Notification deleted successfully',
            notificationId
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error deleting notification: ${errorMessage} for notification: ${req.params.notificationId}`, "notificationLog.log");
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while deleting notification'
        });
    } finally {
        connection.release();
    }
}; 