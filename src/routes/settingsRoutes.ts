import express from 'express';
import { 
  getFiscalYear, 
  updateFiscalYear, 
  getRequestAuthorityDetails, 
  updateRequestAuthorityDetails,
  getRRPAuthorityDetails,
  updateRRPAuthorityDetails,
  getRRPSuppliers,
  addRRPSupplier,
  updateRRPSupplier,
  deleteRRPSupplier
} from '../controllers/settingsController';
import verifyJWT from '../middlewares/verifyJWT';

const router = express.Router();

// Apply JWT verification middleware to all routes
router.use(verifyJWT);

// Get current fiscal year
router.get('/fiscal-year', getFiscalYear);

// Update fiscal year
router.put('/fiscal-year', updateFiscalYear);

// Request authority details routes
router.get('/request/authority-details', getRequestAuthorityDetails);
router.put('/request/authority-details', updateRequestAuthorityDetails);

// RRP authority details routes
router.get('/rrp/authority-details', getRRPAuthorityDetails);
router.put('/rrp/authority-details', updateRRPAuthorityDetails);

// RRP supplier routes
router.get('/rrp/suppliers', getRRPSuppliers);
router.post('/rrp/suppliers', addRRPSupplier);
router.put('/rrp/suppliers/:id', updateRRPSupplier);
router.delete('/rrp/suppliers/:id', deleteRRPSupplier);

export default router; 