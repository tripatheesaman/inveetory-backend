import dotenv from "dotenv";
dotenv.config();
import express, { Request, Response } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";
import { logger, logEvents } from "./middlewares/logger";
import errorHandler from "./middlewares/errorhandler";
import pool from "./config/db";
import rootRoutes from "./routes/root";
import authRoutes from "./routes/authRoutes";
import issueRoutes from './routes/issueRoutes';
import searchRoutes from './routes/searchRoutes';
import transactionRoutes from './routes/transactionRoutes';
import requestRoutes from './routes/requestRoutes';
import notificationRoutes from './routes/notificationRoutes';
import receiveRoutes from './routes/receiveRoutes';

const app = express();
const PORT = process.env.PORT || 3500;

// Middleware
app.use(logger);
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true               
}));
app.use(cookieParser());
app.use(express.json());

// Static Files
app.use("/", express.static(path.join(__dirname, "../", "public")));
app.use("/images", express.static(path.join(__dirname, "../", "frontend", "public", "images")));

// Routes
app.use("/", rootRoutes);
app.use("/auth", authRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/request', requestRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/receive', receiveRoutes);

// 404 Handler - Catch all unmatched routes
app.use((req: Request, res: Response) => {
  if (req.accepts("html")) {
    res.sendFile(path.join(__dirname, "..", "views", "404.html"));
  } else if (req.accepts("json")) {
    res.status(404).json({ message: "404 Not Found" });
  } else {
    res.type("txt").send("404 Not Found");
  }
});

// Error Handler
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async () => {
  try {
    await pool.end();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

const startServer = async () => {
  try {
    await pool.query("SELECT 1");
    console.log("Connected to MySQL");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    if (err instanceof Error) {
      console.error("MySQL connection error:", err);
      logEvents(
        `${err.message ?? "N/A"}\t${err.stack ?? "N/A"}`,
        "MySQLErrLog.log"
      );
    } else {
      logEvents(`${err}`, "MySQLErrLog.log");
    }
    process.exit(1);
  }
};

startServer();
