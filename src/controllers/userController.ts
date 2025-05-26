import { Request, Response } from 'express';
import pool from '../config/db';
import { User, Role, UserWithRole } from '../interfaces/user';
import bcrypt from 'bcryptjs';
import { logEvents } from '../middlewares/logger';

export const getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { currentUser } = req.query;

        if (!currentUser) {
            logEvents(`Failed to fetch users - Missing currentUser parameter`, "userLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Current user is required'
            });
            return;
        }

        logEvents(`Fetching users for current user: ${currentUser}`, "userLog.log");

        // First get the current user's role hierarchy
        const [currentUserRole] = await pool.query<Role[]>(
            `SELECT r.heirarchy 
             FROM users u 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE u.username = ?`,
            [currentUser]
        );

        if (currentUserRole.length === 0) {
            logEvents(`Failed to fetch users - Current user role not found: ${currentUser}`, "userLog.log");
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

        logEvents(`Successfully fetched ${sanitizedUsers.length} users for current user: ${currentUser}`, "userLog.log");
        res.status(200).json(sanitizedUsers);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching users: ${errorMessage}`, "userLog.log");
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
        logEvents(`Starting user creation transaction`, "userLog.log");

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
        logEvents(`Creating new user: ${username} by ${created_by}`, "userLog.log");

        // Check if username already exists
        const [existingUser] = await connection.query<User[]>(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );

        if (existingUser.length > 0) {
            await connection.rollback();
            logEvents(`Failed to create user - Username already exists: ${username}`, "userLog.log");
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
            logEvents(`Assigning ${permissionIds.length} permissions to user: ${username}`, "userLog.log");

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
        logEvents(`Successfully created user: ${username} with ID: ${userId}`, "userLog.log");
        res.status(201).json({
            message: 'User created successfully',
            userId
        });
    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error creating user: ${errorMessage}`, "userLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while creating user'
        });
    } finally {
        connection.release();
    }
};

export const getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { currentUser } = req.query;

        if (!currentUser) {
            logEvents(`Failed to fetch user - Missing currentUser parameter`, "userLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Current user is required'
            });
            return;
        }

        logEvents(`Fetching user details for ID: ${id} by current user: ${currentUser}`, "userLog.log");

        // First get the current user's role hierarchy
        const [currentUserRole] = await pool.query<Role[]>(
            `SELECT r.heirarchy 
             FROM users u 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE u.username = ?`,
            [currentUser]
        );

        if (currentUserRole.length === 0) {
            logEvents(`Failed to fetch user - Current user role not found: ${currentUser}`, "userLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Current user role not found'
            });
            return;
        }

        const currentUserHierarchy = currentUserRole[0].heirarchy;

        // Get the requested user with their role
        const [users] = await pool.query<UserWithRole[]>(
            `SELECT u.*, r.role_name, r.heirarchy
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             WHERE u.id = ? AND r.heirarchy >= ?`,
            [id, currentUserHierarchy]
        );

        if (users.length === 0) {
            logEvents(`Failed to fetch user - Not found or insufficient permissions: ${id}`, "userLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found or you do not have permission to view this user'
            });
            return;
        }

        // Remove sensitive information before sending response
        const { password, ...userWithoutPassword } = users[0];

        logEvents(`Successfully fetched user details for ID: ${id}`, "userLog.log");
        res.status(200).json(userWithoutPassword);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error fetching user: ${errorMessage}`, "userLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching user'
        });
    }
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        logEvents(`Starting user update transaction for ID: ${req.params.id}`, "userLog.log");

        const { id } = req.params;
        const {
            username,
            firstName,
            lastName,
            staffId,
            role,
            designation,
            status,
            can_reset_password
        } = req.body;

        const updated_by = req.body.updated_by;
        logEvents(`Updating user: ${username} by ${updated_by}`, "userLog.log");

        // Check if username already exists for other users
        const [existingUser] = await connection.query<User[]>(
            'SELECT id FROM users WHERE username = ? AND id != ?',
            [username, id]
        );

        if (existingUser.length > 0) {
            await connection.rollback();
            logEvents(`Failed to update user - Username already exists: ${username}`, "userLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Username already exists'
            });
            return;
        }

        // Get current user's role
        const [currentUserRole] = await connection.query<Role[]>(
            'SELECT role_id FROM users WHERE id = ?',
            [id]
        );

        if (currentUserRole.length === 0) {
            await connection.rollback();
            logEvents(`Failed to update user - User not found: ${id}`, "userLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }

        const oldRoleId = currentUserRole[0].role_id;
        const roleChanged = oldRoleId !== parseInt(role);

        // Update user
        await connection.query(
            `UPDATE users 
             SET username = ?, 
                 first_name = ?, 
                 last_name = ?, 
                 staffid = ?, 
                 role_id = ?, 
                 designation = ?, 
                 status = ?,
                 can_reset_password = ?,
                 updated_by = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                username,
                firstName,
                lastName,
                staffId,
                role,
                designation,
                status,
                can_reset_password,
                updated_by,
                id
            ]
        );

        // If role changed, update permissions
        if (roleChanged) {
            logEvents(`Role changed for user ${username}, updating permissions`, "userLog.log");
            
            // First, remove user from all permissions
            await connection.query(
                `UPDATE user_permissions 
                 SET allowed_user_ids = TRIM(BOTH ',' FROM 
                     REPLACE(
                         CONCAT(',', allowed_user_ids, ','),
                         CONCAT(',', ?, ','),
                         ','
                     )
                 )`,
                [id]
            );

            // Get new role's permissions
            const [rolePermissions] = await connection.query<Role[]>(
                'SELECT permission_id FROM roles WHERE role_id = ?',
                [role]
            );

            if (rolePermissions.length > 0) {
                const permissionIds = rolePermissions[0].permission_id.split(',');
                logEvents(`Assigning ${permissionIds.length} new permissions to user: ${username}`, "userLog.log");

                // Add user to new role's permissions
                for (const permissionId of permissionIds) {
                    await connection.query(
                        `UPDATE user_permissions 
                         SET allowed_user_ids = CONCAT(
                             IF(allowed_user_ids IS NULL OR allowed_user_ids = '', ?, CONCAT(allowed_user_ids, ',', ?))
                         )
                         WHERE id = ?`,
                        [id.toString(), id.toString(), permissionId]
                    );
                }
            }
        }

        await connection.commit();
        logEvents(`Successfully updated user: ${username}`, "userLog.log");
        res.status(200).json({
            message: 'User updated successfully'
        });
    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error updating user: ${errorMessage}`, "userLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating user'
        });
    } finally {
        connection.release();
    }
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        logEvents(`Starting user deletion transaction for ID: ${req.params.id}`, "userLog.log");

        const { id } = req.params;

        // First check if user exists
        const [existingUser] = await connection.query<User[]>(
            'SELECT id, username FROM users WHERE id = ?',
            [id]
        );

        if (existingUser.length === 0) {
            await connection.rollback();
            logEvents(`Failed to delete user - User not found: ${id}`, "userLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }

        const username = existingUser[0].username;

        // Remove user from all permissions
        await connection.query(
            `UPDATE user_permissions 
             SET allowed_user_ids = TRIM(BOTH ',' FROM 
                 REPLACE(
                     CONCAT(',', allowed_user_ids, ','),
                     CONCAT(',', ?, ','),
                     ','
                 )
             )`,
            [id]
        );

        // Delete the user
        await connection.query(
            'DELETE FROM users WHERE id = ?',
            [id]
        );

        await connection.commit();
        logEvents(`Successfully deleted user: ${username}`, "userLog.log");
        res.status(200).json({
            message: 'User deleted successfully'
        });
    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error deleting user: ${errorMessage}`, "userLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while deleting user'
        });
    } finally {
        connection.release();
    }
};

export const updateUserPermissions = async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        logEvents(`Starting user permissions update transaction for ID: ${req.params.id}`, "userLog.log");

        const { id: userId } = req.params;
        const { permissions, updated_by } = req.body;

        logEvents(`Updating permissions for user ID: ${userId} by ${updated_by}`, "userLog.log");

        // Check if user exists
        const [existingUser] = await connection.query<User[]>(
            'SELECT id, username FROM users WHERE id = ?',
            [userId]
        );

        if (existingUser.length === 0) {
            await connection.rollback();
            logEvents(`Failed to update permissions - User not found: ${userId}`, "userLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }

        const username = existingUser[0].username;

        // Process each permission
        for (const permission of permissions) {
            const { permission_id, hasAccess } = permission;

            if (hasAccess === 1) {
                // Add user to permission if not already present
                await connection.query(
                    `UPDATE user_permissions 
                     SET allowed_user_ids = CONCAT(
                         IF(allowed_user_ids IS NULL OR allowed_user_ids = '', ?, CONCAT(allowed_user_ids, ',', ?))
                     )
                     WHERE id = ? AND (allowed_user_ids IS NULL OR FIND_IN_SET(?, allowed_user_ids) = 0)`,
                    [userId, userId, permission_id, userId]
                );
            } else {
                // Remove user from permission
                await connection.query(
                    `UPDATE user_permissions 
                     SET allowed_user_ids = TRIM(BOTH ',' FROM 
                         REPLACE(
                             CONCAT(',', allowed_user_ids, ','),
                             CONCAT(',', ?, ','),
                             ','
                         )
                     )
                     WHERE id = ? AND FIND_IN_SET(?, allowed_user_ids) > 0`,
                    [userId, permission_id, userId]
                );
            }
        }

        await connection.commit();
        logEvents(`Successfully updated permissions for user: ${username}`, "userLog.log");
        res.status(200).json({
            message: 'User permissions updated successfully'
        });
    } catch (error) {
        await connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error updating user permissions: ${errorMessage}`, "userLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating user permissions'
        });
    } finally {
        connection.release();
    }
}; 