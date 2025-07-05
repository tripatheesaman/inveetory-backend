"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const notificationController_1 = require("../controllers/notificationController");
const verifyJWT_1 = __importDefault(require("../middlewares/verifyJWT"));
const router = express_1.default.Router();
router.get('/:username', verifyJWT_1.default, notificationController_1.getUserNotifications);
router.put('/read/:notificationId', verifyJWT_1.default, notificationController_1.markNotificationAsRead);
router.delete('/delete/:notificationId', verifyJWT_1.default, notificationController_1.deleteNotification);
exports.default = router;
