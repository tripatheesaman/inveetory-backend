import pool from "../config/db"; 

export interface Permission {
  id: number;
  permission_name: number;
  allowed_ids: string; 
}

export const getPermissionsByUserId = async (userId: number): Promise<Permission[]> => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM user_permissions WHERE allowed_user_ids = ?',
      [userId]
    );
    return rows as Permission[];
  } catch (error) {
    console.error('Error fetching permissions:', error);
    throw new Error('Could not fetch permissions');
  }
};
