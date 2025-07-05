"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserPermissions = exports.deleteUser = exports.updateUser = exports.getUserById = exports.createUser = exports.getUsers = void 0;
const db_1 = __importDefault(require("../config/db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const logger_1 = require("../middlewares/logger");
const getUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { currentUser } = req.query;
        if (!currentUser) {
            (0, logger_1.logEvents)(`Failed to fetch users - Missing currentUser parameter`, "userLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Current user is required'
            });
            return;
        }
        (0, logger_1.logEvents)(`Fetching users for current user: ${currentUser}`, "userLog.log");
        // First get the current user's role hierarchy
        const [currentUserRole] = yield db_1.default.query(`SELECT r.heirarchy 
             FROM users u 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE u.username = ?`, [currentUser]);
        if (currentUserRole.length === 0) {
            (0, logger_1.logEvents)(`Failed to fetch users - Current user role not found: ${currentUser}`, "userLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Current user role not found'
            });
            return;
        }
        const currentUserHierarchy = currentUserRole[0].heirarchy;
        // Get all users with their roles where hierarchy is less than or equal to current user
        const [users] = yield db_1.default.query(`SELECT u.*, r.role_name, r.heirarchy
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             WHERE r.heirarchy >= ?
             ORDER BY r.heirarchy ASC, u.username ASC`, [currentUserHierarchy]);
        // Remove sensitive information before sending response
        const sanitizedUsers = users.map(user => {
            const { password } = user, userWithoutPassword = __rest(user, ["password"]);
            return userWithoutPassword;
        });
        (0, logger_1.logEvents)(`Successfully fetched ${sanitizedUsers.length} users for current user: ${currentUser}`, "userLog.log");
        res.status(200).json(sanitizedUsers);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching users: ${errorMessage}`, "userLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching users'
        });
    }
});
exports.getUsers = getUsers;
const createUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        (0, logger_1.logEvents)(`Starting user creation transaction`, "userLog.log");
        const { username, password, firstName, lastName, staffId, role, designation, status } = req.body;
        const created_by = req.body.created_by;
        (0, logger_1.logEvents)(`Creating new user: ${username} by ${created_by}`, "userLog.log");
        // Check if username already exists
        const [existingUser] = yield connection.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existingUser.length > 0) {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to create user - Username already exists: ${username}`, "userLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Username already exists'
            });
            return;
        }
        // Hash password
        const salt = yield bcryptjs_1.default.genSalt(10);
        const hashedPassword = yield bcryptjs_1.default.hash(password, salt);
        // Insert new user
        const [result] = yield connection.query(`INSERT INTO users (
                username, password, first_name, last_name, 
                staffid, role_id, designation, status, 
                created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [
            username,
            hashedPassword,
            firstName,
            lastName,
            staffId,
            role,
            designation,
            status,
            created_by
        ]);
        const userId = result.insertId;
        // Get permissions for the role
        const [rolePermissions] = yield connection.query('SELECT permission_id FROM roles WHERE role_id = ?', [role]);
        if (rolePermissions.length > 0) {
            const permissionIds = rolePermissions[0].permission_id.split(',');
            (0, logger_1.logEvents)(`Assigning ${permissionIds.length} permissions to user: ${username}`, "userLog.log");
            // Update allowed_user_ids for each permission
            for (const permissionId of permissionIds) {
                yield connection.query(`UPDATE user_permissions 
                     SET allowed_user_ids = CONCAT(
                         IF(allowed_user_ids IS NULL OR allowed_user_ids = '', ?, CONCAT(allowed_user_ids, ',', ?))
                     )
                     WHERE id = ?`, [userId.toString(), userId.toString(), permissionId]);
            }
        }
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully created user: ${username} with ID: ${userId}`, "userLog.log");
        res.status(201).json({
            message: 'User created successfully',
            userId
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error creating user: ${errorMessage}`, "userLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while creating user'
        });
    }
    finally {
        connection.release();
    }
});
exports.createUser = createUser;
const getUserById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { currentUser } = req.query;
        if (!currentUser) {
            (0, logger_1.logEvents)(`Failed to fetch user - Missing currentUser parameter`, "userLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Current user is required'
            });
            return;
        }
        (0, logger_1.logEvents)(`Fetching user details for ID: ${id} by current user: ${currentUser}`, "userLog.log");
        // First get the current user's role hierarchy
        const [currentUserRole] = yield db_1.default.query(`SELECT r.heirarchy 
             FROM users u 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE u.username = ?`, [currentUser]);
        if (currentUserRole.length === 0) {
            (0, logger_1.logEvents)(`Failed to fetch user - Current user role not found: ${currentUser}`, "userLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Current user role not found'
            });
            return;
        }
        const currentUserHierarchy = currentUserRole[0].heirarchy;
        // Get the requested user with their role
        const [users] = yield db_1.default.query(`SELECT u.*, r.role_name, r.heirarchy
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             WHERE u.id = ? AND r.heirarchy >= ?`, [id, currentUserHierarchy]);
        if (users.length === 0) {
            (0, logger_1.logEvents)(`Failed to fetch user - Not found or insufficient permissions: ${id}`, "userLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found or you do not have permission to view this user'
            });
            return;
        }
        // Remove sensitive information before sending response
        const _a = users[0], { password } = _a, userWithoutPassword = __rest(_a, ["password"]);
        (0, logger_1.logEvents)(`Successfully fetched user details for ID: ${id}`, "userLog.log");
        res.status(200).json(userWithoutPassword);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching user: ${errorMessage}`, "userLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching user'
        });
    }
});
exports.getUserById = getUserById;
const updateUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        (0, logger_1.logEvents)(`Starting user update transaction for ID: ${req.params.id}`, "userLog.log");
        const { id } = req.params;
        const { username, firstName, lastName, staffId, role, designation, status, can_reset_password } = req.body;
        const updated_by = req.body.updated_by;
        (0, logger_1.logEvents)(`Updating user: ${username} by ${updated_by}`, "userLog.log");
        // Check if username already exists for other users
        const [existingUser] = yield connection.query('SELECT id FROM users WHERE username = ? AND id != ?', [username, id]);
        if (existingUser.length > 0) {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to update user - Username already exists: ${username}`, "userLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Username already exists'
            });
            return;
        }
        // Get current user's role
        const [currentUserRole] = yield connection.query('SELECT role_id FROM users WHERE id = ?', [id]);
        if (currentUserRole.length === 0) {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to update user - User not found: ${id}`, "userLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }
        const oldRoleId = currentUserRole[0].role_id;
        const roleChanged = oldRoleId !== parseInt(role);
        // Update user
        yield connection.query(`UPDATE users 
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
             WHERE id = ?`, [
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
        ]);
        // If role changed, update permissions
        if (roleChanged) {
            (0, logger_1.logEvents)(`Role changed for user ${username}, updating permissions`, "userLog.log");
            // First, remove user from all permissions
            yield connection.query(`UPDATE user_permissions 
                 SET allowed_user_ids = TRIM(BOTH ',' FROM 
                     REPLACE(
                         CONCAT(',', allowed_user_ids, ','),
                         CONCAT(',', ?, ','),
                         ','
                     )
                 )`, [id]);
            // Get new role's permissions
            const [rolePermissions] = yield connection.query('SELECT permission_id FROM roles WHERE role_id = ?', [role]);
            if (rolePermissions.length > 0) {
                const permissionIds = rolePermissions[0].permission_id.split(',');
                (0, logger_1.logEvents)(`Assigning ${permissionIds.length} new permissions to user: ${username}`, "userLog.log");
                // Add user to new role's permissions
                for (const permissionId of permissionIds) {
                    yield connection.query(`UPDATE user_permissions 
                         SET allowed_user_ids = CONCAT(
                             IF(allowed_user_ids IS NULL OR allowed_user_ids = '', ?, CONCAT(allowed_user_ids, ',', ?))
                         )
                         WHERE id = ?`, [id.toString(), id.toString(), permissionId]);
                }
            }
        }
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully updated user: ${username}`, "userLog.log");
        res.status(200).json({
            message: 'User updated successfully'
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error updating user: ${errorMessage}`, "userLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating user'
        });
    }
    finally {
        connection.release();
    }
});
exports.updateUser = updateUser;
const deleteUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        (0, logger_1.logEvents)(`Starting user deletion transaction for ID: ${req.params.id}`, "userLog.log");
        const { id } = req.params;
        // First check if user exists
        const [existingUser] = yield connection.query('SELECT id, username FROM users WHERE id = ?', [id]);
        if (existingUser.length === 0) {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to delete user - User not found: ${id}`, "userLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }
        const username = existingUser[0].username;
        // Remove user from all permissions
        yield connection.query(`UPDATE user_permissions 
             SET allowed_user_ids = TRIM(BOTH ',' FROM 
                 REPLACE(
                     CONCAT(',', allowed_user_ids, ','),
                     CONCAT(',', ?, ','),
                     ','
                 )
             )`, [id]);
        // Delete the user
        yield connection.query('DELETE FROM users WHERE id = ?', [id]);
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully deleted user: ${username}`, "userLog.log");
        res.status(200).json({
            message: 'User deleted successfully'
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error deleting user: ${errorMessage}`, "userLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while deleting user'
        });
    }
    finally {
        connection.release();
    }
});
exports.deleteUser = deleteUser;
const updateUserPermissions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        (0, logger_1.logEvents)(`Starting user permissions update transaction for ID: ${req.params.id}`, "userLog.log");
        const { id: userId } = req.params;
        const { permissions, updated_by } = req.body;
        (0, logger_1.logEvents)(`Updating permissions for user ID: ${userId} by ${updated_by}`, "userLog.log");
        // Check if user exists
        const [existingUser] = yield connection.query('SELECT id, username FROM users WHERE id = ?', [userId]);
        if (existingUser.length === 0) {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to update permissions - User not found: ${userId}`, "userLog.log");
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
                yield connection.query(`UPDATE user_permissions 
                     SET allowed_user_ids = CONCAT(
                         IF(allowed_user_ids IS NULL OR allowed_user_ids = '', ?, CONCAT(allowed_user_ids, ',', ?))
                     )
                     WHERE id = ? AND (allowed_user_ids IS NULL OR FIND_IN_SET(?, allowed_user_ids) = 0)`, [userId, userId, permission_id, userId]);
            }
            else {
                // Remove user from permission
                yield connection.query(`UPDATE user_permissions 
                     SET allowed_user_ids = TRIM(BOTH ',' FROM 
                         REPLACE(
                             CONCAT(',', allowed_user_ids, ','),
                             CONCAT(',', ?, ','),
                             ','
                         )
                     )
                     WHERE id = ? AND FIND_IN_SET(?, allowed_user_ids) > 0`, [userId, permission_id, userId]);
            }
        }
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully updated permissions for user: ${username}`, "userLog.log");
        res.status(200).json({
            message: 'User permissions updated successfully'
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error updating user permissions: ${errorMessage}`, "userLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating user permissions'
        });
    }
    finally {
        connection.release();
    }
});
exports.updateUserPermissions = updateUserPermissions;
