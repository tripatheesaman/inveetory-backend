import express from 'express';
import { createFuelRecord, updateFuelRecord, deleteFuelRecord, approveFuelRecord, getFuelConfig } from '../controllers/fuelController';

const router = express.Router();

// Get fuel configuration
router.get('/config/:type', getFuelConfig);

// Create a new fuel record
router.post('/', createFuelRecord);

// Update a fuel record
router.put('/:id', updateFuelRecord);

// Delete a fuel record
router.delete('/:id', deleteFuelRecord);

// Approve a fuel record
router.put('/:id/approve', approveFuelRecord);

export default router; 