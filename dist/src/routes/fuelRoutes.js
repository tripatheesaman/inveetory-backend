"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fuelController_1 = require("../controllers/fuelController");
const reportController_1 = require("../controllers/reportController");
const router = express_1.default.Router();
// Get fuel configuration
router.get('/config/:type', fuelController_1.getFuelConfig);
// Create a new fuel record
router.post('/create', fuelController_1.createFuelRecord);
// Update a fuel record
router.put('/:id', fuelController_1.updateFuelRecord);
// Delete a fuel record
router.delete('/:id', fuelController_1.deleteFuelRecord);
// Approve a fuel record
router.post('/:id/approve', fuelController_1.approveFuelRecord);
router.post('/receive', fuelController_1.receiveFuel);
router.get('/last-receive', fuelController_1.getLastReceive);
// Weekly diesel report routes
router.get('/reports/diesel/weekly/check', reportController_1.checkFlightCount);
router.get('/reports/diesel/weekly', reportController_1.generateWeeklyDieselReport);
// Weekly petrol report routes
router.get('/reports/petrol/weekly', reportController_1.generateWeeklyPetrolReport);
// Oil Consumption Report
router.get('/reports/oil/consumption', reportController_1.generateOilConsumptionReport);
exports.default = router;
