import dotenv from "dotenv";
dotenv.config();
import express, { Request, Response } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";
import { logger, logEvents } from "./middlewares/logger";
import errorHandler from "./middlewares/errorhandler";
import verifyJWT from "./middlewares/verifyJWT";
import pool from "./config/db";
import authRoutes from "./routes/authRoutes";
import issueRoutes from './routes/issueRoutes';
import searchRoutes from './routes/searchRoutes';
import requestRoutes from './routes/requestRoutes';
import notificationRoutes from './routes/notificationRoutes';
import receiveRoutes from './routes/receiveRoutes';
import rrpRoutes from './routes/rrpRoutes';
import userRoutes from './routes/userRoutes';
import roleRoutes from './routes/roleRoutes';
import permissionRoutes from './routes/permissionRoutes';

const app = express();
const PORT = process.env.PORT || 3500;


app.use(logger);
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true               
}));
app.use(cookieParser());
app.use(express.json());


app.use("/", express.static(path.join(__dirname, "../", "public")));
app.use("/images", express.static(path.join(__dirname, "../", "frontend", "public", "images")));


app.use("/api/auth", authRoutes);


app.use('/api/issue', verifyJWT, issueRoutes);
app.use('/api/search', verifyJWT, searchRoutes);
app.use('/api/request', verifyJWT, requestRoutes);
app.use('/api/notification', verifyJWT, notificationRoutes);
app.use('/api/receive', verifyJWT, receiveRoutes);
app.use('/api/rrp', verifyJWT, rrpRoutes);
app.use('/api/user', verifyJWT, userRoutes);
app.use('/api/role', verifyJWT, roleRoutes);
app.use('/api/permission', verifyJWT, permissionRoutes);


app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
});

app.use((req: Request, res: Response) => {
  logEvents(`404 - Route not found: ${req.method} ${req.originalUrl}`, "serverLog.log");
  
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource was not found',
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(404).sendFile(path.join(__dirname, "..", "views", "404.html"));
  }
});

app.use(errorHandler);


const gracefulShutdown = async () => {
  try {
    await pool.end();
    logEvents('Database connection closed.', "serverLog.log");
    process.exit(0);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logEvents(`Error during shutdown: ${errorMessage}`, "serverLog.log");
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

const startServer = async () => {
  try {
    await pool.query("SELECT 1");
    logEvents("Connected to MySQL", "serverLog.log");
    app.listen(PORT, () => {
      logEvents(`Server running on port ${PORT}`, "serverLog.log");
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    if (err instanceof Error) {
      logEvents(
        `MySQL connection error: ${err.message}\n${err.stack}`,
        "MySQLErrLog.log"
      );
    } else {
      logEvents(`MySQL connection error: ${err}`, "MySQLErrLog.log");
    }
    process.exit(1);
  }
};

startServer();
