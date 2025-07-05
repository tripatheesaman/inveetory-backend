"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importStar(require("jsonwebtoken"));
const logger_1 = require("./logger");
const verifyJWT = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
            (0, logger_1.logEvents)(`JWT verification failed - Invalid authorization header format`, "authLog.log");
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid authorization header format'
            });
            return;
        }
        const token = authHeader.split(' ')[1];
        if (!token) {
            (0, logger_1.logEvents)(`JWT verification failed - No token provided`, "authLog.log");
            res.status(401).json({
                error: 'Unauthorized',
                message: 'No token provided'
            });
            return;
        }
        if (!process.env.ACCESS_TOKEN_SECRET) {
            (0, logger_1.logEvents)(`JWT verification failed - ACCESS_TOKEN_SECRET not configured`, "authLog.log");
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Server configuration error'
            });
            return;
        }
        jsonwebtoken_1.default.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
            if (err) {
                if (err instanceof jsonwebtoken_1.TokenExpiredError) {
                    (0, logger_1.logEvents)(`JWT verification failed - Token expired for token: ${token.substring(0, 10)}...`, "authLog.log");
                    res.status(401).json({
                        error: 'Unauthorized',
                        message: 'Token has expired',
                        code: 'TOKEN_EXPIRED'
                    });
                    return;
                }
                if (err instanceof jsonwebtoken_1.JsonWebTokenError) {
                    (0, logger_1.logEvents)(`JWT verification failed - Invalid token: ${token.substring(0, 10)}...`, "authLog.log");
                    res.status(403).json({
                        error: 'Forbidden',
                        message: 'Invalid token',
                        code: 'INVALID_TOKEN'
                    });
                    return;
                }
                (0, logger_1.logEvents)(`JWT verification failed - Unknown error`, "authLog.log");
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'Token verification failed',
                    code: 'VERIFICATION_FAILED'
                });
                return;
            }
            const decodedUser = decoded;
            if (!decodedUser.UserInfo || !decodedUser.UserInfo.username || !decodedUser.UserInfo.role || !decodedUser.UserInfo.id) {
                (0, logger_1.logEvents)(`JWT verification failed - Invalid token payload for token: ${token.substring(0, 10)}...`, "authLog.log");
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'Invalid token payload',
                    code: 'INVALID_PAYLOAD'
                });
                return;
            }
            req.user = decodedUser.UserInfo.username;
            req.role = decodedUser.UserInfo.role;
            req.userId = decodedUser.UserInfo.id;
            req.tokenExpiry = decodedUser.exp;
            (0, logger_1.logEvents)(`JWT verification successful for user: ${decodedUser.UserInfo.username}`, "authLog.log");
            next();
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`JWT verification error: ${errorMessage}`, "authLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred during token verification',
            code: 'VERIFICATION_ERROR'
        });
    }
});
exports.default = verifyJWT;
