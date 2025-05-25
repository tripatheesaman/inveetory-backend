import express from 'express';
import { getPermissions } from '../controllers/permissionController';

const router = express.Router();

// Get permissions with access status
router.get('/', getPermissions);

export default router; 