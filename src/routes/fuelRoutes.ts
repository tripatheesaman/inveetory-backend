import express from 'express';
import { 
  createFuelRecord, 
  updateFuelRecord, 
  deleteFuelRecord, 
  approveFuelRecord,
  getFuelConfig,
  receiveFuel,
  getLastReceive
} from '../controllers/fuelController';
import {
  checkFlightCount,
  generateWeeklyDieselReport
} from '../controllers/reportController';

const router = express.Router();

// Get fuel configuration
router.get('/config/:type', getFuelConfig);

// Create a new fuel record
router.post('/create', createFuelRecord);

// Update a fuel record
router.put('/:id', updateFuelRecord);

// Delete a fuel record
router.delete('/:id', deleteFuelRecord);

// Approve a fuel record
router.post('/:id/approve', approveFuelRecord);

router.post('/receive', receiveFuel);
router.get('/last-receive', getLastReceive);

// Weekly diesel report routes
router.get('/reports/diesel/weekly/check', checkFlightCount);
router.get('/reports/diesel/weekly', generateWeeklyDieselReport);

export default router; 