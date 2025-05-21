import express from 'express';
import { createRequest, getPendingRequests, getRequestItems, updateRequest, approveRequest, rejectRequest, getRequestById, searchRequests, getLastRequestInfo } from '../controllers/requestController';
import verifyJWT from '../middlewares/verifyJWT';
import { printRequest } from '../controllers/printController';

const router = express.Router();

router.get('/pending', verifyJWT, getPendingRequests);
router.get('/search', verifyJWT, searchRequests);
router.get('/items/:requestNumber', verifyJWT, getRequestItems);
router.get('/getlastrequestinfo', verifyJWT, getLastRequestInfo);
router.post('/create', verifyJWT, createRequest);
router.put('/:requestNumber', verifyJWT, updateRequest);
router.put('/:requestNumber/approve', verifyJWT, approveRequest);
router.put('/:requestNumber/reject', verifyJWT, rejectRequest);
router.get('/:id', verifyJWT, getRequestById);
router.get('/:requestNumber/print', printRequest);

export default router; 