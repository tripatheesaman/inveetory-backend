import pool from "../config/db"; 

export interface Permission {
  id: number;
  permission_name: string;
  allowed_ids: string; 
}

export const getPermissionsByUserId = async (userId: number): Promise<string[]> => {
  try {
    const [rows] = await pool.execute(
      `SELECT permission_name 
       FROM user_permissions 
       WHERE FIND_IN_SET(?, allowed_user_ids) > 0 
       OR allowed_user_ids = ?`,
      [userId.toString(), userId.toString()]
    );
    return (rows as Permission[]).map(row => row.permission_name);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    throw new Error('Could not fetch permissions');
  }
};
