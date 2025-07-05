"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const userController_1 = require("../controllers/userController");
const router = express_1.default.Router();
// Get users with role-based access
router.get('/', userController_1.getUsers);
// Get single user by ID
router.get('/:id', userController_1.getUserById);
// Create new user
router.post('/create', userController_1.createUser);
// Update user
router.put('/:id', userController_1.updateUser);
// Delete user
router.delete('/:id', userController_1.deleteUser);
// Update user permissions
router.put('/:id/permissions', userController_1.updateUserPermissions);
exports.default = router;
