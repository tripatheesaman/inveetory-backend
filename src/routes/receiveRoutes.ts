import express from 'express';
import { searchReceivables, createReceive } from '../controllers/receiveController';
import verifyJWT from '../middlewares/verifyJWT';

const router = express.Router();

router.get('/receivable/search', verifyJWT, searchReceivables);
router.post('/', verifyJWT, createReceive);

export default router; 