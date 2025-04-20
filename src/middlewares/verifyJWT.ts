import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

interface DecodedUser extends JwtPayload {
  UserInfo: {
    username: string;
    role: string;
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: string;
      role?: string;
    }
  }
}

const verifyJWT = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string, (err, decoded) => {
    if (err) {
      res.status(403).json({ message: 'Forbidden!' });
      return;
    }

    const decodedUser = decoded as DecodedUser;

    req.user = decodedUser.UserInfo.username;
    req.role = decodedUser.UserInfo.role;

    next();
  });
};

export default verifyJWT;
