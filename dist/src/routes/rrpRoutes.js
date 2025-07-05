"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const rrpController_1 = require("../controllers/rrpController");
const printController_1 = require("../controllers/printController");
const router = express_1.default.Router();
// Get RRP configuration
router.get('/config', rrpController_1.getRRPConfig);
// Get RRP items
router.get('/items', rrpController_1.getRRPItems);
// Get RRP items by ID
router.get('/items/:id', rrpController_1.getRRPById);
// Get pending RRPs
router.get('/pending', rrpController_1.getPendingRRPs);
// Search RRP
router.get('/search', rrpController_1.searchRRP);
// Get latest RRP details
router.get('/getlatestrrpdetails/:type', rrpController_1.getLatestRRPDetails);
// Verify RRP number
router.get('/verifyRRPNumber/:rrpNumber', rrpController_1.verifyRRPNumber);
// Create RRP
router.post('/create', rrpController_1.createRRP);
// Approve RRP
router.post('/approve/:rrpNumber', rrpController_1.approveRRP);
// Reject RRP
router.post('/reject/:rrpNumber', rrpController_1.rejectRRP);
// Update RRP
router.put('/update/:rrpNumber', rrpController_1.updateRRP);
router.get('/:rrpNumber/print', printController_1.printRRP);
exports.default = router;
