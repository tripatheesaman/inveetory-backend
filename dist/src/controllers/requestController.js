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
exports.getLastRequestInfo = exports.searchRequests = exports.getRequestById = exports.rejectRequest = exports.approveRequest = exports.updateRequest = exports.getRequestItems = exports.getPendingRequests = exports.createRequest = void 0;
const db_1 = __importDefault(require("../config/db"));
const dateUtils_1 = require("../utils/dateUtils");
const logger_1 = require("../middlewares/logger");
const getStockDetails = (nacCode) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.default.query('SELECT current_balance, unit FROM stock_details WHERE nac_code = ?', [nacCode]);
        return rows[0] || null;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching stock details for NAC code ${nacCode}: ${errorMessage}`, "requestLog.log");
        throw error;
    }
});
const getPreviousRate = (nacCode) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.default.query(`SELECT rd.received_quantity, rrp.total_amount
             FROM rrp_details rrp
             JOIN receive_details rd ON rrp.receive_fk = rd.id
             WHERE rd.nac_code = ?
             AND rd.rrp_fk is NOT NULL
             ORDER BY rd.receive_date DESC 
             LIMIT 1`, [nacCode]);
        if (rows[0]) {
            return Number((Number(rows[0].total_amount) / Number(rows[0].received_quantity)).toFixed(2));
        }
        return 'N/A';
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching previous rate for NAC code ${nacCode}: ${errorMessage}`, "requestLog.log");
        throw error;
    }
});
const processRequestItem = (item, requestData) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let currentBalance = 'N/A';
        let unit = item.unit || 'N/A';
        if (item.nacCode !== 'N/A') {
            const stockDetail = yield getStockDetails(item.nacCode);
            if (stockDetail) {
                currentBalance = stockDetail.current_balance;
                unit = stockDetail.unit;
            }
        }
        else {
            currentBalance = 0;
        }
        const previousRate = yield getPreviousRate(item.nacCode);
        return {
            request_number: requestData.requestNumber,
            request_date: new Date(requestData.requestDate),
            part_number: item.partNumber,
            item_name: item.itemName,
            unit,
            requested_quantity: item.requestQuantity,
            current_balance: currentBalance,
            previous_rate: previousRate,
            equipment_number: item.equipmentNumber,
            image_path: item.imagePath,
            specifications: item.specifications,
            remarks: requestData.remarks,
            requested_by: requestData.requestedBy,
            approval_status: 'PENDING',
            nac_code: item.nacCode
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error processing request item for ${item.itemName}: ${errorMessage}`, "requestLog.log");
        throw error;
    }
});
const createRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        const requestData = req.body;
        const requestDetails = yield Promise.all(requestData.items.map(item => processRequestItem(item, requestData)));
        for (const detail of requestDetails) {
            yield connection.query(`INSERT INTO request_details 
                (request_number, request_date, part_number, item_name, unit, 
                 requested_quantity, current_balance, previous_rate, equipment_number, 
                 image_path, specifications, remarks, requested_by, approval_status, nac_code)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                detail.request_number,
                (0, dateUtils_1.formatDateForDB)(detail.request_date),
                detail.part_number,
                detail.item_name,
                detail.unit,
                detail.requested_quantity,
                detail.current_balance,
                detail.previous_rate,
                detail.equipment_number,
                detail.image_path,
                detail.specifications,
                detail.remarks,
                detail.requested_by,
                detail.approval_status,
                detail.nac_code
            ]);
        }
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully created request ${requestData.requestNumber} with ${requestDetails.length} items by user: ${requestData.requestedBy}`, "requestLog.log");
        res.status(201).json({
            message: 'Request created successfully',
            requestNumber: requestData.requestNumber,
            requestDate: (0, dateUtils_1.formatDate)(requestData.requestDate)
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error creating request: ${errorMessage} by user: ${req.body.requestedBy}`, "requestLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while creating the request'
        });
    }
    finally {
        connection.release();
    }
});
exports.createRequest = createRequest;
const getPendingRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.default.query(`SELECT id,request_number, request_date, requested_by 
             FROM request_details 
             WHERE approval_status = 'PENDING'`);
        const pendingRequests = rows.map(row => ({
            requestId: row.id,
            requestNumber: row.request_number,
            requestDate: row.request_date,
            requestedBy: row.requested_by
        }));
        (0, logger_1.logEvents)(`Successfully fetched ${pendingRequests.length} pending requests`, "requestLog.log");
        res.status(200).json(pendingRequests);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching pending requests: ${errorMessage}`, "requestLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching pending requests'
        });
    }
});
exports.getPendingRequests = getPendingRequests;
const getRequestItems = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { requestNumber } = req.params;
        const [rows] = yield db_1.default.query(`SELECT id, request_number, item_name, part_number, equipment_number, 
                    requested_quantity, image_path, specifications, remarks
             FROM request_details 
             WHERE request_number = ?`, [requestNumber]);
        const requestItems = rows.map(row => ({
            id: row.id,
            requestNumber: row.request_number,
            itemName: row.item_name,
            partNumber: row.part_number,
            equipmentNumber: row.equipment_number,
            requestedQuantity: row.requested_quantity,
            imageUrl: row.image_path,
            specifications: row.specifications,
            remarks: row.remarks
        }));
        (0, logger_1.logEvents)(`Successfully fetched ${requestItems.length} items for request ${requestNumber}`, "requestLog.log");
        res.status(200).json(requestItems);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching request items for ${req.params.requestNumber}: ${errorMessage}`, "requestLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching request items'
        });
    }
});
exports.getRequestItems = getRequestItems;
const updateRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        const { requestNumber: newRequestNumber, requestDate, remarks, items } = req.body;
        const { requestNumber: oldRequestNumber } = req.params;
        yield connection.beginTransaction();
        const [existingItems] = yield connection.query('SELECT id FROM request_details WHERE request_number = ?', [oldRequestNumber]);
        const existingItemIds = existingItems.map(item => item.id);
        const updatedItemIds = items.filter(item => item.id).map(item => item.id);
        const itemsToDelete = existingItemIds.filter(id => !updatedItemIds.includes(id));
        if (itemsToDelete.length > 0) {
            yield connection.query('DELETE FROM request_details WHERE id IN (?)', [itemsToDelete]);
            (0, logger_1.logEvents)(`Deleted ${itemsToDelete.length} items from request ${oldRequestNumber}`, "requestLog.log");
        }
        for (const item of items) {
            if (item.id) {
                const updateFields = [
                    'request_number = ?',
                    'request_date = ?',
                    'part_number = ?',
                    'item_name = ?',
                    'requested_quantity = ?',
                    'equipment_number = ?',
                    'specifications = ?',
                    'image_path = ?',
                    'remarks = ?'
                ];
                const updateValues = [
                    newRequestNumber,
                    (0, dateUtils_1.formatDateForDB)(requestDate),
                    item.partNumber,
                    item.itemName,
                    item.requestedQuantity,
                    item.equipmentNumber,
                    item.specifications,
                    item.imageUrl,
                    remarks
                ];
                if (item.approvalStatus) {
                    updateFields.push('approval_status = ?');
                    updateValues.push(item.approvalStatus);
                }
                yield connection.query(`UPDATE request_details 
                     SET ${updateFields.join(', ')}
                     WHERE id = ?`, [...updateValues, item.id]);
            }
            else {
                const insertFields = [
                    'request_number',
                    'request_date',
                    'part_number',
                    'item_name',
                    'requested_quantity',
                    'equipment_number',
                    'specifications',
                    'image_path',
                    'remarks',
                    'approval_status'
                ];
                const insertValues = [
                    newRequestNumber,
                    (0, dateUtils_1.formatDateForDB)(requestDate),
                    item.partNumber,
                    item.itemName,
                    item.requestedQuantity,
                    item.equipmentNumber,
                    item.specifications,
                    item.imageUrl,
                    remarks,
                    item.approvalStatus || 'PENDING'
                ];
                yield connection.query(`INSERT INTO request_details 
                     (${insertFields.join(', ')})
                     VALUES (${insertValues.map(() => '?').join(', ')})`, insertValues);
            }
        }
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully updated request ${oldRequestNumber} to ${newRequestNumber} with ${items.length} items`, "requestLog.log");
        res.status(200).json({
            message: 'Request updated successfully',
            requestNumber: newRequestNumber
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error updating request ${req.params.requestNumber}: ${errorMessage}`, "requestLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating the request'
        });
    }
    finally {
        connection.release();
    }
});
exports.updateRequest = updateRequest;
const approveRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        const { requestNumber } = req.params;
        const { approvedBy } = req.body;
        yield connection.beginTransaction();
        yield connection.query(`UPDATE request_details 
             SET approval_status = 'APPROVED',
                 approved_by = ?
             WHERE request_number = ?`, [approvedBy, requestNumber]);
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully approved request ${requestNumber} by user: ${approvedBy}`, "requestLog.log");
        res.status(200).json({
            message: 'Request approved successfully',
            requestNumber
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error approving request ${req.params.requestNumber}: ${errorMessage} by user: ${req.body.approvedBy}`, "requestLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while approving the request'
        });
    }
    finally {
        connection.release();
    }
});
exports.approveRequest = approveRequest;
const rejectRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        const { requestNumber } = req.params;
        const { rejectedBy, rejectionReason } = req.body;
        yield connection.beginTransaction();
        const [requestDetails] = yield connection.query(`SELECT id, requested_by 
             FROM request_details 
             WHERE request_number = ? 
             ORDER BY id ASC 
             LIMIT 1`, [requestNumber]);
        if (requestDetails.length === 0) {
            (0, logger_1.logEvents)(`Failed to reject request - Request not found: ${requestNumber}`, "requestLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Request not found'
            });
            return;
        }
        const firstItemId = requestDetails[0].id;
        const requestedBy = requestDetails[0].requested_by;
        const [users] = yield connection.query('SELECT id FROM users WHERE username = ?', [requestedBy]);
        if (users.length === 0) {
            (0, logger_1.logEvents)(`Failed to reject request - User not found: ${requestedBy}`, "requestLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }
        const userId = users[0].id;
        yield connection.query(`UPDATE request_details 
             SET approval_status = 'REJECTED',
                 rejected_by = ?,
                 rejection_reason = ?
             WHERE request_number = ?`, [rejectedBy, rejectionReason, requestNumber]);
        yield connection.query(`INSERT INTO notifications 
             (user_id, reference_type, message, reference_id)
             VALUES (?, ?, ?, ?)`, [
            userId,
            'request',
            `Your request number ${requestNumber} has been rejected for the following reason: ${rejectionReason}`,
            firstItemId
        ]);
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully rejected request ${requestNumber} by user: ${rejectedBy}`, "requestLog.log");
        res.status(200).json({
            message: 'Request rejected successfully',
            requestNumber
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error rejecting request ${req.params.requestNumber}: ${errorMessage} by user: ${req.body.rejectedBy}`, "requestLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while rejecting the request'
        });
    }
    finally {
        connection.release();
    }
});
exports.rejectRequest = rejectRequest;
const getRequestById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        const { id } = req.params;
        const [requestRows] = yield connection.query('SELECT request_number FROM request_details WHERE id = ?', [id]);
        if (requestRows.length === 0) {
            (0, logger_1.logEvents)(`Failed to fetch request - Request not found: ${id}`, "requestLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Request not found'
            });
            return;
        }
        const requestNumber = requestRows[0].request_number;
        const [items] = yield connection.query(`SELECT id, request_number, request_date, part_number, item_name, unit,
                    requested_quantity, current_balance, previous_rate, equipment_number,
                    image_path, specifications, remarks, requested_by, approval_status, nac_code
             FROM request_details
             WHERE request_number = ?
             ORDER BY id`, [requestNumber]);
        if (items.length === 0) {
            (0, logger_1.logEvents)(`Failed to fetch request items - No items found for request: ${requestNumber}`, "requestLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'Request items not found'
            });
            return;
        }
        const requestDetails = {
            requestNumber: items[0].request_number,
            requestDate: items[0].request_date,
            requestedBy: items[0].requested_by,
            approvalStatus: items[0].approval_status,
            items: items.map(item => ({
                id: item.id,
                partNumber: item.part_number,
                itemName: item.item_name,
                unit: item.unit,
                requestedQuantity: item.requested_quantity,
                currentBalance: item.current_balance,
                previousRate: item.previous_rate,
                equipmentNumber: item.equipment_number,
                imageUrl: item.image_path,
                specifications: item.specifications,
                remarks: item.remarks,
                nacCode: item.nac_code
            }))
        };
        (0, logger_1.logEvents)(`Successfully fetched request ${requestNumber} with ${items.length} items`, "requestLog.log");
        res.status(200).json(requestDetails);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching request ${req.params.id}: ${errorMessage}`, "requestLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching the request'
        });
    }
    finally {
        connection.release();
    }
});
exports.getRequestById = getRequestById;
const searchRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { universal, equipmentNumber, partNumber } = req.query;
    if (!universal && !equipmentNumber && !partNumber) {
        (0, logger_1.logEvents)(`Failed to search requests - No search parameters provided`, "requestLog.log");
        res.status(400).json({
            error: 'Bad Request',
            message: 'At least one search parameter is required'
        });
        return;
    }
    try {
        let query = `
            SELECT DISTINCT
                rd.id,
                rd.request_number,
                rd.request_date,
                rd.requested_by,
                rd.part_number,
                rd.item_name,
                rd.equipment_number,
                rd.requested_quantity,
                rd.approval_status,
                rd.nac_code
            FROM request_details rd
            WHERE 1=1
        `;
        const params = [];
        if (universal) {
            query += ` AND (
                rd.request_number LIKE ? OR
                rd.item_name LIKE ? OR
                rd.part_number LIKE ? OR
                rd.equipment_number LIKE ? OR
                rd.nac_code LIKE ?
            )`;
            params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
        }
        if (equipmentNumber) {
            query += ` AND rd.equipment_number LIKE ?`;
            params.push(`%${equipmentNumber}%`);
        }
        if (partNumber) {
            query += ` AND rd.part_number LIKE ?`;
            params.push(`%${partNumber}%`);
        }
        query += ' ORDER BY rd.request_date DESC LIMIT 50';
        const [results] = yield db_1.default.execute(query, params);
        const groupedResults = results.reduce((acc, result) => {
            if (!acc[result.request_number]) {
                acc[result.request_number] = {
                    requestNumber: result.request_number,
                    requestDate: result.request_date,
                    requestedBy: result.requested_by,
                    approvalStatus: result.approval_status,
                    items: []
                };
            }
            acc[result.request_number].items.push({
                id: result.id,
                partNumber: result.part_number,
                itemName: result.item_name,
                equipmentNumber: result.equipment_number,
                requestedQuantity: result.requested_quantity,
                nacCode: result.nac_code
            });
            return acc;
        }, {});
        const response = Object.values(groupedResults);
        (0, logger_1.logEvents)(`Successfully searched requests with ${response.length} results`, "requestLog.log");
        res.json(response);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error searching requests: ${errorMessage}`, "requestLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while searching requests'
        });
    }
});
exports.searchRequests = searchRequests;
const getLastRequestInfo = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.default.query(`SELECT 
                request_number,
                request_date,
                COUNT(*) as number_of_items
             FROM request_details 
             GROUP BY request_number, request_date
             ORDER BY request_date DESC, request_number DESC
             LIMIT 1`);
        if (rows.length === 0) {
            (0, logger_1.logEvents)(`Failed to fetch last request info - No requests found`, "requestLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'No requests found'
            });
            return;
        }
        const lastRequest = {
            requestNumber: rows[0].request_number,
            requestDate: rows[0].request_date,
            numberOfItems: rows[0].number_of_items
        };
        (0, logger_1.logEvents)(`Successfully fetched last request info: ${lastRequest.requestNumber}`, "requestLog.log");
        res.status(200).json(lastRequest);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching last request info: ${errorMessage}`, "requestLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching last request info'
        });
    }
});
exports.getLastRequestInfo = getLastRequestInfo;
