import pool from "../config/db";
import { logEvents } from "../middlewares/logger";

export interface Permission {
  id: number;
  permission_name: string;
  allowed_ids: string;
}

export const getPermissionsByUserId = async (userId: number): Promise<string[]> => {
  try {
    logEvents(`Fetching permissions for user ID: ${userId}`, "permissionsLog.log");

    const [rows] = await pool.execute(
      `SELECT permission_name 
       FROM user_permissions 
       WHERE FIND_IN_SET(?, allowed_user_ids) > 0 
       OR allowed_user_ids = ?`,
      [userId.toString(), userId.toString()]
    );

    const permissions = (rows as Permission[]).map(row => row.permission_name);
    
    logEvents(`Successfully fetched ${permissions.length} permissions for user ID: ${userId}`, "permissionsLog.log");
    return permissions;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logEvents(`Error fetching permissions for user ID ${userId}: ${errorMessage}`, "permissionsLog.log");
    throw new Error(`Failed to fetch permissions: ${errorMessage}`);
  }
};
