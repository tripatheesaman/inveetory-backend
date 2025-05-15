import express from 'express';
import { getRRPConfig, getRRPItems, createRRP, getPendingRRPs, approveRRP, rejectRRP, updateRRP } from '../controllers/rrpController';

const router = express.Router();

// Get RRP configuration
router.get('/config', getRRPConfig);

// Get RRP items
router.get('/items', getRRPItems);

// Create RRP
router.post('/create', createRRP);

// Get pending RRPs
router.get('/pending', getPendingRRPs);

// Approve RRP
router.post('/approve', approveRRP);

// Reject RRP
router.post('/reject', rejectRRP);

// Update RRP
router.put('/update/:rrpNumber', updateRRP);

export default router; 