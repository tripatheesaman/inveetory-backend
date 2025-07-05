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
exports.deleteNotification = exports.markNotificationAsRead = exports.getUserNotifications = void 0;
const db_1 = __importDefault(require("../config/db"));
const logger_1 = require("../middlewares/logger");
const getUserNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        const { username } = req.params;
        const [users] = yield connection.query('SELECT id FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            (0, logger_1.logEvents)(`Failed to fetch notifications - User not found: ${username}`, "notificationLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }
        const userId = users[0].id;
        const [rows] = yield connection.query(`SELECT id, reference_id, reference_type, message, created_at, is_read
             FROM notifications
             WHERE user_id = ?
             ORDER BY created_at DESC`, [userId]);
        const notifications = rows.map(row => ({
            id: row.id,
            referenceNumber: row.reference_id,
            referenceType: row.reference_type,
            message: row.message,
            createdAt: row.created_at,
            isRead: row.is_read
        }));
        (0, logger_1.logEvents)(`Successfully fetched ${notifications.length} notifications for user: ${username}`, "notificationLog.log");
        res.status(200).json(notifications);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching notifications: ${errorMessage}`, "notificationLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching notifications'
        });
    }
    finally {
        connection.release();
    }
});
exports.getUserNotifications = getUserNotifications;
const markNotificationAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        const { notificationId } = req.params;
        const [result] = yield connection.query('UPDATE notifications SET is_read = TRUE WHERE id = ?', [notificationId]);
        if (result.affectedRows === 0) {
            (0, logger_1.logEvents)(`Failed to mark notification as read - Notification not found: ${notificationId}`, "notificationLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Notification not found'
            });
            return;
        }
        (0, logger_1.logEvents)(`Successfully marked notification as read: ${notificationId}`, "notificationLog.log");
        res.status(200).json({
            message: 'Notification marked as read successfully',
            notificationId
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error marking notification as read: ${errorMessage} for notification: ${req.params.notificationId}`, "notificationLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while marking notification as read'
        });
    }
    finally {
        connection.release();
    }
});
exports.markNotificationAsRead = markNotificationAsRead;
const deleteNotification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        const { notificationId } = req.params;
        const [result] = yield connection.query('DELETE FROM notifications WHERE id = ?', [notificationId]);
        if (result.affectedRows === 0) {
            (0, logger_1.logEvents)(`Failed to delete notification - Notification not found: ${notificationId}`, "notificationLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Notification not found'
            });
            return;
        }
        (0, logger_1.logEvents)(`Successfully deleted notification: ${notificationId}`, "notificationLog.log");
        res.status(200).json({
            message: 'Notification deleted successfully',
            notificationId
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error deleting notification: ${errorMessage} for notification: ${req.params.notificationId}`, "notificationLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while deleting notification'
        });
    }
    finally {
        connection.release();
    }
});
exports.deleteNotification = deleteNotification;
