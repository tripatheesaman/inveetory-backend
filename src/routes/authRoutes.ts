import express from 'express';
import { login, checkResetEligibility, resetPassword } from '../controllers/authController';

const router = express.Router();

router.post('/login', login);
router.post('/check-reset-eligibility', checkResetEligibility);
router.post('/reset-password', resetPassword);

export default router;
