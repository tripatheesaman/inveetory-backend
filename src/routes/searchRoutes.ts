import express from 'express';
import { searchStockDetails, getItemDetails } from '../controllers/searchController';
import verifyJWT from '../middlewares/verifyJWT';

const router = express.Router();

// Add authentication middleware to protect the search endpoint
router.get('/', verifyJWT, searchStockDetails);

// Get item details by ID
router.get('/items/:id', getItemDetails);

export default router; 