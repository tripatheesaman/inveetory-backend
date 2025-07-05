import pool from '../src/config/db';

async function updateRolePermissions() {
  try {
    // Get all permission ids
    const [permissions] = await pool.execute('SELECT id FROM user_permissions ORDER BY id ASC');
    const ids = (permissions as any[]).map(p => p.id);

    // Prepare permission id strings for each role
    const superadminPerms = ids.join(',');
    const adminPerms = ids.slice(0, 7).join(',');
    const managerPerms = ids.slice(0, 5).join(',');
    const entrantPerms = ids.slice(0, 3).join(',');
    const customPerms = '';

    // Update each role
    await pool.execute('UPDATE roles SET permission_id = ? WHERE role_name = ?', [superadminPerms, 'superadmin']);
    await pool.execute('UPDATE roles SET permission_id = ? WHERE role_name = ?', [adminPerms, 'admin']);
    await pool.execute('UPDATE roles SET permission_id = ? WHERE role_name = ?', [managerPerms, 'manager']);
    await pool.execute('UPDATE roles SET permission_id = ? WHERE role_name = ?', [entrantPerms, 'entrant']);
    await pool.execute('UPDATE roles SET permission_id = ? WHERE role_name = ?', [customPerms, 'custom']);

    console.log('Role permissions updated successfully!');
    await pool.end();
  } catch (error) {
    console.error('Error updating role permissions:', error);
    await pool.end();
  }
}

updateRolePermissions(); 