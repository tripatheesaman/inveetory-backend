import pool from '../src/config/db';
import bcrypt from 'bcryptjs';

async function seedSuperadminUser() {
  try {
    // Check if user already exists
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE username = ? OR staffid = ?',
      ['superadmin@nac.com.np', 'STAFF001']
    );
    if ((existing as any[]).length > 0) {
      console.log('Superadmin user already exists.');
      await pool.end();
      return;
    }

    // Find the superadmin role_id
    const [roles] = await pool.execute(
      'SELECT role_id FROM roles WHERE role_name = ?',
      ['superadmin']
    );
    const superAdminRoleId = (roles as any[])[0]?.role_id;
    if (!superAdminRoleId) {
      throw new Error('Superadmin role not found!');
    }

    // Hash the password
    const passwordHash = await bcrypt.hash('Testing@123', 10);

    // Insert the user
    await pool.execute(
      `INSERT INTO users 
        (username, password, role_id, first_name, last_name, staffid, designation, status, can_reset_password) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'superadmin@nac.com.np',
        passwordHash,
        superAdminRoleId,
        'Saman',
        'Tripathee',
        'STAFF001',
        'superadmin',
        'active',
        true
      ]
    );
    console.log('Superadmin user seeded successfully!');
    await pool.end();
  } catch (error) {
    console.error('Error seeding superadmin user:', error);
    await pool.end();
  }
}

seedSuperadminUser(); 