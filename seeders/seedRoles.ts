import pool from '../src/config/db';

const roles = [
  { role_name: 'superadmin', heirarchy: 0 },
  { role_name: 'admin', heirarchy: 1 },
  { role_name: 'manager', heirarchy: 2 },
  { role_name: 'entrant', heirarchy: 3 },
  { role_name: 'custom', heirarchy: 4 },
];

async function seedRoles() {
  try {
    // Insert roles with empty permission_id
    for (const role of roles) {
      await pool.execute(
        'INSERT INTO roles (role_name, permission_id, heirarchy) VALUES (?, ?, ?)',
        [role.role_name, '', role.heirarchy]
      );
    }
    console.log('Roles seeded successfully!');
    await pool.end();
  } catch (error) {
    console.error('Error seeding roles:', error);
    await pool.end();
  }
}

seedRoles(); 