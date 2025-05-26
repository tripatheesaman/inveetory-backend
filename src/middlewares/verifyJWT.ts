import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload, TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { logEvents } from './logger';
import { User } from '../models/User';

interface DecodedUser extends JwtPayload {
  UserInfo: {
    username: string;
    name: string;
    role: User['role'];
    id: number;
    permissions: string[];
    iat?: number;
    exp?: number;
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: string;
      role?: User['role'];
      userId?: number;
      tokenExpiry?: number;
    }
  }
}

const verifyJWT = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
  const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      logEvents(`JWT verification failed - Invalid authorization header format`, "authLog.log");
      res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid authorization header format'
      });
    return;
  }

  const token = authHeader.split(' ')[1];

    if (!token) {
      logEvents(`JWT verification failed - No token provided`, "authLog.log");
      res.status(401).json({ 
        error: 'Unauthorized',
        message: 'No token provided'
      });
      return;
    }

    if (!process.env.ACCESS_TOKEN_SECRET) {
      logEvents(`JWT verification failed - ACCESS_TOKEN_SECRET not configured`, "authLog.log");
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Server configuration error'
      });
      return;
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
        if (err instanceof TokenExpiredError) {
          logEvents(`JWT verification failed - Token expired for token: ${token.substring(0, 10)}...`, "authLog.log");
          res.status(401).json({ 
            error: 'Unauthorized',
            message: 'Token has expired',
            code: 'TOKEN_EXPIRED'
          });
          return;
        }

        if (err instanceof JsonWebTokenError) {
          logEvents(`JWT verification failed - Invalid token: ${token.substring(0, 10)}...`, "authLog.log");
          res.status(403).json({ 
            error: 'Forbidden',
            message: 'Invalid token',
            code: 'INVALID_TOKEN'
          });
          return;
        }

        logEvents(`JWT verification failed - Unknown error`, "authLog.log");
        res.status(403).json({ 
          error: 'Forbidden',
          message: 'Token verification failed',
          code: 'VERIFICATION_FAILED'
        });
      return;
    }

    const decodedUser = decoded as DecodedUser;

      if (!decodedUser.UserInfo || !decodedUser.UserInfo.username || !decodedUser.UserInfo.role || !decodedUser.UserInfo.id) {
        logEvents(`JWT verification failed - Invalid token payload for token: ${token.substring(0, 10)}...`, "authLog.log");
        res.status(403).json({ 
          error: 'Forbidden',
          message: 'Invalid token payload',
          code: 'INVALID_PAYLOAD'
        });
        return;
      }

    req.user = decodedUser.UserInfo.username;
    req.role = decodedUser.UserInfo.role;
      req.userId = decodedUser.UserInfo.id;
      req.tokenExpiry = decodedUser.exp;

      logEvents(`JWT verification successful for user: ${decodedUser.UserInfo.username}`, "authLog.log");

    next();
  });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`JWT verification error: ${errorMessage}`, "authLog.log");
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'An error occurred during token verification',
      code: 'VERIFICATION_ERROR'
    });
  }
};

export default verifyJWT;
