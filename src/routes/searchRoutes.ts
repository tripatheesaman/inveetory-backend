import { Router } from 'express';
import { searchStockDetails } from '../controllers/searchController';
import verifyJWT from '../middlewares/verifyJWT';

const router = Router();

// Add authentication middleware to protect the search endpoint
router.get('/search', verifyJWT, searchStockDetails);

export default router; 