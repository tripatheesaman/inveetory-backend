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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const logger_1 = require("./middlewares/logger");
const errorhandler_1 = __importDefault(require("./middlewares/errorhandler"));
const verifyJWT_1 = __importDefault(require("./middlewares/verifyJWT"));
const db_1 = __importDefault(require("./config/db"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const issueRoutes_1 = __importDefault(require("./routes/issueRoutes"));
const searchRoutes_1 = __importDefault(require("./routes/searchRoutes"));
const requestRoutes_1 = __importDefault(require("./routes/requestRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const receiveRoutes_1 = __importDefault(require("./routes/receiveRoutes"));
const rrpRoutes_1 = __importDefault(require("./routes/rrpRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const roleRoutes_1 = __importDefault(require("./routes/roleRoutes"));
const permissionRoutes_1 = __importDefault(require("./routes/permissionRoutes"));
const reportRoutes_1 = __importDefault(require("./routes/reportRoutes"));
const settingsRoutes_1 = __importDefault(require("./routes/settingsRoutes"));
const fuelRoutes_1 = __importDefault(require("./routes/fuelRoutes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3500;
app.use(logger_1.logger);
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
}));
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json());
app.use("/", express_1.default.static(path_1.default.join(__dirname, "../", "public")));
app.use("/images", express_1.default.static(path_1.default.join(__dirname, "../", "frontend", "public", "images")));
app.use("/api/auth", authRoutes_1.default);
app.use('/api/issue', verifyJWT_1.default, issueRoutes_1.default);
app.use('/api/search', verifyJWT_1.default, searchRoutes_1.default);
app.use('/api/request', verifyJWT_1.default, requestRoutes_1.default);
app.use('/api/notification', verifyJWT_1.default, notificationRoutes_1.default);
app.use('/api/receive', verifyJWT_1.default, receiveRoutes_1.default);
app.use('/api/rrp', verifyJWT_1.default, rrpRoutes_1.default);
app.use('/api/user', verifyJWT_1.default, userRoutes_1.default);
app.use('/api/role', verifyJWT_1.default, roleRoutes_1.default);
app.use('/api/permission', verifyJWT_1.default, permissionRoutes_1.default);
app.use('/api/report', verifyJWT_1.default, reportRoutes_1.default);
app.use('/api/settings', verifyJWT_1.default, settingsRoutes_1.default);
app.use('/api/fuel', verifyJWT_1.default, fuelRoutes_1.default);
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});
app.use((req, res) => {
    (0, logger_1.logEvents)(`404 - Route not found: ${req.method} ${req.originalUrl}`, "serverLog.log");
    if (req.path.startsWith('/api/')) {
        res.status(404).json({
            error: 'Not Found',
            message: 'The requested resource was not found',
            path: req.originalUrl,
            method: req.method,
            timestamp: new Date().toISOString()
        });
    }
    else {
        res.status(404).sendFile(path_1.default.join(__dirname, "..", "views", "404.html"));
    }
});
app.use(errorhandler_1.default);
const gracefulShutdown = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield db_1.default.end();
        (0, logger_1.logEvents)('Database connection closed.', "serverLog.log");
        process.exit(0);
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        (0, logger_1.logEvents)(`Error during shutdown: ${errorMessage}`, "serverLog.log");
        process.exit(1);
    }
});
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
const startServer = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield db_1.default.query("SELECT 1");
        (0, logger_1.logEvents)("Connected to MySQL", "serverLog.log");
        app.listen(PORT, () => {
            (0, logger_1.logEvents)(`Server running on port ${PORT}`, "serverLog.log");
            console.log(`Server running on port ${PORT}`);
        });
    }
    catch (err) {
        if (err instanceof Error) {
            (0, logger_1.logEvents)(`MySQL connection error: ${err.message}\n${err.stack}`, "MySQLErrLog.log");
        }
        else {
            (0, logger_1.logEvents)(`MySQL connection error: ${err}`, "MySQLErrLog.log");
        }
        process.exit(1);
    }
});
startServer();
