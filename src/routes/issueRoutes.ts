import express from 'express';
import { createIssue, approveIssue, rejectIssue, getPendingIssues, updateIssueItem,deleteIssueItem } from '../controllers/issueController';

const router = express.Router();




router.get('/pending',getPendingIssues )
router.put('/item/:id',updateIssueItem )
router.post('/create', createIssue);

router.put('/approve', approveIssue);

router.put('/reject', rejectIssue);
router.delete('/item/:id', deleteIssueItem)

export default router; 