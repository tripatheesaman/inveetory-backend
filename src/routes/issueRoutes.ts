import express from 'express';
import { createIssue } from '../controllers/issueController';
import verifyJWT from '../middlewares/verifyJWT';

const router = express.Router();

// Create new issue
router.post('/create', verifyJWT, createIssue);

export default router; 