import express from 'express';
import { createIssue, approveIssue, rejectIssue } from '../controllers/issueController';
import verifyJWT from '../middlewares/verifyJWT';

const router = express.Router();

// Create new issue
router.post('/create', verifyJWT, createIssue);

// Approve issue
router.post('/:issueId/approve', verifyJWT, approveIssue);

// Reject issue
router.post('/:issueId/reject', verifyJWT, rejectIssue);

export default router; 