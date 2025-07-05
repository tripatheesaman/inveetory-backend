"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const settingsController_1 = require("../controllers/settingsController");
const verifyJWT_1 = __importDefault(require("../middlewares/verifyJWT"));
const router = express_1.default.Router();
// Apply JWT verification middleware to all routes
router.use(verifyJWT_1.default);
// Get current fiscal year
router.get('/fiscal-year', settingsController_1.getFiscalYear);
// Update fiscal year
router.put('/fiscal-year', settingsController_1.updateFiscalYear);
// Request authority details routes
router.get('/request/authority-details', settingsController_1.getRequestAuthorityDetails);
router.put('/request/authority-details', settingsController_1.updateRequestAuthorityDetails);
// RRP authority details routes
router.get('/rrp/authority-details', settingsController_1.getRRPAuthorityDetails);
router.put('/rrp/authority-details', settingsController_1.updateRRPAuthorityDetails);
// RRP supplier routes
router.get('/rrp/suppliers', settingsController_1.getRRPSuppliers);
router.post('/rrp/suppliers', settingsController_1.addRRPSupplier);
router.put('/rrp/suppliers/:id', settingsController_1.updateRRPSupplier);
router.delete('/rrp/suppliers/:id', settingsController_1.deleteRRPSupplier);
exports.default = router;
