"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const issueController_1 = require("../controllers/issueController");
const router = express_1.default.Router();
router.get('/pending', issueController_1.getPendingIssues);
router.put('/item/:id', issueController_1.updateIssueItem);
router.post('/create', issueController_1.createIssue);
router.put('/approve', issueController_1.approveIssue);
router.put('/reject', issueController_1.rejectIssue);
router.delete('/item/:id', issueController_1.deleteIssueItem);
exports.default = router;
