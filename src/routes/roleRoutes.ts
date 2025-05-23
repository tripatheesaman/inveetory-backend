import express from 'express';
import { getRoles } from '../controllers/roleController';

const router = express.Router();

// Get roles with hierarchy-based access
router.get('/', getRoles);

export default router; 