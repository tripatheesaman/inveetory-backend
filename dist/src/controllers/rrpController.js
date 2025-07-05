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
exports.getLatestRRPDetails = exports.verifyRRPNumber = exports.searchRRP = exports.getRRPById = exports.updateRRP = exports.rejectRRP = exports.approveRRP = exports.getPendingRRPs = exports.createRRP = exports.getRRPItems = exports.getRRPConfig = void 0;
const db_1 = __importDefault(require("../config/db"));
const dateUtils_1 = require("../utils/dateUtils");
const logger_1 = require("../middlewares/logger");
const getRRPConfig = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.default.query('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['rrp']);
        const config = {};
        rows.forEach(row => {
            try {
                config[row.config_name] = JSON.parse(row.config_value);
            }
            catch (_a) {
                config[row.config_name] = row.config_value;
            }
        });
        (0, logger_1.logEvents)(`Successfully fetched RRP configuration with ${Object.keys(config).length} settings`, "rrpLog.log");
        res.status(200).json(config);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching RRP configuration: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching RRP configuration'
        });
    }
});
exports.getRRPConfig = getRRPConfig;
const getRRPItems = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [rows] = yield db_1.default.query(`SELECT 
                rd.id,
                rq.request_number,
                rq.request_date,
                rd.receive_date,
                rq.equipment_number,
                rq.requested_by,
                rd.received_by,
                rd.item_name,
                rd.nac_code,
                rd.part_number,
                rd.received_quantity,
                rd.unit
            FROM receive_details rd
            JOIN request_details rq ON rd.request_fk = rq.id
            WHERE rd.approval_status = 'APPROVED'
            AND (rd.rrp_fk IS NULL OR rd.rrp_fk = '')
            ORDER BY rd.receive_date DESC`);
        const formattedItems = rows.map(item => (Object.assign(Object.assign({}, item), { request_date: (0, dateUtils_1.formatDate)(item.request_date), receive_date: (0, dateUtils_1.formatDate)(item.receive_date) })));
        (0, logger_1.logEvents)(`Successfully fetched ${formattedItems.length} RRP items`, "rrpLog.log");
        res.status(200).json(formattedItems);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching RRP items: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching RRP items'
        });
    }
});
exports.getRRPItems = getRRPItems;
const createRRP = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        (0, logger_1.logEvents)(`Starting RRP creation transaction`, "rrpLog.log");
        const submissionData = req.body;
        // Get RRP configuration
        const [configRows] = yield connection.query('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['rrp']);
        const config = {};
        configRows.forEach(row => {
            try {
                config[row.config_name] = JSON.parse(row.config_value);
            }
            catch (_a) {
                config[row.config_name] = row.config_value;
            }
        });
        const currentFY = config.current_fy;
        if (!currentFY) {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to create RRP - Current FY configuration not found`, "rrpLog.log");
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Current FY configuration not found'
            });
            return;
        }
        const inputRRPNumber = submissionData.rrp_number;
        let rrpNumber = inputRRPNumber;
        if (inputRRPNumber.includes('T')) {
            const [existingRRP] = yield connection.query('SELECT approval_status FROM rrp_details WHERE rrp_number = ?', [inputRRPNumber]);
            if (existingRRP.length > 0 && existingRRP[0].approval_status !== 'REJECTED') {
                yield connection.rollback();
                (0, logger_1.logEvents)(`Failed to create RRP - Number already exists: ${inputRRPNumber}`, "rrpLog.log");
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'RRP number already exists and is not rejected'
                });
                return;
            }
            if (existingRRP.length > 0) {
                yield connection.query('DELETE FROM rrp_details WHERE rrp_number = ?', [inputRRPNumber]);
                yield connection.query(`UPDATE receive_details rd
                     SET rrp_fk = NULL
                     WHERE EXISTS (
                         SELECT 1 FROM rrp_details rrp
                         WHERE rrp.receive_fk = rd.id
                         AND rrp.rrp_number = ?
                     )`, [inputRRPNumber]);
                (0, logger_1.logEvents)(`Deleted existing rejected RRP: ${inputRRPNumber}`, "rrpLog.log");
            }
        }
        else {
            const [lastRRP] = yield connection.query(`SELECT rrp_number FROM rrp_details 
                WHERE rrp_number LIKE ? 
                ORDER BY rrp_number DESC LIMIT 1`, [`${inputRRPNumber}T%`]);
            if (lastRRP.length > 0) {
                const lastTNumber = parseInt(lastRRP[0].rrp_number.split('T')[1]);
                rrpNumber = `${inputRRPNumber}T${lastTNumber + 1}`;
            }
            else {
                rrpNumber = `${inputRRPNumber}T1`;
            }
            (0, logger_1.logEvents)(`Generated new RRP number: ${rrpNumber}`, "rrpLog.log");
        }
        for (const item of submissionData.items) {
            const [receiveDetails] = yield connection.query('SELECT * FROM receive_details WHERE id = ?', [item.receive_id]);
            if (receiveDetails.length === 0) {
                throw new Error(`Receive details not found for ID: ${item.receive_id}`);
            }
            const receive = receiveDetails[0];
            const itemPrice = item.price * (submissionData.type === 'foreign' && submissionData.forex_rate ? submissionData.forex_rate : 1);
            const totalItemPrice = submissionData.items.reduce((sum, curr) => sum + (curr.price * (submissionData.type === 'foreign' && submissionData.forex_rate ? submissionData.forex_rate : 1)), 0);
            const freightCharge = (itemPrice / totalItemPrice) * (submissionData.freight_charge || 0) *
                (submissionData.type === 'foreign' && submissionData.forex_rate ? submissionData.forex_rate : 1);
            const customServiceCharge = (itemPrice / totalItemPrice) * (submissionData.custom_service_charge || 0);
            let vatAmount = 0;
            if (item.vat_status) {
                const vatBase = itemPrice + freightCharge + (item.customs_charge || 0) + customServiceCharge;
                vatAmount = vatBase * ((submissionData.vat_rate || 0) / 100);
            }
            const totalAmount = itemPrice +
                freightCharge +
                (item.customs_charge || 0) +
                customServiceCharge +
                vatAmount;
            const formattedRRPDate = (0, dateUtils_1.formatDateForDB)(submissionData.rrp_date);
            const formattedInvoiceDate = (0, dateUtils_1.formatDateForDB)(submissionData.invoice_date);
            const formattedCustomsDate = (0, dateUtils_1.formatDateForDB)(submissionData.customs_date);
            const [result] = yield connection.query(`INSERT INTO rrp_details (
                    receive_fk, rrp_number, supplier_name, date, currency, forex_rate,
                    item_price, customs_charge, customs_service_charge, vat_percentage,
                    invoice_number, invoice_date, po_number, airway_bill_number,
                    inspection_details, approval_status, created_by, total_amount,
                    freight_charge, customs_date, customs_number, current_fy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)`, [
                item.receive_id,
                rrpNumber,
                submissionData.supplier,
                formattedRRPDate,
                submissionData.type === 'foreign' ? submissionData.currency : 'NPR',
                submissionData.type === 'foreign' && submissionData.forex_rate ? submissionData.forex_rate : 1,
                item.price,
                item.customs_charge,
                customServiceCharge,
                item.vat_status ? submissionData.vat_rate : 0,
                submissionData.invoice_number,
                formattedInvoiceDate,
                submissionData.po_number || null,
                submissionData.airway_bill_number || null,
                JSON.stringify({
                    inspection_user: submissionData.inspection_user,
                    inspection_details: config.inspection_details || {}
                }),
                submissionData.created_by,
                totalAmount,
                freightCharge,
                formattedCustomsDate,
                submissionData.customs_number || null,
                currentFY
            ]);
            const rrpId = result.insertId;
            yield connection.query('UPDATE receive_details SET rrp_fk = ? WHERE id = ?', [rrpId, item.receive_id]);
        }
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully created RRP ${rrpNumber} with ${submissionData.items.length} items by user: ${submissionData.created_by}`, "rrpLog.log");
        res.status(201).json({
            message: 'RRP created successfully',
            rrp_number: rrpNumber
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error creating RRP: ${errorMessage} by user: ${req.body.created_by}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while creating RRP'
        });
    }
    finally {
        connection.release();
    }
});
exports.createRRP = createRRP;
const getPendingRRPs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [configRows] = yield db_1.default.query('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['rrp']);
        const config = {};
        configRows.forEach(row => {
            try {
                config[row.config_name] = JSON.parse(row.config_value);
            }
            catch (_a) {
                config[row.config_name] = row.config_value;
            }
        });
        const [rows] = yield db_1.default.query(`SELECT 
                rd.id,
                rd.rrp_number,
                rd.supplier_name,
                rd.date,
                rd.currency,
                rd.forex_rate,
                rd.item_price,
                rd.customs_charge,
                rd.customs_service_charge,
                rd.vat_percentage,
                rd.invoice_number,
                rd.invoice_date,
                rd.po_number,
                rd.airway_bill_number,
                rd.inspection_details,
                rd.approval_status,
                rd.created_by,
                rd.total_amount,
                rd.freight_charge,
                rd.customs_date,
                rd.customs_number,
                rd.receive_fk,
                red.item_name,
                red.nac_code,
                red.part_number,
                red.received_quantity,
                red.unit,
                red.received_by,
                red.receive_date,
                rqd.request_number,
                rqd.request_date,
                rqd.requested_by,
                rqd.equipment_number
            FROM rrp_details rd
            JOIN receive_details red ON rd.receive_fk = red.id
            JOIN request_details rqd ON red.request_fk = rqd.id
            WHERE rd.approval_status = 'PENDING'
            ORDER BY rd.date DESC`);
        const formattedRows = rows.map(row => (Object.assign(Object.assign({}, row), { date: (0, dateUtils_1.formatDate)(row.date), invoice_date: (0, dateUtils_1.formatDate)(row.invoice_date), receive_date: (0, dateUtils_1.formatDate)(row.receive_date), request_date: (0, dateUtils_1.formatDate)(row.request_date), customs_date: (0, dateUtils_1.formatDate)(row.customs_date), inspection_details: JSON.parse(row.inspection_details) })));
        (0, logger_1.logEvents)(`Successfully fetched ${formattedRows.length} pending RRPs`, "rrpLog.log");
        res.status(200).json({
            config,
            pendingRRPs: formattedRows
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching pending RRPs: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching pending RRPs'
        });
    }
});
exports.getPendingRRPs = getPendingRRPs;
const approveRRP = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        (0, logger_1.logEvents)(`Starting RRP approval transaction for RRP: ${req.params.rrpNumber}`, "rrpLog.log");
        const rrpNumber = req.params.rrpNumber;
        const { approved_by } = req.body;
        const [rrpCheck] = yield connection.query('SELECT id, approval_status FROM rrp_details WHERE rrp_number = ?', [rrpNumber]);
        if (rrpCheck.length === 0) {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to approve RRP - Not found: ${rrpNumber}`, "rrpLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'RRP not found'
            });
            return;
        }
        if (rrpCheck[0].approval_status === 'APPROVED') {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to approve RRP - Already approved: ${rrpNumber}`, "rrpLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'RRP is already approved'
            });
            return;
        }
        const [result] = yield connection.query(`UPDATE rrp_details 
            SET approval_status = 'APPROVED',
                approved_by = ?
            WHERE rrp_number = ? AND approval_status != 'APPROVED'`, [approved_by, rrpNumber]);
        if (result.affectedRows === 0) {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to approve RRP - No rows affected: ${rrpNumber}`, "rrpLog.log");
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Failed to approve RRP'
            });
            return;
        }
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully approved RRP ${rrpNumber} by user: ${approved_by}`, "rrpLog.log");
        res.status(200).json({ message: 'RRP approved successfully' });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error approving RRP ${req.params.rrpNumber}: ${errorMessage} by user: ${req.body.approved_by}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while approving RRP'
        });
    }
    finally {
        connection.release();
    }
});
exports.approveRRP = approveRRP;
const rejectRRP = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        (0, logger_1.logEvents)(`Starting RRP rejection transaction for RRP: ${req.params.rrpNumber}`, "rrpLog.log");
        const rrpNumber = req.params.rrpNumber;
        const { rejected_by, rejection_reason } = req.body;
        const [rrpCheck] = yield connection.query('SELECT id, approval_status FROM rrp_details WHERE rrp_number = ?', [rrpNumber]);
        if (rrpCheck.length === 0) {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to reject RRP - Not found: ${rrpNumber}`, "rrpLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'RRP not found'
            });
            return;
        }
        if (rrpCheck[0].approval_status === 'REJECTED') {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to reject RRP - Already rejected: ${rrpNumber}`, "rrpLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'RRP is already rejected'
            });
            return;
        }
        const [rrpDetails] = yield connection.query(`SELECT id, created_by 
             FROM rrp_details 
             WHERE rrp_number = ? 
             ORDER BY id ASC 
             LIMIT 1`, [rrpNumber]);
        const firstItemId = rrpDetails[0].id;
        const createdBy = rrpDetails[0].created_by;
        const [users] = yield connection.query('SELECT id FROM users WHERE username = ?', [createdBy]);
        if (users.length === 0) {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to reject RRP - User not found: ${createdBy}`, "rrpLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'User not found'
            });
            return;
        }
        const userId = users[0].id;
        const [result] = yield connection.query(`UPDATE rrp_details 
            SET approval_status = 'REJECTED',
                rejected_by = ?,
                rejection_reason = ?
            WHERE rrp_number = ? AND approval_status != 'REJECTED'`, [rejected_by, rejection_reason, rrpNumber]);
        if (result.affectedRows === 0) {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to reject RRP - No rows affected: ${rrpNumber}`, "rrpLog.log");
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Failed to reject RRP'
            });
            return;
        }
        yield connection.query(`UPDATE receive_details rd
             SET rrp_fk = NULL
             WHERE EXISTS (
                 SELECT 1 FROM rrp_details rrp
                 WHERE rrp.receive_fk = rd.id
                 AND rrp.rrp_number = ?
             )`, [rrpNumber]);
        yield connection.query(`INSERT INTO notifications 
             (user_id, reference_type, message, reference_id)
             VALUES (?, ?, ?, ?)`, [
            userId,
            'rrp',
            `Your RRP number ${rrpNumber} has been rejected for the following reason: ${rejection_reason}`,
            firstItemId
        ]);
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully rejected RRP ${rrpNumber} by user: ${rejected_by} with reason: ${rejection_reason}`, "rrpLog.log");
        res.status(200).json({ message: 'RRP rejected successfully' });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error rejecting RRP ${req.params.rrpNumber}: ${errorMessage} by user: ${req.body.rejected_by}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while rejecting RRP'
        });
    }
    finally {
        connection.release();
    }
});
exports.rejectRRP = rejectRRP;
const updateRRP = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        (0, logger_1.logEvents)(`Starting RRP update transaction for RRP: ${req.params.rrpNumber}`, "rrpLog.log");
        const rrpNumber = req.params.rrpNumber;
        const updateData = req.body;
        const [configRows] = yield connection.query('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['rrp']);
        const config = {};
        configRows.forEach(row => {
            try {
                config[row.config_name] = JSON.parse(row.config_value);
            }
            catch (_a) {
                config[row.config_name] = row.config_value;
            }
        });
        const formattedRRPDate = (0, dateUtils_1.formatDateForDB)(updateData.date);
        const formattedInvoiceDate = (0, dateUtils_1.formatDateForDB)(updateData.invoice_date);
        const formattedCustomsDate = (0, dateUtils_1.formatDateForDB)(updateData.customs_date);
        const [existingItems] = yield connection.query('SELECT id, receive_fk FROM rrp_details WHERE rrp_number = ?', [rrpNumber]);
        const existingItemIds = existingItems.map(item => item.id);
        const updatedItemIds = updateData.items.filter((item) => item.id).map((item) => item.id);
        const itemsToDelete = existingItemIds.filter(id => !updatedItemIds.includes(id));
        if (itemsToDelete.length > 0) {
            const [itemsToDeleteDetails] = yield connection.query('SELECT receive_fk FROM rrp_details WHERE id IN (?)', [itemsToDelete]);
            const receiveFks = itemsToDeleteDetails.map(item => item.receive_fk);
            if (receiveFks.length > 0) {
                yield connection.query('UPDATE receive_details SET rrp_fk = NULL WHERE id IN (?)', [receiveFks]);
            }
            yield connection.query('DELETE FROM rrp_details WHERE id IN (?)', [itemsToDelete]);
            (0, logger_1.logEvents)(`Deleted ${itemsToDelete.length} items from RRP ${rrpNumber}`, "rrpLog.log");
        }
        let updateSuccess = false;
        for (const item of updateData.items) {
            if (item.id) {
                const updateFields = [
                    'rrp_number = ?',
                    'supplier_name = ?',
                    'date = ?',
                    'currency = ?',
                    'forex_rate = ?',
                    'item_price = ?',
                    'customs_charge = ?',
                    'customs_service_charge = ?',
                    'vat_percentage = ?',
                    'invoice_number = ?',
                    'invoice_date = ?',
                    'customs_date = ?',
                    'po_number = ?',
                    'airway_bill_number = ?',
                    'inspection_details = ?',
                    'freight_charge = ?',
                    'total_amount = ?',
                    'customs_number = ?',
                    'updated_at = CURRENT_TIMESTAMP'
                ];
                const updateValues = [
                    updateData.rrp_number,
                    updateData.supplier_name,
                    formattedRRPDate,
                    updateData.currency,
                    updateData.forex_rate,
                    item.item_price,
                    item.customs_charge,
                    item.customs_service_charge,
                    item.vat_percentage,
                    updateData.invoice_number,
                    formattedInvoiceDate,
                    formattedCustomsDate,
                    updateData.po_number || null,
                    updateData.airway_bill_number || null,
                    JSON.stringify({
                        inspection_user: updateData.inspection_user,
                    }),
                    item.freight_charge,
                    item.total_amount,
                    updateData.customs_number || null
                ];
                if (item.approval_status) {
                    updateFields.push('approval_status = ?');
                    updateValues.push(item.approval_status);
                }
                updateValues.push(item.id);
                const [result] = yield connection.query(`UPDATE rrp_details 
                    SET ${updateFields.join(', ')}
                    WHERE id = ?`, updateValues);
                if (result.affectedRows > 0) {
                    updateSuccess = true;
                }
            }
            else {
                const [result] = yield connection.query(`INSERT INTO rrp_details (
                        receive_fk, rrp_number, supplier_name, date, currency, forex_rate,
                        item_price, customs_charge, customs_service_charge, vat_percentage,
                        invoice_number, invoice_date, po_number, airway_bill_number,
                        inspection_details, approval_status, created_by, total_amount,
                        freight_charge, customs_date, customs_number
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    item.receive_id,
                    updateData.rrp_number,
                    updateData.supplier_name,
                    formattedRRPDate,
                    updateData.currency,
                    updateData.forex_rate,
                    item.item_price,
                    item.customs_charge,
                    item.customs_service_charge,
                    item.vat_percentage,
                    updateData.invoice_number,
                    formattedInvoiceDate,
                    updateData.po_number || null,
                    updateData.airway_bill_number || null,
                    JSON.stringify({
                        inspection_user: updateData.inspection_user,
                        inspection_details: config.inspection_details || {}
                    }),
                    item.approval_status || 'PENDING',
                    updateData.created_by,
                    item.total_amount,
                    item.freight_charge,
                    formattedCustomsDate,
                    updateData.customs_number || null
                ]);
                const rrpId = result.insertId;
                yield connection.query('UPDATE receive_details SET rrp_fk = ? WHERE id = ?', [rrpId, item.receive_id]);
                updateSuccess = true;
            }
        }
        if (!updateSuccess) {
            yield connection.rollback();
            (0, logger_1.logEvents)(`Failed to update RRP - No matching items found: ${rrpNumber}`, "rrpLog.log");
            res.status(404).json({
                error: 'Not Found',
                message: 'No matching RRP items were found to update'
            });
            return;
        }
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully updated RRP ${rrpNumber} with ${updateData.items.length} items`, "rrpLog.log");
        res.status(200).json({ message: 'RRP updated successfully' });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error updating RRP ${req.params.rrpNumber}: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating RRP'
        });
    }
    finally {
        connection.release();
    }
});
exports.updateRRP = updateRRP;
const getRRPType = (rrpNumber) => {
    const firstChar = rrpNumber.charAt(0).toUpperCase();
    return {
        type: firstChar === 'L' ? 'local' : 'foreign'
    };
};
const getRRPById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = req.params.id;
        const [rrpNumberResult] = yield db_1.default.query('SELECT rrp_number FROM rrp_details WHERE id = ?', [id]);
        if (rrpNumberResult.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'RRP not found'
            });
            return;
        }
        const rrpNumber = rrpNumberResult[0].rrp_number;
        const rrpType = getRRPType(rrpNumber);
        // Get RRP configuration
        const [configRows] = yield db_1.default.query('SELECT config_name, config_value FROM app_config WHERE config_type = ?', ['rrp']);
        const config = {};
        configRows.forEach(row => {
            try {
                config[row.config_name] = JSON.parse(row.config_value);
            }
            catch (_a) {
                config[row.config_name] = row.config_value;
            }
        });
        // Get all RRP details for this RRP number
        const [rows] = yield db_1.default.query(`SELECT 
                rd.id,
                rd.rrp_number,
                rd.supplier_name,
                rd.date,
                rd.currency,
                rd.forex_rate,
                rd.item_price,
                rd.customs_charge,
                rd.customs_number,
                rd.customs_service_charge,
                rd.vat_percentage,
                rd.invoice_number,
                rd.invoice_date,
                rd.po_number,
                rd.airway_bill_number,
                rd.inspection_details,
                rd.approval_status,
                rd.created_by,
                rd.total_amount,
                rd.freight_charge,
                rd.customs_date,
                rd.receive_fk,
                red.item_name,
                red.nac_code,
                red.part_number,
                red.received_quantity,
                red.unit,
                red.received_by,
                red.receive_date,
                rqd.request_number,
                rqd.request_date,
                rqd.requested_by,
                rqd.equipment_number
            FROM rrp_details rd
            JOIN receive_details red ON rd.receive_fk = red.id
            JOIN request_details rqd ON red.request_fk = rqd.id
            WHERE rd.rrp_number = ?
            ORDER BY rd.id ASC`, [rrpNumber]);
        const formattedRows = rows.map(row => (Object.assign(Object.assign({}, row), { date: (0, dateUtils_1.formatDate)(row.date), invoice_date: (0, dateUtils_1.formatDate)(row.invoice_date), receive_date: (0, dateUtils_1.formatDate)(row.receive_date), request_date: (0, dateUtils_1.formatDate)(row.request_date), customs_date: (0, dateUtils_1.formatDate)(row.customs_date), inspection_details: JSON.parse(row.inspection_details) })));
        res.status(200).json({
            config,
            rrpDetails: formattedRows,
            type: rrpType.type
        });
    }
    catch (error) {
        console.error('Error fetching RRP details:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching RRP details'
        });
    }
});
exports.getRRPById = getRRPById;
const searchRRP = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { universal, equipmentNumber, partNumber } = req.query;
    if (!universal && !equipmentNumber && !partNumber) {
        (0, logger_1.logEvents)(`Failed to search RRP - No search parameters provided`, "rrpLog.log");
        res.status(400).json({
            error: 'Bad Request',
            message: 'At least one search parameter is required'
        });
        return;
    }
    try {
        let query = `
            SELECT DISTINCT
                rrp.id,
                rrp.rrp_number,
                rrp.date as rrp_date,
                rrp.supplier_name,
                rrp.currency,
                rrp.forex_rate,
                rrp.item_price,
                rrp.customs_charge,
                rrp.customs_service_charge,
                rrp.vat_percentage,
                rrp.invoice_number,
                rrp.invoice_date,
                rrp.po_number,
                rrp.airway_bill_number,
                rrp.inspection_details,
                rrp.approval_status,
                rrp.created_by,
                rrp.total_amount,
                rrp.freight_charge,
                rrp.customs_date,
                rd.item_name,
                rd.part_number,
                rd.received_quantity,
                rd.unit,
                rqd.equipment_number
            FROM rrp_details rrp
            JOIN receive_details rd ON rrp.receive_fk = rd.id
            JOIN request_details rqd ON rd.request_fk = rqd.id
            WHERE 1=1
        `;
        const params = [];
        if (universal) {
            query += ` AND (
                rrp.rrp_number LIKE ? OR
                rd.item_name LIKE ? OR
                rd.part_number LIKE ? OR
                rqd.equipment_number LIKE ?
            )`;
            params.push(`%${universal}%`, `%${universal}%`, `%${universal}%`, `%${universal}%`);
        }
        if (equipmentNumber) {
            query += ` AND rqd.equipment_number LIKE ?`;
            params.push(`%${equipmentNumber}%`);
        }
        if (partNumber) {
            query += ` AND rd.part_number LIKE ?`;
            params.push(`%${partNumber}%`);
        }
        query += ' ORDER BY rrp.date DESC LIMIT 50';
        const [results] = yield db_1.default.execute(query, params);
        const groupedResults = results.reduce((acc, result) => {
            if (!acc[result.rrp_number]) {
                acc[result.rrp_number] = {
                    rrpNumber: result.rrp_number,
                    type: getRRPType(result.rrp_number).type,
                    rrpDate: (0, dateUtils_1.formatDate)(result.rrp_date),
                    supplierName: result.supplier_name,
                    currency: result.currency,
                    forexRate: result.forex_rate,
                    invoiceNumber: result.invoice_number,
                    invoiceDate: (0, dateUtils_1.formatDate)(result.invoice_date),
                    poNumber: result.po_number,
                    airwayBillNumber: result.airway_bill_number,
                    inspectionDetails: JSON.parse(result.inspection_details),
                    approvalStatus: result.approval_status,
                    createdBy: result.created_by,
                    customsDate: (0, dateUtils_1.formatDate)(result.customs_date),
                    items: []
                };
            }
            acc[result.rrp_number].items.push({
                id: result.id,
                itemName: result.item_name,
                partNumber: result.part_number,
                equipmentNumber: result.equipment_number,
                receivedQuantity: result.received_quantity,
                unit: result.unit,
                itemPrice: result.item_price,
                customsCharge: result.customs_charge,
                customsServiceCharge: result.customs_service_charge,
                vatPercentage: result.vat_percentage,
                freightCharge: result.freight_charge,
                totalAmount: result.total_amount
            });
            return acc;
        }, {});
        const response = Object.values(groupedResults);
        (0, logger_1.logEvents)(`Successfully searched RRPs with ${response.length} results`, "rrpLog.log");
        res.json(response);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error searching RRPs: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while searching RRP'
        });
    }
});
exports.searchRRP = searchRRP;
const verifyRRPNumber = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { rrpNumber } = req.params;
        const { date } = req.query;
        if (!rrpNumber || !rrpNumber.match(/^[LF]\d{3}(T\d+)?$/)) {
            (0, logger_1.logEvents)(`Failed to verify RRP number - Invalid format: ${rrpNumber}`, "rrpLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid RRP number format. Must be in format L001 or L001T1'
            });
            return;
        }
        if (!date) {
            (0, logger_1.logEvents)(`Failed to verify RRP number - Missing date parameter`, "rrpLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'RRP date is required'
            });
            return;
        }
        if (rrpNumber.includes('T')) {
            const [rejectedRecord] = yield db_1.default.query(`SELECT rrp_number, date 
                 FROM rrp_details 
                 WHERE rrp_number = ? AND approval_status = 'REJECTED'`, [rrpNumber]);
            if (rejectedRecord.length === 0) {
                (0, logger_1.logEvents)(`Failed to verify RRP number - Not found or not rejected: ${rrpNumber}`, "rrpLog.log");
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'Invalid RRP Number'
                });
                return;
            }
            const baseNumber = rrpNumber.split('T')[0];
            const currentTNumber = parseInt(rrpNumber.split('T')[1]);
            const [previousRecord] = yield db_1.default.query(`SELECT rrp_number, date 
                 FROM rrp_details 
                 WHERE rrp_number LIKE ? 
                 AND CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) < ?
                 ORDER BY CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) DESC
                 LIMIT 1`, [`${baseNumber}T%`, currentTNumber]);
            const [nextRecord] = yield db_1.default.query(`SELECT rrp_number, date 
                 FROM rrp_details 
                 WHERE rrp_number LIKE ? 
                 AND CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) > ?
                 ORDER BY CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) ASC
                 LIMIT 1`, [`${baseNumber}T%`, currentTNumber]);
            const inputDate = new Date(date);
            if (previousRecord.length > 0) {
                const previousDate = new Date(previousRecord[0].date);
                if (inputDate < previousDate) {
                    (0, logger_1.logEvents)(`Failed to verify RRP number - Date before previous RRP: ${rrpNumber}`, "rrpLog.log");
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'RRP date cannot be before the previous RRP date'
                    });
                    return;
                }
            }
            if (nextRecord.length > 0) {
                const nextDate = new Date(nextRecord[0].date);
                if (inputDate > nextDate) {
                    (0, logger_1.logEvents)(`Failed to verify RRP number - Date after next RRP: ${rrpNumber}`, "rrpLog.log");
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'RRP date cannot be greater than the next RRP date'
                    });
                    return;
                }
            }
            (0, logger_1.logEvents)(`Successfully verified RRP number: ${rrpNumber}`, "rrpLog.log");
            res.status(200).json({
                rrpNumber: rrpNumber
            });
        }
        else {
            const [configRows] = yield db_1.default.query('SELECT config_value FROM app_config WHERE config_type = ? AND config_name = ?', ['rrp', 'current_fy']);
            if (configRows.length === 0) {
                (0, logger_1.logEvents)(`Failed to verify RRP number - Current FY configuration not found`, "rrpLog.log");
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: 'Current FY configuration not found'
                });
                return;
            }
            const currentFY = configRows[0].config_value;
            const [rows] = yield db_1.default.query(`SELECT rrp_number, approval_status, current_fy
                 FROM rrp_details 
                 WHERE rrp_number LIKE ?
                 ORDER BY CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) DESC
                 LIMIT 1`, [`${rrpNumber}T%`]);
            if (rows.length > 0) {
                const recordFY = rows[0].current_fy;
                if (recordFY === currentFY) {
                    (0, logger_1.logEvents)(`Failed to verify RRP number - Duplicate in current FY: ${rrpNumber}`, "rrpLog.log");
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'Duplicate RRP number in current fiscal year'
                    });
                    return;
                }
            }
            (0, logger_1.logEvents)(`Successfully verified RRP number: ${rrpNumber}`, "rrpLog.log");
            res.status(200).json({});
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error verifying RRP number ${req.params.rrpNumber}: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while verifying RRP number'
        });
    }
});
exports.verifyRRPNumber = verifyRRPNumber;
const getLatestRRPDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { type } = req.params;
        if (!type || (type !== 'local' && type !== 'foreign')) {
            (0, logger_1.logEvents)(`Failed to fetch latest RRP details - Invalid type: ${type}`, "rrpLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid RRP type. Must be either "local" or "foreign"'
            });
            return;
        }
        const prefix = type === 'local' ? 'L' : 'F';
        const [rows] = yield db_1.default.query(`SELECT 
                rrp_number,
                date as rrp_date
             FROM rrp_details 
             WHERE rrp_number LIKE ?
             ORDER BY CAST(SUBSTRING_INDEX(rrp_number, 'T', -1) AS UNSIGNED) DESC
             LIMIT 1`, [`${prefix}%`]);
        const latestRRP = rows.length > 0 ? {
            rrpNumber: rows[0].rrp_number,
            rrpDate: rows[0].rrp_date
        } : {};
        (0, logger_1.logEvents)(`Successfully fetched latest ${type} RRP details: ${latestRRP.rrpNumber || 'None found'}`, "rrpLog.log");
        res.status(200).json(latestRRP);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error fetching latest RRP details for type ${req.params.type}: ${errorMessage}`, "rrpLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while fetching latest RRP details'
        });
    }
});
exports.getLatestRRPDetails = getLatestRRPDetails;
