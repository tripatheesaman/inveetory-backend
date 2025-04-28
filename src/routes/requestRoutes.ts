import express from 'express';
import { createRequest, getPendingRequests, getRequestItems, updateRequest, approveRequest, rejectRequest, getRequestById } from '../controllers/requestController';
import verifyJWT from '../middlewares/verifyJWT';

const router = express.Router();

router.post('/create', verifyJWT, createRequest);
router.get('/pending', verifyJWT, getPendingRequests);
router.get('/items/:requestNumber', verifyJWT, getRequestItems);
router.put('/:requestNumber', verifyJWT, updateRequest);
router.put('/:requestNumber/approve', verifyJWT, approveRequest);
router.put('/:requestNumber/reject', verifyJWT, rejectRequest);
router.get('/:id', verifyJWT, getRequestById);

export default router; 