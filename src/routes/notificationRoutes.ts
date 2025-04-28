import express from 'express';
import { getUserNotifications, markNotificationAsRead, deleteNotification } from '../controllers/notificationController';
import verifyJWT from '../middlewares/verifyJWT';

const router = express.Router();

router.get('/:username', verifyJWT, getUserNotifications);
router.put('/read/:notificationId', verifyJWT, markNotificationAsRead);
router.delete('/delete/:notificationId', verifyJWT, deleteNotification);

export default router; 