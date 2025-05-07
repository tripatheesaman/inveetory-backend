import express from 'express';
import verifyJWT from '../middlewares/verifyJWT';
import * as receiveController from '../controllers/receiveController';

const router = express.Router();

router.get('/pending', verifyJWT, receiveController.getPendingReceives);
router.get('/search', verifyJWT, receiveController.searchReceivables);
router.post('/', verifyJWT, receiveController.createReceive);
router.get('/:receiveId/details', verifyJWT, receiveController.getReceiveDetails);
router.put('/:receiveId/update', verifyJWT, receiveController.updateReceiveQuantity);
router.put('/:receiveId/approve', verifyJWT, receiveController.approveReceive);

export default router; 