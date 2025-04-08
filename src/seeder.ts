import pool from './config/db'
const bcrypt = require('bcryptjs');


async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10); // Generate a salt with 10 rounds
  return bcrypt.hash(password, salt);    // Hash the password
}

// Function to seed the roles and superadmin user
async function seedDatabase(): Promise<void> {
  try {
    // Insert roles into the roles table
    const roles = [
      { name: 'superadmin', role_permissions: '1,2,3,4,5', heirarchy: 0 },  
      { name: 'admin', role_permissions: '', heirarchy: 1 },             
      { name: 'manager', role_permissions: '', heirarchy: 2 },                 
      { name: 'entrant', role_permissions: '', heirarchy: 3 },                   
      { name: 'custom', role_permissions: '', heirarchy: 4 },                  
    ];

    // Insert each role into the database
    for (const role of roles) {
      await pool.execute(
        'INSERT INTO roles (role_name, permission_id, heirarchy) VALUES (?, ?, ?)',
        [role.name, role.role_permissions, role.heirarchy]
      );
      console.log(`Inserted role: ${role.name}`);
    }

    // Create a superadmin user (this example uses a hashed password)
    const passwordHash = await hashPassword('Testing@123'); // Superadmin password

    // Find the Super Admin role id
    const [rows] = await pool.execute('SELECT role_id FROM roles WHERE role_name = ?', ['superadmin']);
    const superAdminRoleId = (rows as any)[0]?.role_id;

    if (!superAdminRoleId) {
      throw new Error('Super Admin role not found!');
    }

    // Insert the superadmin user into the database
    await pool.execute(
      'INSERT INTO users (username, password, role_id, first_name, last_name, staffid, designation, status, can_reset_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['superadmin', passwordHash, superAdminRoleId, 'Saman', 'Tripathee', 'STAFF001', 'God', true, true]
    );
    console.log('Superadmin user created successfully!');

    // Close the connection pool after seeding
    await pool.end();
  } catch (error) {
    console.error('Error seeding database:', error);
    await pool.end(); // Close the connection pool in case of an error
  }
}

// Run the seeding process
seedDatabase();
