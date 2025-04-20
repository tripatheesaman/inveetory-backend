import { Router } from 'express';
import { updateStock } from '../controllers/transactionController';
import verifyJWT from '../middlewares/verifyJWT';

const router = Router();

// Add authentication middleware to protect the transaction endpoints
router.post('/transactions', verifyJWT, updateStock);

export default router; 