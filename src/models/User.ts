import { RowDataPacket } from "mysql2";
import pool from "../config/db";
export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  password: string;
  permissions: string;
  role: "superadmin" | "admin" | "manager" | "entrant" | "custom";
}

export const findUserByEmail = async (email: string): Promise<User | null> => {

  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM users WHERE username = ?", [
    email,
  ]);
  const user = (rows as User[])[0];
  return user || null;
};
