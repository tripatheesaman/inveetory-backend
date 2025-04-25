import express from 'express';
import { createRequest } from '../controllers/requestController';
import verifyJWT from '../middlewares/verifyJWT';

const router = express.Router();

router.post('/create', verifyJWT, createRequest);

export default router; 