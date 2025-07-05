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
Object.defineProperty(exports, "__esModule", { value: true });
exports.printRRP = exports.printRequest = void 0;
const excelService_1 = require("../services/excelService");
const logger_1 = require("../middlewares/logger");
const printRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { requestNumber } = req.params;
        if (!requestNumber) {
            (0, logger_1.logEvents)(`Failed to print request - Missing request number`, "printLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Request number is required'
            });
            return;
        }
        const excelBuffer = yield (0, excelService_1.generateRequestExcel)(requestNumber);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=request_${requestNumber}.xlsx`);
        (0, logger_1.logEvents)(`Successfully generated Excel for request: ${requestNumber}`, "printLog.log");
        res.send(excelBuffer);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error generating Excel for request ${req.params.requestNumber}: ${errorMessage}`, "printLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while generating the Excel file'
        });
    }
});
exports.printRequest = printRequest;
const printRRP = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { rrpNumber } = req.params;
        if (!rrpNumber) {
            (0, logger_1.logEvents)(`Failed to print RRP - Missing RRP number`, "printLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'RRP number is required'
            });
            return;
        }
        const excelBuffer = yield (0, excelService_1.generateRRPExcel)(rrpNumber);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=rrp_${rrpNumber}.xlsx`);
        (0, logger_1.logEvents)(`Successfully generated Excel for RRP: ${rrpNumber}`, "printLog.log");
        res.send(excelBuffer);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error generating Excel for RRP ${req.params.rrpNumber}: ${errorMessage}`, "printLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while generating the Excel file'
        });
    }
});
exports.printRRP = printRRP;
