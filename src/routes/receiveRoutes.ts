import express from 'express';
import { searchReceivables, createReceive, getPendingReceives, getReceiveDetails, updateReceiveQuantity } from '../controllers/receiveController';
import verifyJWT from '../middlewares/verifyJWT';

const router = express.Router();

router.get('/receivable/search', verifyJWT, searchReceivables);
router.post('/', verifyJWT, createReceive);
router.get('/pending', verifyJWT, getPendingReceives);
router.get('/:receiveId/details', verifyJWT, getReceiveDetails);
router.put('/:receiveId/update', verifyJWT, updateReceiveQuantity);

export default router; 