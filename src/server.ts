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

const app = express();
const PORT = process.env.PORT || 3500;

// Middleware
app.use(logger);
app.use(cors({
  origin: 'http://localhost:3000', 
  credentials: true               
}));
app.use(cookieParser());
app.use(express.json());

// Static Files
app.use("/", express.static(path.join(__dirname, "../", "public")));

// Routes
app.use("/", rootRoutes);
app.use("/auth", authRoutes);
// Catch-All Route
app.use((req: Request, res: Response) => {
  if (req.accepts("html")) {
    res.sendFile(path.join(__dirname, "..", "views", "404.html"));
  } else if (req.accepts("json")) {
    res.status(404).json({ message: "404 Not Found" });
  } else {
    res.type("txt").send("404 Not Found");
  }
});



app.use(errorHandler);
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
  }
};
startServer();
