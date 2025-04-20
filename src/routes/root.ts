import express, { Request, Response } from "express";
import path from "path";
import authRoutes from "./authRoutes";
import searchRoutes from "./searchRoutes";
import transactionRoutes from "./transactionRoutes";

const router = express.Router();

// API routes
router.use('/api/auth', authRoutes);
router.use('/api', searchRoutes);
router.use('/api', transactionRoutes);

// Serve static files
router.get(["/", "/index", "/index.html"], (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "..", "views", "index.html"));
});

export default router;
