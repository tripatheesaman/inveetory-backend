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
exports.getLastReceive = exports.receiveFuel = exports.getFuelConfig = exports.approveFuelRecord = exports.deleteFuelRecord = exports.updateFuelRecord = exports.createFuelRecord = void 0;
const db_1 = __importDefault(require("../config/db"));
const logger_1 = require("../middlewares/logger");
const issueController_1 = require("./issueController");
const createFuelRecord = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const payload = req.body;
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        // Get current FY from app_config
        const [configRows] = yield connection.query('SELECT config_value FROM app_config WHERE config_type = ? AND config_name = ?', ['rrp', 'current_fy']);
        if (configRows.length === 0) {
            throw new Error('Current FY configuration not found');
        }
        const currentFY = configRows[0].config_value;
        // Get the first record date in current FY to determine week 1 start
        const [firstRecordResult] = yield connection.query(`SELECT MIN(i.issue_date) as first_date
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.fy = ?`, [currentFY]);
        let weekNumber = 1;
        const currentDate = new Date(payload.issue_date);
        if ((_a = firstRecordResult[0]) === null || _a === void 0 ? void 0 : _a.first_date) {
            const firstDate = new Date(firstRecordResult[0].first_date);
            const daysDiff = Math.floor((currentDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
            weekNumber = Math.floor(daysDiff / 7) + 1;
        }
        // Get the correct NAC code based on fuel type
        const getNacCode = (fuelType) => {
            switch (fuelType.toLowerCase()) {
                case 'diesel':
                    return 'GT 07986';
                case 'petrol':
                    return 'GT 00000';
                default:
                    throw new Error(`Invalid fuel type: ${fuelType}`);
            }
        };
        // Check if stock exists for each equipment and create if needed
        for (const record of payload.records) {
            const nacCode = getNacCode(payload.fuel_type);
            // First check with exact match
            const [stockResults] = yield connection.query('SELECT id, nac_code FROM stock_details WHERE nac_code = ? COLLATE utf8mb4_unicode_ci', [nacCode]);
            if (stockResults.length === 0) {
                // Create stock record if it doesn't exist
                const [insertResult] = yield connection.query(`INSERT INTO stock_details 
          (nac_code, item_name, part_numbers, applicable_equipments, current_balance, unit) 
          VALUES (?, ?, ?, ?, ?, ?)`, [
                    nacCode,
                    `${payload.fuel_type.charAt(0).toUpperCase() + payload.fuel_type.slice(1)} Fuel`,
                    'N/A',
                    record.equipment_number,
                    0,
                    'Liters'
                ]);
                // Verify the stock was created
                const [verifyResults] = yield connection.query('SELECT id, nac_code FROM stock_details WHERE id = ?', [insertResult.insertId]);
                if (verifyResults.length === 0) {
                    throw new Error(`Failed to create stock record for fuel type ${payload.fuel_type}`);
                }
                (0, logger_1.logEvents)(`Created stock record for fuel type ${payload.fuel_type} with NAC code: ${nacCode}`, "fuelLog.log");
            }
            else {
                (0, logger_1.logEvents)(`Found existing stock record for fuel type ${payload.fuel_type} with NAC code: ${nacCode}`, "fuelLog.log");
            }
        }
        // Create issue record using createIssue function
        const issueReq = {
            body: {
                issueDate: payload.issue_date,
                issuedBy: {
                    name: payload.issued_by,
                    staffId: payload.issued_by
                },
                items: payload.records.map(record => ({
                    nacCode: getNacCode(payload.fuel_type),
                    quantity: record.quantity,
                    equipmentNumber: record.equipment_number,
                    partNumber: 'N/A'
                }))
            }
        };
        let issueIds = [];
        const issueRes = {
            status: (code) => ({
                json: (data) => {
                    (0, logger_1.logEvents)(`CreateIssue response data: ${JSON.stringify(data)}`, "fuelLog.log");
                    if (code === 201) {
                        if (data.issueIds && Array.isArray(data.issueIds)) {
                            issueIds = data.issueIds;
                            (0, logger_1.logEvents)(`Issue records created successfully with IDs: ${issueIds.join(', ')}`, "fuelLog.log");
                        }
                        else {
                            (0, logger_1.logEvents)(`Failed to find issue IDs in response: ${JSON.stringify(data)}`, "fuelLog.log");
                        }
                    }
                    else {
                        (0, logger_1.logEvents)(`Failed to create issue record. Status: ${code}, Response: ${JSON.stringify(data)}`, "fuelLog.log");
                    }
                }
            })
        };
        try {
            (0, logger_1.logEvents)(`Sending createIssue request: ${JSON.stringify(issueReq.body)}`, "fuelLog.log");
            yield (0, issueController_1.createIssue)(issueReq, issueRes);
            if (issueIds.length === 0) {
                throw new Error('Failed to create issue record - No issue IDs returned');
            }
        }
        catch (error) {
            (0, logger_1.logEvents)(`Error in createIssue: ${error instanceof Error ? error.message : 'Unknown error'}`, "fuelLog.log");
            throw new Error('Failed to create issue record');
        }
        // Create fuel records for each equipment
        for (let i = 0; i < payload.records.length; i++) {
            const record = payload.records[i];
            const issueId = issueIds[i];
            // Create fuel record
            const [fuelResult] = yield connection.query(`INSERT INTO fuel_records 
        (fuel_type, kilometers, issue_fk, is_kilometer_reset, fuel_price, week_number, fy) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                payload.fuel_type,
                record.kilometers,
                issueId,
                record.is_kilometer_reset ? 1 : 0,
                payload.price,
                weekNumber,
                currentFY
            ]);
            const fuelId = fuelResult.insertId;
            // Log the creation
            (0, logger_1.logEvents)(`Fuel record created - Issue ID: ${issueId}, Fuel ID: ${fuelId}, Equipment: ${record.equipment_number}, Fuel Type: ${payload.fuel_type}, Week: ${weekNumber}, FY: ${currentFY}`, "fuelLog.log");
        }
        yield connection.commit();
        res.status(201).json({
            message: 'Fuel records created successfully',
            issue_ids: issueIds
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error creating fuel records: ${errorMessage}`, "fuelLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while creating fuel records'
        });
    }
    finally {
        connection.release();
    }
});
exports.createFuelRecord = createFuelRecord;
const updateFuelRecord = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { kilometers, fuel_type, is_kilometer_reset } = req.body;
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        // Get the current fuel record with its issue details
        const [fuelDetails] = yield connection.query(`SELECT f.*, i.issue_quantity, i.nac_code 
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.id = ?`, [id]);
        if (fuelDetails.length === 0) {
            throw new Error('Fuel record not found');
        }
        const fuel = fuelDetails[0];
        // Update the fuel record
        yield connection.execute(`UPDATE fuel_records 
       SET fuel_type = ?,
           kilometers = ?,
           is_kilometer_reset = ?,
           updated_datetime = CURRENT_TIMESTAMP
       WHERE id = ?`, [fuel_type, kilometers, is_kilometer_reset || 0, id]);
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully updated fuel record ID: ${id}`, "fuelLog.log");
        res.status(200).json({
            message: 'Fuel record updated successfully'
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error updating fuel record: ${errorMessage} for ID: ${id}`, "fuelLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while updating fuel record'
        });
    }
    finally {
        connection.release();
    }
});
exports.updateFuelRecord = updateFuelRecord;
const deleteFuelRecord = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        // Get the fuel record details before deletion
        const [fuelDetails] = yield connection.query(`SELECT f.*, i.issue_quantity, i.nac_code 
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.id = ?`, [id]);
        if (fuelDetails.length === 0) {
            throw new Error('Fuel record not found');
        }
        const fuel = fuelDetails[0];
        // Delete the fuel record (this will cascade delete the issue record)
        yield connection.execute('DELETE FROM fuel_records WHERE id = ?', [id]);
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully deleted fuel record ID: ${id}`, "fuelLog.log");
        res.status(200).json({
            message: 'Fuel record deleted successfully'
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error deleting fuel record: ${errorMessage} for ID: ${id}`, "fuelLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while deleting fuel record'
        });
    }
    finally {
        connection.release();
    }
});
exports.deleteFuelRecord = deleteFuelRecord;
const approveFuelRecord = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { approvedBy } = req.body;
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        // Get the fuel record with its issue details
        const [fuelDetails] = yield connection.query(`SELECT f.*, i.issue_quantity, i.nac_code 
       FROM fuel_records f
       JOIN issue_details i ON f.issue_fk = i.id
       WHERE f.id = ?`, [id]);
        if (fuelDetails.length === 0) {
            throw new Error('Fuel record not found');
        }
        const fuel = fuelDetails[0];
        // Update the fuel record
        yield connection.execute(`UPDATE fuel_records 
       SET approval_status = 'APPROVED',
           approved_by = ?,
           updated_datetime = CURRENT_TIMESTAMP
       WHERE id = ?`, [JSON.stringify(approvedBy), id]);
        // Update the issue record
        yield connection.execute(`UPDATE issue_details 
       SET approval_status = 'APPROVED',
           approved_by = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [JSON.stringify(approvedBy), fuel.issue_fk]);
        yield connection.commit();
        (0, logger_1.logEvents)(`Successfully approved fuel record ID: ${id}`, "fuelLog.log");
        res.status(200).json({
            message: 'Fuel record approved successfully'
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error approving fuel record: ${errorMessage} for ID: ${id}`, "fuelLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while approving fuel record'
        });
    }
    finally {
        connection.release();
    }
});
exports.approveFuelRecord = approveFuelRecord;
const getFuelConfig = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { type } = req.params;
    const connection = yield db_1.default.getConnection();
    try {
        // Get the equipment list from config
        const [configResult] = yield connection.query('SELECT config_value FROM app_config WHERE config_name = ? AND config_type = "fuel"', [`valid_equipment_list_${type.toLowerCase()}`]);
        if (configResult.length === 0) {
            throw new Error('Fuel configuration not found');
        }
        // Clean and split the equipment list
        const equipmentList = configResult[0].config_value
            .replace(/\r\n/g, '') // Remove newlines
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item && !item.includes(' ')); // Remove empty items and items with spaces
        // Get latest kilometers for each equipment
        const [kilometerResults] = yield connection.query(`SELECT fr.kilometers, fr.is_kilometer_reset, id.issued_for
       FROM fuel_records fr
       JOIN issue_details id ON fr.issue_fk = id.id
       WHERE id.issued_for IN (?)
       AND (id.issued_for, id.issue_date, fr.id) IN (
         SELECT id2.issued_for, id2.issue_date, MAX(fr2.id)
         FROM fuel_records fr2
         JOIN issue_details id2 ON fr2.issue_fk = id2.id
         WHERE id2.issued_for IN (?)
         GROUP BY id2.issued_for, id2.issue_date
       )
       ORDER BY id.issue_date DESC, fr.id DESC`, [equipmentList, equipmentList]);
        // Get the latest fuel price for the type
        const [priceResult] = yield connection.query(`SELECT fuel_price 
       FROM fuel_records 
       WHERE fuel_type = ?
       ORDER BY created_datetime DESC 
       LIMIT 1`, [type]);
        const latestFuelPrice = priceResult.length > 0 ? priceResult[0].fuel_price : 0;
        // Create equipment-kilometer mapping
        const equipmentKilometers = equipmentList.reduce((acc, equipment) => {
            const record = kilometerResults.find(r => r.issued_for === equipment);
            acc[equipment] = record && !record.is_kilometer_reset ? record.kilometers : 0;
            return acc;
        }, {});
        res.status(200).json({
            equipment_list: equipmentList,
            equipment_kilometers: equipmentKilometers,
            latest_fuel_price: latestFuelPrice
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error getting fuel config: ${errorMessage}`, "fuelLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while getting fuel config'
        });
    }
    finally {
        connection.release();
    }
});
exports.getFuelConfig = getFuelConfig;
const receiveFuel = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { receive_date, received_by, quantity } = req.body;
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        // Insert into transaction_details
        const [transactionResult] = yield connection.query(`INSERT INTO transaction_details 
      (transaction_type, transaction_quantity, transaction_date, transaction_status, transaction_done_by) 
      VALUES (?, ?, ?, ?, ?)`, ['purchase', quantity, receive_date, 'confirmed', received_by]);
        const transactionId = transactionResult.insertId;
        // Update stock balance
        const [updateResult] = yield connection.query(`UPDATE stock_details 
       SET current_balance = current_balance + ? 
       WHERE nac_code = ?`, [quantity, 'GT 00000']);
        if (updateResult.affectedRows === 0) {
            throw new Error('Failed to update stock balance');
        }
        yield connection.commit();
        (0, logger_1.logEvents)(`Fuel received successfully - Quantity: ${quantity}, Received by: ${received_by}`, "fuelLog.log");
        res.status(201).json({
            message: 'Fuel received successfully',
            transaction_id: transactionId
        });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error receiving fuel: ${errorMessage}`, "fuelLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while receiving fuel'
        });
    }
    finally {
        connection.release();
    }
});
exports.receiveFuel = receiveFuel;
const getLastReceive = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        const [result] = yield connection.query(`SELECT transaction_date as last_receive_date, transaction_quantity as last_receive_quantity
       FROM transaction_details
       WHERE transaction_type = 'purchase'
       AND nac_code = 'GT 00000'
       ORDER BY transaction_date DESC
       LIMIT 1`);
        if (result.length === 0) {
            res.status(200).json({
                last_receive_date: null,
                last_receive_quantity: 0
            });
            return;
        }
        res.status(200).json(result[0]);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error getting last receive: ${errorMessage}`, "fuelLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while getting last receive'
        });
    }
    finally {
        connection.release();
    }
});
exports.getLastReceive = getLastReceive;
