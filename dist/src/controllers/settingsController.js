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
exports.deleteRRPSupplier = exports.updateRRPSupplier = exports.addRRPSupplier = exports.getRRPSuppliers = exports.updateRRPAuthorityDetails = exports.getRRPAuthorityDetails = exports.updateRequestAuthorityDetails = exports.getRequestAuthorityDetails = exports.updateFiscalYear = exports.getFiscalYear = void 0;
const db_1 = __importDefault(require("../config/db"));
const logger_1 = require("../middlewares/logger");
const getFiscalYear = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        const [rows] = yield connection.execute('SELECT config_value FROM app_config WHERE config_name = ?', ['current_fy']);
        if (rows.length === 0) {
            res.status(404).json({
                error: 'Not Found',
                message: 'Fiscal year configuration not found'
            });
            return;
        }
        res.status(200).json({
            fiscalYear: rows[0].config_value
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error in getFiscalYear: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
});
exports.getFiscalYear = getFiscalYear;
const updateFiscalYear = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { fiscalYear } = req.body;
    const connection = yield db_1.default.getConnection();
    try {
        if (!fiscalYear) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Fiscal year is required'
            });
            return;
        }
        // Validate fiscal year format (YYYY/YY)
        const fiscalYearRegex = /^\d{4}\/\d{2}$/;
        if (!fiscalYearRegex.test(fiscalYear)) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid fiscal year format. Must be in format YYYY/YY (e.g., 2081/82)'
            });
            return;
        }
        const [result] = yield connection.execute('UPDATE app_config SET config_value = ? WHERE config_name = ?', [fiscalYear, 'current_fy']);
        if (result.affectedRows === 0) {
            // If no rows were updated, insert a new record
            yield connection.execute('INSERT INTO app_config (config_name, config_value) VALUES (?, ?)', ['current_fy', fiscalYear]);
        }
        res.status(200).json({
            message: 'Fiscal year updated successfully',
            fiscalYear
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error in updateFiscalYear: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
});
exports.updateFiscalYear = updateFiscalYear;
const getRequestAuthorityDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        const [rows] = yield connection.execute('SELECT * FROM authority_details WHERE authority_type = ?', ['request']);
        res.status(200).json(rows);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error in getRequestAuthorityDetails: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
});
exports.getRequestAuthorityDetails = getRequestAuthorityDetails;
const updateRequestAuthorityDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { authorityDetails } = req.body;
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        // Delete existing request authority details
        yield connection.execute('DELETE FROM authority_details WHERE authority_type = ?', ['request']);
        // Insert new authority details
        for (const auth of authorityDetails) {
            yield connection.execute(`INSERT INTO authority_details (
          authority_type,
          level_1_authority_name,
          level_1_authority_staffid,
          level_1_authority_designation,
          level_2_authority_name,
          level_2_authority_staffid,
          level_2_authority_designation,
          level_3_authority_name,
          level_3_authority_staffid,
          level_3_authority_designation,
          quality_check_authority_name,
          quality_check_authority_staffid,
          quality_check_authority_designation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                'request',
                auth.level_1_authority_name,
                auth.level_1_authority_staffid,
                auth.level_1_authority_designation,
                auth.level_2_authority_name,
                auth.level_2_authority_staffid,
                auth.level_2_authority_designation,
                auth.level_3_authority_name,
                auth.level_3_authority_staffid,
                auth.level_3_authority_designation,
                auth.quality_check_authority_name,
                auth.quality_check_authority_staffid,
                auth.quality_check_authority_designation
            ]);
        }
        yield connection.commit();
        res.status(200).json({ message: 'Authority details updated successfully' });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error in updateRequestAuthorityDetails: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
});
exports.updateRequestAuthorityDetails = updateRequestAuthorityDetails;
const getRRPAuthorityDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        const [rows] = yield connection.execute('SELECT * FROM authority_details WHERE authority_type = ?', ['rrp']);
        res.status(200).json(rows);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error in getRRPAuthorityDetails: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
});
exports.getRRPAuthorityDetails = getRRPAuthorityDetails;
const updateRRPAuthorityDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { authorityDetails } = req.body;
    const connection = yield db_1.default.getConnection();
    try {
        yield connection.beginTransaction();
        // Delete existing RRP authority details
        yield connection.execute('DELETE FROM authority_details WHERE authority_type = ?', ['rrp']);
        // Insert new authority details
        for (const auth of authorityDetails) {
            yield connection.execute(`INSERT INTO authority_details (
          authority_type,
          level_1_authority_name,
          level_1_authority_staffid,
          level_1_authority_designation,
          level_2_authority_name,
          level_2_authority_staffid,
          level_2_authority_designation,
          level_3_authority_name,
          level_3_authority_staffid,
          level_3_authority_designation,
          quality_check_authority_name,
          quality_check_authority_staffid,
          quality_check_authority_designation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                'rrp',
                auth.level_1_authority_name,
                auth.level_1_authority_staffid,
                auth.level_1_authority_designation,
                auth.level_2_authority_name,
                auth.level_2_authority_staffid,
                auth.level_2_authority_designation,
                auth.level_3_authority_name,
                auth.level_3_authority_staffid,
                auth.level_3_authority_designation,
                auth.quality_check_authority_name,
                auth.quality_check_authority_staffid,
                auth.quality_check_authority_designation
            ]);
        }
        yield connection.commit();
        res.status(200).json({ message: 'Authority details updated successfully' });
    }
    catch (error) {
        yield connection.rollback();
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error in updateRRPAuthorityDetails: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
});
exports.updateRRPAuthorityDetails = updateRRPAuthorityDetails;
const getRRPSuppliers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const connection = yield db_1.default.getConnection();
    try {
        const [rows] = yield connection.execute(`SELECT config_name, config_value 
       FROM app_config 
       WHERE config_name IN ('supplier_list_local', 'supplier_list_foreign')`);
        const suppliers = rows.reduce((acc, row) => {
            const type = row.config_name === 'supplier_list_local' ? 'local' : 'foreign';
            const names = row.config_value ? row.config_value.split(', ').map((name) => name.trim()) : [];
            return [
                ...acc,
                ...names.map((name, index) => ({
                    id: `${type}-${index + 1}`,
                    name,
                    type
                }))
            ];
        }, []);
        res.status(200).json(suppliers);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error in getRRPSuppliers: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
});
exports.getRRPSuppliers = getRRPSuppliers;
const addRRPSupplier = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, type } = req.body;
    const connection = yield db_1.default.getConnection();
    try {
        const configName = type === 'local' ? 'supplier_list_local' : 'supplier_list_foreign';
        // Get current list
        const [rows] = yield connection.execute('SELECT config_value FROM app_config WHERE config_name = ?', [configName]);
        if (rows.length === 0) {
            // If no config exists, create new
            yield connection.execute('INSERT INTO app_config (config_name, config_value) VALUES (?, ?)', [configName, name]);
        }
        else {
            // Append to existing list
            const currentList = rows[0].config_value;
            const newList = currentList ? `${currentList}, ${name}` : name;
            yield connection.execute('UPDATE app_config SET config_value = ? WHERE config_name = ?', [newList, configName]);
        }
        res.status(201).json({
            id: `${type}-${Date.now()}`,
            name,
            type
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error in addRRPSupplier: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
});
exports.addRRPSupplier = addRRPSupplier;
const updateRRPSupplier = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { name, type } = req.body;
    const connection = yield db_1.default.getConnection();
    try {
        const configName = type === 'local' ? 'supplier_list_local' : 'supplier_list_foreign';
        // Get current list
        const [rows] = yield connection.execute('SELECT config_value FROM app_config WHERE config_name = ?', [configName]);
        if (rows.length > 0) {
            const currentList = rows[0].config_value.split(', ');
            const index = parseInt(id.split('-')[1]) - 1;
            if (index >= 0 && index < currentList.length) {
                currentList[index] = name;
                const newList = currentList.join(', ');
                yield connection.execute('UPDATE app_config SET config_value = ? WHERE config_name = ?', [newList, configName]);
                res.status(200).json({
                    id,
                    name,
                    type
                });
            }
            else {
                res.status(404).json({
                    error: 'Not Found',
                    message: 'Supplier not found'
                });
            }
        }
        else {
            res.status(404).json({
                error: 'Not Found',
                message: 'Supplier list not found'
            });
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error in updateRRPSupplier: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
});
exports.updateRRPSupplier = updateRRPSupplier;
const deleteRRPSupplier = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { name, type } = req.body;
    const connection = yield db_1.default.getConnection();
    try {
        const configName = type === 'local' ? 'supplier_list_local' : 'supplier_list_foreign';
        // Get current list
        const [rows] = yield connection.execute('SELECT config_value FROM app_config WHERE config_name = ?', [configName]);
        if (rows.length > 0) {
            const currentList = rows[0].config_value.split(', ');
            const index = currentList.findIndex((supplier) => supplier.trim() === name.trim());
            if (index >= 0) {
                currentList.splice(index, 1);
                const newList = currentList.join(', ');
                yield connection.execute('UPDATE app_config SET config_value = ? WHERE config_name = ?', [newList, configName]);
                res.status(200).json({
                    message: 'Supplier deleted successfully'
                });
            }
            else {
                res.status(404).json({
                    error: 'Not Found',
                    message: 'Supplier not found'
                });
            }
        }
        else {
            res.status(404).json({
                error: 'Not Found',
                message: 'Supplier list not found'
            });
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (0, logger_1.logEvents)(`Error in deleteRRPSupplier: ${errorMessage}`, "settingsLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: errorMessage
        });
    }
    finally {
        connection.release();
    }
});
exports.deleteRRPSupplier = deleteRRPSupplier;
