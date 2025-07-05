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
exports.getPermissions = void 0;
const db_1 = __importDefault(require("../config/db"));
const logger_1 = require("../middlewares/logger");
const getPermissions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { currentUser, userId } = req.query;
        if (!currentUser || !userId) {
            (0, logger_1.logEvents)(`Failed to fetch permissions - Missing required parameters: currentUser=${currentUser}, userId=${userId}`, "permissionLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Current user and target user ID are required'
            });
            return;
        }
        const [currentUserData] = yield db_1.default.query('SELECT id FROM users WHERE username = ?', [currentUser]);
        if (currentUserData.length === 0) {
            (0, logger_1.logEvents)(`Failed to fetch permissions - Current user not found: ${currentUser}`, "permissionLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Current user not found'
            });
            return;
        }
        const currentUserId = currentUserData[0].id;
        const [permissions] = yield db_1.default.query(`SELECT p.id, p.permission_name, p.permission_readable, p.permission_type,
                    CASE WHEN FIND_IN_SET(?, p.allowed_user_ids) > 0 THEN 1 ELSE 0 END as hasAccess
             FROM user_permissions p
             WHERE FIND_IN_SET(?, p.allowed_user_ids) > 0
             ORDER BY p.id ASC`, [userId, currentUserId]);
        (0, logger_1.logEvents)(`Successfully fetched permissions for user: ${userId} by current user: ${currentUser}`, "permissionLog.log");
        res.status(200).json(permissions);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching permissions: ${errorMessage} for user: ${req.query.userId} by current user: ${req.query.currentUser}`, "permissionLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching permissions'
        });
    }
});
exports.getPermissions = getPermissions;
