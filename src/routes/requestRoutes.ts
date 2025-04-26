import express from 'express';
import { createRequest, getPendingRequests, getRequestItems } from '../controllers/requestController';
import verifyJWT from '../middlewares/verifyJWT';

const router = express.Router();

router.post('/create', verifyJWT, createRequest);
router.get('/pending', verifyJWT, getPendingRequests);
router.get('/items/:requestNumber', verifyJWT, getRequestItems);

export default router; 