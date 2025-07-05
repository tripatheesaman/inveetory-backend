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
exports.findUserByEmail = void 0;
const db_1 = __importDefault(require("../config/db"));
const logger_1 = require("../middlewares/logger");
const findUserByEmail = (email) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (0, logger_1.logEvents)(`Searching for user with email: ${email}`, "userModelLog.log");
        const [rows] = yield db_1.default.query(`SELECT u.id, u.username, u.first_name, u.last_name, u.password, u.role_id, r.role_name as role 
       FROM users u 
       JOIN roles r ON u.role_id = r.role_id 
       WHERE u.username = ?`, [email]);
        const user = rows[0];
        if (user) {
            (0, logger_1.logEvents)(`Found user with email: ${email}`, "userModelLog.log");
        }
        else {
            (0, logger_1.logEvents)(`No user found with email: ${email}`, "userModelLog.log");
        }
        return user || null;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error finding user with email ${email}: ${errorMessage}`, "userModelLog.log");
        throw new Error(`Failed to find user: ${errorMessage}`);
    }
});
exports.findUserByEmail = findUserByEmail;
