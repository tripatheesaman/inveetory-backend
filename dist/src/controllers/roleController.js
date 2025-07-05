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
exports.getRoles = void 0;
const db_1 = __importDefault(require("../config/db"));
const logger_1 = require("../middlewares/logger");
const getRoles = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { currentUser } = req.query;
        if (!currentUser) {
            (0, logger_1.logEvents)(`Failed to fetch roles - Missing current user parameter`, "roleLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Current user is required'
            });
            return;
        }
        const [currentUserRole] = yield db_1.default.query(`SELECT r.heirarchy 
             FROM users u 
             JOIN roles r ON u.role_id = r.role_id 
             WHERE u.username = ?`, [currentUser]);
        if (currentUserRole.length === 0) {
            (0, logger_1.logEvents)(`Failed to fetch roles - User role not found for user: ${currentUser}`, "roleLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Current user role not found'
            });
            return;
        }
        const currentUserHierarchy = currentUserRole[0].heirarchy;
        const [roles] = yield db_1.default.query(`SELECT role_id, role_name, heirarchy, permission_id
             FROM roles
             WHERE heirarchy >= ?
             ORDER BY heirarchy ASC`, [currentUserHierarchy]);
        (0, logger_1.logEvents)(`Successfully fetched ${roles.length} roles for user: ${currentUser} with hierarchy: ${currentUserHierarchy}`, "roleLog.log");
        res.status(200).json(roles);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching roles: ${errorMessage} for user: ${req.query.currentUser}`, "roleLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching roles'
        });
    }
});
exports.getRoles = getRoles;
