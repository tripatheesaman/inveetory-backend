import express from 'express';
import { getRRPConfig, getRRPItems, createRRP } from '../controllers/rrpController';

const router = express.Router();

// Get RRP configuration
router.get('/config', getRRPConfig);

// Get RRP items
router.get('/items', getRRPItems);

// Create RRP
router.post('/create', createRRP);

export default router; 