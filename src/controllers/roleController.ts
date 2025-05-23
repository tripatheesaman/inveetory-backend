import { Request, Response } from 'express';
import pool from '../config/db';
import { Role } from '../interfaces/user';

export const getRoles = async (req: Request, res: Response): Promise<void> => {
    try {
        const { currentUser } = req.query;

        if (!currentUser) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Current user is required'
            });
            return;
        }

        // First get the current user's role hierarchy
        const [currentUserRole] = await pool.query<Role[]>(
            `SELECT r.heirarchy 
             FROM users u 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE u.username = ?`,
            [currentUser]
        );

        if (currentUserRole.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Current user role not found'
            });
            return;
        }

        const currentUserHierarchy = currentUserRole[0].heirarchy;

        // Get all roles where hierarchy is greater than or equal to current user's hierarchy
        const [roles] = await pool.query<Role[]>(
            `SELECT role_id, role_name, heirarchy, permission_id
             FROM roles
             WHERE heirarchy >= ?
             ORDER BY heirarchy ASC`,
            [currentUserHierarchy]
        );

        res.status(200).json(roles);
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching roles'
        });
    }
}; 