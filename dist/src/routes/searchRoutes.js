"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const searchController_1 = require("../controllers/searchController");
const verifyJWT_1 = __importDefault(require("../middlewares/verifyJWT"));
const router = express_1.default.Router();
// Add authentication middleware to protect the search endpoint
router.get('/', verifyJWT_1.default, searchController_1.searchStockDetails);
// Get item details by ID
router.get('/items/:id', searchController_1.getItemDetails);
exports.default = router;
