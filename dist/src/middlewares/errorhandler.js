"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("./logger");
const errorHandler = (err, req, res, next) => {
    (0, logger_1.logEvents)(`${err.name}\t${err.message}\t${req.method},${req.url},${req.headers.origin}`, "errorLogs.log");
    const status = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
    res.status(status).json({
        message: err.message,
        isError: true,
    });
};
exports.default = errorHandler;
