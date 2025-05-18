import express from 'express';
import { getRRPConfig, getRRPItems, createRRP, getPendingRRPs, approveRRP, rejectRRP, updateRRP, getRRPById, searchRRP } from '../controllers/rrpController';

const router = express.Router();

// Get RRP configuration
router.get('/config', getRRPConfig);

// Get RRP items
router.get('/items', getRRPItems);

// Get RRP items by ID
router.get('/items/:id', getRRPById);

// Get pending RRPs
router.get('/pending', getPendingRRPs);

// Search RRP
router.get('/search', searchRRP);

// Create RRP
router.post('/', createRRP);

// Approve RRP
router.put('/:rrpNumber/approve', approveRRP);

// Reject RRP
router.put('/:rrpNumber/reject', rejectRRP);

// Update RRP
router.put('/:rrpNumber', updateRRP);

export default router; 