import express from 'express';
import { getDailyIssueReport } from '../controllers/reportController';
import  verifyJWT  from '../middlewares/verifyJWT';

const router = express.Router();

router.get('/dailyissue', verifyJWT, getDailyIssueReport);

export default router; 