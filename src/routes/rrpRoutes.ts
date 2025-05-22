import express from 'express';
import { getRRPConfig, getRRPItems, createRRP, getPendingRRPs, approveRRP, rejectRRP, updateRRP, getRRPById, searchRRP, getLatestRRPDetails, verifyRRPNumber } from '../controllers/rrpController';
import { printRRP } from '../controllers/printController';

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

// Get latest RRP details
router.get('/getlatestrrpdetails/:type', getLatestRRPDetails);

// Verify RRP number
router.get('/verifyRRPNumber/:rrpNumber', verifyRRPNumber);

// Create RRP
router.post('/create', createRRP);

// Approve RRP
router.post('/approve/:rrpNumber', approveRRP);

// Reject RRP
router.post('/reject/:rrpNumber', rejectRRP);

// Update RRP
router.put('/update/:rrpNumber', updateRRP);
router.get('/:rrpNumber/print', printRRP);
export default router; 