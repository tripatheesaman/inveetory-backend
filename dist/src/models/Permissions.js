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
exports.getPermissionsByUserId = void 0;
const db_1 = __importDefault(require("../config/db"));
const logger_1 = require("../middlewares/logger");
const getPermissionsByUserId = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (0, logger_1.logEvents)(`Fetching permissions for user ID: ${userId}`, "permissionsLog.log");
        const [rows] = yield db_1.default.execute(`SELECT permission_name 
       FROM user_permissions 
       WHERE FIND_IN_SET(?, allowed_user_ids) > 0 
       OR allowed_user_ids = ?`, [userId.toString(), userId.toString()]);
        const permissions = rows.map(row => row.permission_name);
        (0, logger_1.logEvents)(`Successfully fetched ${permissions.length} permissions for user ID: ${userId}`, "permissionsLog.log");
        return permissions;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching permissions for user ID ${userId}: ${errorMessage}`, "permissionsLog.log");
        throw new Error(`Failed to fetch permissions: ${errorMessage}`);
    }
});
exports.getPermissionsByUserId = getPermissionsByUserId;
