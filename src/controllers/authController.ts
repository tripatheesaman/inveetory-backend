import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { findUserByEmail, User } from "../models/User";
import { getPermissionsByUserId } from "../models/Permissions";
import { logEvents } from "../middlewares/logger";
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';

interface UserInfo {
  username: string;
  name: string;
  role: User['role'];
  id: number;
  permissions: string[];
}

interface JwtPayload {
  UserInfo: UserInfo;
}

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username: email, password } = req.body;

    if (!email || !password) {
      logEvents(`Login attempt failed - Missing credentials`, "authLog.log");
      res.status(400).json({ 
        error: 'Bad Request',
        message: "Email and password are required" 
      });
      return;
    }

  const user = await findUserByEmail(email);
  if (!user) {
      logEvents(`Login attempt failed - User not found: ${email}`, "authLog.log");
      res.status(404).json({ 
        error: 'Not Found',
        message: "User not found" 
      });
    return;
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
      logEvents(`Login attempt failed - Invalid credentials for user: ${email}`, "authLog.log");
      res.status(401).json({ 
        error: 'Unauthorized',
        message: "Invalid credentials" 
      });
    return;
  }

    const permissions = await getPermissionsByUserId(user.id);
    const userInfo: UserInfo = {
      username: user.username,
      name: user.first_name + " " + user.last_name,
      role: user.role,
      id: user.id,
      permissions: permissions
    };

  const accessToken = jwt.sign(
      { UserInfo: userInfo },
      process.env.ACCESS_TOKEN_SECRET as string,
      { expiresIn: "7h" }
    );

    logEvents(`User logged in successfully: ${email}`, "authLog.log");
    res.json({ 
      accessToken,
      user: {
        username: user.username,
        name: user.first_name + " " + user.last_name,
        role: user.role,
        permissions: permissions
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Login error: ${errorMessage}`, "authLog.log");
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: "An error occurred during login" 
    });
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      logEvents(`Token refresh failed - No authorization header`, "authLog.log");
      res.status(401).json({ 
        error: 'Unauthorized',
        message: "No authorization header" 
      });
    return;
  }

    const token = authHeader.split(' ')[1];
    let decoded: JwtPayload;
    
    try {
      decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string) as JwtPayload;
    } catch (error) {
      logEvents(`Token refresh failed - Invalid token: ${error instanceof Error ? error.message : 'Unknown error'}`, "authLog.log");
      res.status(403).json({ 
        error: 'Forbidden',
        message: "Invalid token" 
      });
      return;
    }

    if (!decoded.UserInfo || !decoded.UserInfo.username) {
      logEvents(`Token refresh failed - Invalid token payload`, "authLog.log");
      res.status(403).json({ 
        error: 'Forbidden',
        message: "Invalid token payload" 
      });
      return;
    }

    const user = await findUserByEmail(decoded.UserInfo.username);
    
    if (!user) {
      logEvents(`Token refresh failed - User not found: ${decoded.UserInfo.username}`, "authLog.log");
      res.status(404).json({ 
        error: 'Not Found',
        message: "User not found" 
      });
      return;
    }

    const permissions = await getPermissionsByUserId(user.id);
    const userInfo: UserInfo = {
      username: user.username,
      name: user.first_name + " " + user.last_name,
      role: user.role,
      id: user.id,
      permissions: permissions
    };

    const newAccessToken = jwt.sign(
      { UserInfo: userInfo },
      process.env.ACCESS_TOKEN_SECRET as string,
      { expiresIn: "7h" }
    );

    logEvents(`Token refreshed successfully for user: ${user.username}`, "authLog.log");
    res.json({ 
      accessToken: newAccessToken,
      user: {
        username: user.username,
        name: user.first_name + " " + user.last_name,
        role: user.role,
        permissions: permissions
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Token refresh error: ${errorMessage}`, "authLog.log");
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: "An error occurred during token refresh" 
    });
  }
};

export const checkResetEligibility = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Email is required'
    });
    return;
  }

  try {
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT can_reset_password FROM users WHERE username = ?',
      [email]
    );

    if (users.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
      return;
    }

    const canReset = users[0].can_reset_password === 1;

    res.status(200).json({
      canReset
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error checking reset eligibility: ${errorMessage}`, "authLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Email and new password are required'
    });
    return;
  }

  try {
    // First check if user exists and is eligible for password reset
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT id, can_reset_password FROM users WHERE username = ?',
      [email]
    );

    if (users.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
      return;
    }

    if (users[0].can_reset_password !== 1) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'User is not eligible for password reset'
      });
      return;
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the password and reset the can_reset_password flag
    await pool.execute(
      `UPDATE users 
       SET password = ?, 
           can_reset_password = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE username = ?`,
      [hashedPassword, email]
    );

    logEvents(`Password reset successful for user: ${email}`, "authLog.log");
    res.status(200).json({
      message: 'Password reset successful'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error resetting password: ${errorMessage}`, "authLog.log");
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage
    });
  }
};
