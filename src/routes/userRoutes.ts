import express from 'express';
import { getUsers, createUser, getUserById, updateUser, deleteUser, updateUserPermissions } from '../controllers/userController';

const router = express.Router();

// Get users with role-based access
router.get('/', getUsers);

// Get single user by ID
router.get('/:id', getUserById);

// Create new user
router.post('/create', createUser);

// Update user
router.put('/:id', updateUser);

// Delete user
router.delete('/:id', deleteUser);

// Update user permissions
router.put('/:id/permissions', updateUserPermissions);

export default router; 