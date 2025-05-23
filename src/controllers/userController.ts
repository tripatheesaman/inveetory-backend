import { Request, Response } from 'express';
import pool from '../config/db';
import { User, Role, UserWithRole } from '../interfaces/user';
import bcrypt from 'bcryptjs';

export const getUsers = async (req: Request, res: Response): Promise<void> => {
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

        // Get all users with their roles where hierarchy is less than or equal to current user
        const [users] = await pool.query<UserWithRole[]>(
            `SELECT u.*, r.role_name, r.heirarchy
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             WHERE r.heirarchy >= ?
             ORDER BY r.heirarchy ASC, u.username ASC`,
            [currentUserHierarchy]
        );

        // Remove sensitive information before sending response
        const sanitizedUsers = users.map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });

        res.status(200).json(sanitizedUsers);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching users'
        });
    }
};

export const createUser = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            username,
            password,
            firstName,
            lastName,
            staffId,
            role,
            designation,
            status
        } = req.body;

        const created_by = req.body.created_by;

        // Check if username already exists
        const [existingUser] = await connection.query<User[]>(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );

        if (existingUser.length > 0) {
            await connection.rollback();
            res.status(400).json({
                error: 'Bad Request',
                message: 'Username already exists'
            });
            return;
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert new user
        const [result] = await connection.query(
            `INSERT INTO users (
                username, password, first_name, last_name, 
                staffid, role_id, designation, status, 
                created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
                username,
                hashedPassword,
                firstName,
                lastName,
                staffId,
                role,
                designation,
                status,
                created_by
            ]
        );

        const userId = (result as any).insertId;

        // Get permissions for the role
        const [rolePermissions] = await connection.query<Role[]>(
            'SELECT permission_id FROM roles WHERE role_id = ?',
            [role]
        );

        if (rolePermissions.length > 0) {
            const permissionIds = rolePermissions[0].permission_id.split(',');

            // Update allowed_user_ids for each permission
            for (const permissionId of permissionIds) {
                await connection.query(
                    `UPDATE user_permissions 
                     SET allowed_user_ids = CONCAT(
                         IF(allowed_user_ids IS NULL OR allowed_user_ids = '', ?, CONCAT(allowed_user_ids, ',', ?))
                     )
                     WHERE id = ?`,
                    [userId.toString(), userId.toString(), permissionId]
                );
            }
        }

        await connection.commit();
        res.status(201).json({
            message: 'User created successfully',
            userId
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating user:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while creating user'
        });
    } finally {
        connection.release();
    }
}; 