import { Request, Response } from 'express';
import pool from '../config/db';
import { Role } from '../interfaces/user';
import { logEvents } from '../middlewares/logger';

export const getRoles = async (req: Request, res: Response): Promise<void> => {
    try {
        const { currentUser } = req.query;

        if (!currentUser) {
            logEvents(`Failed to fetch roles - Missing current user parameter`, "roleLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Current user is required'
            });
            return;
        }

        const [currentUserRole] = await pool.query<Role[]>(
            `SELECT r.heirarchy 
             FROM users u 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE u.username = ?`,
            [currentUser]
        );

        if (currentUserRole.length === 0) {
            logEvents(`Failed to fetch roles - User role not found for user: ${currentUser}`, "roleLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Current user role not found'
            });
            return;
        }

        const currentUserHierarchy = currentUserRole[0].heirarchy;

        const [roles] = await pool.query<Role[]>(
            `SELECT role_id, role_name, heirarchy, permission_id
             FROM roles
             WHERE heirarchy >= ?
             ORDER BY heirarchy ASC`,
            [currentUserHierarchy]
        );

        logEvents(`Successfully fetched ${roles.length} roles for user: ${currentUser} with hierarchy: ${currentUserHierarchy}`, "roleLog.log");
        res.status(200).json(roles);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching roles: ${errorMessage} for user: ${req.query.currentUser}`, "roleLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching roles'
        });
    }
}; 