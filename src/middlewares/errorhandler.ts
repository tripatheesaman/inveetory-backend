import { Request, Response, NextFunction } from "express";
import { logEvents } from "./logger";

const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  logEvents(
    `${err.name}\t${err.message}\t${req.method},${req.url},${req.headers.origin}`,
    "errorLogs.log"
  );

  const status = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  res.status(status).json({
    message: err.message,
    isError: true,
  });
};

export default errorHandler;
