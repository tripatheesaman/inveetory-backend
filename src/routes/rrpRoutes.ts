import express from 'express';
import { getRRPConfig, getRRPItems, createRRP, getPendingRRPs, approveRRP, rejectRRP, updateRRP, getRRPById } from '../controllers/rrpController';

const router = express.Router();

// Get RRP configuration
router.get('/config', getRRPConfig);

// Get RRP items
router.get('/items', getRRPItems);

// Get RRP items by ID
router.get('/items/:id', getRRPById);

// Get pending RRPs
router.get('/pending', getPendingRRPs);

// Create RRP
router.post('/create', createRRP);

// Approve RRP
router.post('/approve/:rrpNumber', approveRRP);

// Reject RRP
router.post('/reject/:rrpNumber', rejectRRP);

// Update RRP
router.put('/update/:rrpNumber', updateRRP);

export default router; 