import express from 'express';
import { getRRPConfig, getRRPItems } from '../controllers/rrpController';

const router = express.Router();

// Get RRP configuration
router.get('/config', getRRPConfig);

// Get RRP items
router.get('/items', getRRPItems);

export default router; 