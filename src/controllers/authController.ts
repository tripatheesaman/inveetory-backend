import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { findUserByEmail } from "../models/User";
import { getPermissionsByUserId } from "../models/Permissions";

export const login = async (req: Request, res: Response): Promise<void> => {
  const { username:email, password } = req.body;
  const user = await findUserByEmail(email);
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }
  const permissions = getPermissionsByUserId(user.id)

  const accessToken = jwt.sign(
    {
      UserInfo: {
        username: user.username,
        role: user.role,
        permissions: permissions
      },
    },
    process.env.ACCESS_TOKEN_SECRET as string,
    { expiresIn: "15m" }
  );

  const refreshToken = jwt.sign(
    {
      username: user.username,
    },
    process.env.REFRESH_TOKEN_SECRET as string,
    { expiresIn: "1d" }
  );
  console.log("reached")
  res.cookie("jwt", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ accessToken });
};
