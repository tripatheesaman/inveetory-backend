import express from 'express';
import { getUsers, createUser } from '../controllers/userController';

const router = express.Router();

// Get users with role-based access
router.get('/', getUsers);

// Create new user
router.post('/create', createUser);

export default router; 