import express from 'express';
import { searchReceivables } from '../controllers/receiveController';
import verifyJWT from '../middlewares/verifyJWT';

const router = express.Router();

router.get('/receivable/search', verifyJWT, searchReceivables);

export default router; 