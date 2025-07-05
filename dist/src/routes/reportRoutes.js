"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const reportController_1 = require("../controllers/reportController");
const verifyJWT_1 = __importDefault(require("../middlewares/verifyJWT"));
const router = express_1.default.Router();
router.get('/dailyissue', verifyJWT_1.default, reportController_1.getDailyIssueReport);
router.post('/dailyissue/export', verifyJWT_1.default, reportController_1.exportDailyIssueReport);
router.post('/stockcard', verifyJWT_1.default, reportController_1.generateStockCardReport);
exports.default = router;
