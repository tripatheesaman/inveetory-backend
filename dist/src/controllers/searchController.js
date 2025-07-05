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
exports.searchStockDetails = exports.getItemDetails = void 0;
const db_1 = __importDefault(require("../config/db"));
const logger_1 = require("../middlewares/logger");
const getItemDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    if (!id) {
        (0, logger_1.logEvents)(`Failed to fetch item details - Missing ID parameter`, "searchLog.log");
        res.status(400).json({
            error: 'Bad Request',
            message: 'Item ID is required'
        });
        return;
    }
    try {
        (0, logger_1.logEvents)(`Fetching item details for ID: ${id}`, "searchLog.log");
        const query = `
      WITH stock_info AS (
        SELECT 
          sd.id,
          sd.nac_code,
          sd.item_name,
          sd.part_numbers,
          sd.applicable_equipments,
          sd.current_balance,
          sd.location,
          sd.card_number,
          sd.unit,
          sd.open_quantity,
          sd.open_amount,
          sd.image_url,
          CASE 
            WHEN INSTR(sd.item_name, ',') > 0 
            THEN SUBSTRING_INDEX(sd.item_name, ',', 1)
            ELSE sd.item_name
          END as altText,
          COALESCE(sd.open_quantity, 0) as openQuantity,
          (
            SELECT COALESCE(SUM(rd.received_quantity), 0)
            FROM receive_details rd
            WHERE rd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
            AND rd.rrp_fk IS NOT NULL
          ) as rrpQuantity,
          (
            SELECT COALESCE(SUM(id.issue_quantity), 0)
            FROM issue_details id
            WHERE id.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
          ) as issueQuantity,
          (
            SELECT COALESCE(SUM(rrp.total_amount), 0)
            FROM receive_details rd
            JOIN rrp_details rrp ON rd.rrp_fk = rrp.id
            JOIN request_details rqd ON rd.request_fk = rqd.id
            WHERE rqd.nac_code COLLATE utf8mb4_unicode_ci = sd.nac_code COLLATE utf8mb4_unicode_ci
            AND rd.rrp_fk IS NOT NULL
          ) as totalCost
        FROM stock_details sd
        WHERE sd.id = ?
      )
      SELECT 
        id,
        nac_code as nacCode,
        item_name as itemName,
        part_numbers as partNumber,
        applicable_equipments as equipmentNumber,
        current_balance as currentBalance,
        location,
        card_number as cardNumber,
        unit,
        openQuantity,
        open_amount as openAmount,
        image_url as imageUrl,
        altText,
        openQuantity,
        rrpQuantity,
        issueQuantity,
        (openQuantity + rrpQuantity - issueQuantity) as trueBalance,
        CASE 
          WHEN rrpQuantity > 0 
          THEN totalCost / rrpQuantity
          ELSE 0 
        END as averageCostPerUnit
      FROM stock_info
    `;
        const [results] = yield db_1.default.execute(query, [id]);
        if (results.length === 0) {
            (0, logger_1.logEvents)(`Item not found for ID: ${id}`, "searchLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Item not found'
            });
            return;
        }
        (0, logger_1.logEvents)(`Successfully fetched item details for ID: ${id}`, "searchLog.log");
        res.json(results[0]);
    }
    catch (error) {
        const searchError = error;
        const errorMessage = searchError.message || 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching item details for ID ${id}: ${errorMessage}`, "searchLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while fetching item details',
            details: errorMessage
        });
    }
});
exports.getItemDetails = getItemDetails;
const searchStockDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { universal, equipmentNumber, partNumber } = req.query;
    // Input validation
    if (!universal && !equipmentNumber && !partNumber) {
        (0, logger_1.logEvents)(`Failed to search stock details - No search parameters provided`, "searchLog.log");
        res.status(400).json({
            error: 'Bad Request',
            message: 'At least one search parameter is required'
        });
        return;
    }
    try {
        (0, logger_1.logEvents)(`Starting stock search with parameters: universal=${universal}, equipmentNumber=${equipmentNumber}, partNumber=${partNumber}`, "searchLog.log");
        // Build the base query
        let query = `
      SELECT 
        id,
        nac_code as nacCode,
        item_name as itemName,
        part_numbers as partNumber,
        applicable_equipments as equipmentNumber,
        current_balance as currentBalance,
        location,
        card_number as cardNumber
      FROM stock_details
      WHERE 1=1
    `;
        const params = [];
        // Add search conditions with AND logic
        if (universal) {
            // Try FULLTEXT search first
            try {
                query += ` AND (
          MATCH(nac_code, item_name, part_numbers, applicable_equipments) AGAINST(? IN BOOLEAN MODE)
        )`;
                params.push(`${universal}*`);
                (0, logger_1.logEvents)(`Using FULLTEXT search for universal parameter: ${universal}`, "searchLog.log");
            }
            catch (error) {
                const searchError = error;
                if (searchError.code === 'ER_FT_MATCHING_KEY_NOT_FOUND') {
                    // Fallback to LIKE search if FULLTEXT fails
                    query += ` AND (
            nac_code LIKE ? OR
            item_name LIKE ? OR
            part_numbers LIKE ? OR
            applicable_equipments LIKE ?
          )`;
                    params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
                    (0, logger_1.logEvents)(`Falling back to LIKE search for universal parameter: ${universal}`, "searchLog.log");
                }
                else {
                    throw error;
                }
            }
        }
        if (equipmentNumber) {
            query += ` AND applicable_equipments LIKE ?`;
            params.push(`%${equipmentNumber}%`);
        }
        if (partNumber) {
            query += ` AND part_numbers LIKE ?`;
            params.push(`%${partNumber}%`);
        }
        // Add LIMIT to prevent overwhelming results
        query += ' LIMIT 50';
        const [results] = yield db_1.default.execute(query, params);
        if (results.length === 0) {
            (0, logger_1.logEvents)(`No results found for search parameters`, "searchLog.log");
            res.json(null);
        }
        else {
            (0, logger_1.logEvents)(`Successfully found ${results.length} results for search parameters`, "searchLog.log");
            res.json(results);
        }
    }
    catch (error) {
        const searchError = error;
        const errorMessage = searchError.message || 'Unknown error occurred';
        (0, logger_1.logEvents)(`Search error: ${errorMessage}`, "searchLog.log");
        // Handle specific MySQL errors
        if (searchError.code === 'ER_FT_MATCHING_KEY_NOT_FOUND') {
            (0, logger_1.logEvents)(`Full-text search configuration error`, "searchLog.log");
            res.status(400).json({
                error: 'Search Configuration Error',
                message: 'Full-text search is not properly configured',
                details: 'Please contact system administrator to set up the required FULLTEXT index',
                fallback: 'Using basic search instead'
            });
            return;
        }
        // Handle other database errors
        if ((_a = searchError.code) === null || _a === void 0 ? void 0 : _a.startsWith('ER_')) {
            (0, logger_1.logEvents)(`Database error during search: ${searchError.sqlMessage}`, "searchLog.log");
            res.status(500).json({
                error: 'Database Error',
                message: 'An error occurred while searching',
                details: searchError.sqlMessage
            });
            return;
        }
        // Handle general errors
        (0, logger_1.logEvents)(`Unexpected error during search: ${errorMessage}`, "searchLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An unexpected error occurred',
            details: errorMessage
        });
    }
});
exports.searchStockDetails = searchStockDetails;
