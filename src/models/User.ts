import { RowDataPacket } from "mysql2";
import pool from "../config/db";
import { logEvents } from "../middlewares/logger";

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  password: string;
  permissions: string;
  role_id: number;
  role: "superadmin" | "admin" | "manager" | "entrant" | "custom";
}

export const findUserByEmail = async (email: string): Promise<User | null> => {
  try {
    logEvents(`Searching for user with email: ${email}`, "userModelLog.log");

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.password, u.role_id, r.role_name as role 
       FROM users u 
       JOIN roles r ON u.role_id = r.role_id 
       WHERE u.username = ?`, 
      [email]
    );

  const user = (rows as User[])[0];

    if (user) {
      logEvents(`Found user with email: ${email}`, "userModelLog.log");
    } else {
      logEvents(`No user found with email: ${email}`, "userModelLog.log");
    }

  return user || null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error finding user with email ${email}: ${errorMessage}`, "userModelLog.log");
    throw new Error(`Failed to find user: ${errorMessage}`);
  }
};
