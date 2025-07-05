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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.checkResetEligibility = exports.refreshToken = exports.login = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../models/User");
const Permissions_1 = require("../models/Permissions");
const logger_1 = require("../middlewares/logger");
const db_1 = __importDefault(require("../config/db"));
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username: email, password } = req.body;
        if (!email || !password) {
            (0, logger_1.logEvents)(`Login attempt failed - Missing credentials`, "authLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: "Email and password are required"
            });
            return;
        }
        const user = yield (0, User_1.findUserByEmail)(email);
        if (!user) {
            (0, logger_1.logEvents)(`Login attempt failed - User not found: ${email}`, "authLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: "User not found"
            });
            return;
        }
        const isMatch = yield bcryptjs_1.default.compare(password, user.password);
        if (!isMatch) {
            (0, logger_1.logEvents)(`Login attempt failed - Invalid credentials for user: ${email}`, "authLog.log");
            res.status(401).json({
                error: 'Unauthorized',
                message: "Invalid credentials"
            });
            return;
        }
        const permissions = yield (0, Permissions_1.getPermissionsByUserId)(user.id);
        const userInfo = {
            username: user.username,
            name: user.first_name + " " + user.last_name,
            role: user.role,
            id: user.id,
            permissions: permissions
        };
        const accessToken = jsonwebtoken_1.default.sign({ UserInfo: userInfo }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "7h" });
        (0, logger_1.logEvents)(`User logged in successfully: ${email}`, "authLog.log");
        res.json({
            accessToken,
            user: {
                username: user.username,
                name: user.first_name + " " + user.last_name,
                role: user.role,
                permissions: permissions
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Login error: ${errorMessage}`, "authLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: "An error occurred during login"
        });
    }
});
exports.login = login;
const refreshToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
            (0, logger_1.logEvents)(`Token refresh failed - No authorization header`, "authLog.log");
            res.status(401).json({
                error: 'Unauthorized',
                message: "No authorization header"
            });
            return;
        }
        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(token, process.env.ACCESS_TOKEN_SECRET);
        }
        catch (error) {
            (0, logger_1.logEvents)(`Token refresh failed - Invalid token: ${error instanceof Error ? error.message : 'Unknown error'}`, "authLog.log");
            res.status(403).json({
                error: 'Forbidden',
                message: "Invalid token"
            });
            return;
        }
        if (!decoded.UserInfo || !decoded.UserInfo.username) {
            (0, logger_1.logEvents)(`Token refresh failed - Invalid token payload`, "authLog.log");
            res.status(403).json({
                error: 'Forbidden',
                message: "Invalid token payload"
            });
            return;
        }
        const user = yield (0, User_1.findUserByEmail)(decoded.UserInfo.username);
        if (!user) {
            (0, logger_1.logEvents)(`Token refresh failed - User not found: ${decoded.UserInfo.username}`, "authLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: "User not found"
            });
            return;
        }
        const permissions = yield (0, Permissions_1.getPermissionsByUserId)(user.id);
        const userInfo = {
            username: user.username,
            name: user.first_name + " " + user.last_name,
            role: user.role,
            id: user.id,
            permissions: permissions
        };
        const newAccessToken = jsonwebtoken_1.default.sign({ UserInfo: userInfo }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "7h" });
        (0, logger_1.logEvents)(`Token refreshed successfully for user: ${user.username}`, "authLog.log");
        res.json({
            accessToken: newAccessToken,
            user: {
                username: user.username,
                name: user.first_name + " " + user.last_name,
                role: user.role,
                permissions: permissions
            }
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Token refresh error: ${errorMessage}`, "authLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: "An error occurred during token refresh"
        });
    }
});
exports.refreshToken = refreshToken;
const checkResetEligibility = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.body;
    if (!email) {
        res.status(400).json({
            error: 'Bad Request',
            message: 'Email is required'
        });
        return;
    }
    try {
        const [users] = yield db_1.default.execute('SELECT can_reset_password FROM users WHERE username = ?', [email]);
        if (users.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }
        const canReset = users[0].can_reset_password === 1;
        res.status(200).json({
            canReset
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error checking reset eligibility: ${errorMessage}`, "authLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
});
exports.checkResetEligibility = checkResetEligibility;
const resetPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
        res.status(400).json({
            error: 'Bad Request',
            message: 'Email and new password are required'
        });
        return;
    }
    try {
        // First check if user exists and is eligible for password reset
        const [users] = yield db_1.default.execute('SELECT id, can_reset_password FROM users WHERE username = ?', [email]);
        if (users.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }
        if (users[0].can_reset_password !== 1) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'User is not eligible for password reset'
            });
            return;
        }
        // Hash the new password
        const salt = yield bcryptjs_1.default.genSalt(10);
        const hashedPassword = yield bcryptjs_1.default.hash(newPassword, salt);
        // Update the password and reset the can_reset_password flag
        yield db_1.default.execute(`UPDATE users 
       SET password = ?, 
           can_reset_password = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`, [hashedPassword, email]);
        (0, logger_1.logEvents)(`Password reset successful for user: ${email}`, "authLog.log");
        res.status(200).json({
            message: 'Password reset successful'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error resetting password: ${errorMessage}`, "authLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
});
exports.resetPassword = resetPassword;
