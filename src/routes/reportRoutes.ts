import express from 'express';
import { getDailyIssueReport, exportDailyIssueReport } from '../controllers/reportController';
import verifyJWT from '../middlewares/verifyJWT';

const router = express.Router();

router.get('/dailyissue', verifyJWT, getDailyIssueReport);
router.post('/dailyissue/export', verifyJWT, exportDailyIssueReport);

export default router; 