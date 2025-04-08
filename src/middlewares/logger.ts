import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { format } from "date-fns";
import { v4 as uuid } from "uuid";
import { Request, Response, NextFunction } from "express";

/**
 * Logs events with a timestamp and UUID to a log file.
 */
export const logEvents = async (message: string, logFileName: string): Promise<void> => {
  const dateItem = format(new Date(), "yyyyMMdd\tHH:mm:ss");
  const logItem = `${dateItem}\t${uuid()}\t${message}\n`;

  try {
    const logDir = path.join(__dirname, "..", "logs");
    if (!fs.existsSync(logDir)) {
      await fsPromises.mkdir(logDir, { recursive: true });
    }

    const logFilePath = path.join(logDir, logFileName);
    await fsPromises.appendFile(logFilePath, logItem);
  } catch (err) {
    console.error("Logging error:", err);
  }
};

/**
 * Middleware to log each HTTP request.
 */
export const logger = (req: Request, res: Response, next: NextFunction): void => {
  logEvents(`${req.method}\t${req.url}\t${req.headers.origin ?? "unknown"}`, "reqLog.log");
  next();
};
