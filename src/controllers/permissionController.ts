import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';

interface PermissionWithAccess extends RowDataPacket {
    id: number;
    permission_name: string;
    permission_readable: string;
    permission_type: string;
    hasAccess: boolean;
}

export const getPermissions = async (req: Request, res: Response): Promise<void> => {
    try {
        const { currentUser, userId } = req.query;

        if (!currentUser || !userId) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Current user and target user ID are required'
            });
            return;
        }

        // Get current user's ID
        const [currentUserData] = await pool.query<RowDataPacket[]>(
            'SELECT id FROM users WHERE username = ?',
            [currentUser]
        );

        if (currentUserData.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Current user not found'
            });
            return;
        }

        const currentUserId = currentUserData[0].id;

        // Get all permissions that the current user has access to
        const [permissions] = await pool.query<PermissionWithAccess[]>(
            `SELECT p.id, p.permission_name, p.permission_readable, p.permission_type,
                    CASE WHEN FIND_IN_SET(?, p.allowed_user_ids) > 0 THEN 1 ELSE 0 END as hasAccess
             FROM user_permissions p
             WHERE FIND_IN_SET(?, p.allowed_user_ids) > 0
             ORDER BY p.id ASC`,
            [userId, currentUserId]
        );

        res.status(200).json(permissions);
    } catch (error) {
        console.error('Error fetching permissions:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching permissions'
        });
    }
}; 