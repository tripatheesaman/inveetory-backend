import pool from '../src/config/db';

const permissions = [
  { permission_name: 'can_view_dashboard', permission_readable: 'Access The dashboard', permission_type: 'dashboard' },

  { permission_name: 'can_issue_items', permission_readable: 'Issue Inventory', permission_type: 'issue' },
  { permission_name: 'can_approve_issues', permission_readable: 'Can Approve issue', permission_type: 'issue' },

  { permission_name: 'can_print', permission_readable: 'Can Print', permission_type: 'print' },
  { permission_name: 'can_print_request', permission_readable: 'Can Print request', permission_type: 'print' },
  { permission_name: 'can_print_rrp', permission_readable: 'Can Print rrp', permission_type: 'print' },

  { permission_name: 'can_receive_items', permission_readable: 'Can Receive', permission_type: 'receive' },
  { permission_name: 'can_approve_receive', permission_readable: 'Can Approve receive', permission_type: 'receive' },

  { permission_name: 'can_request_items', permission_readable: 'Can Request', permission_type: 'request' },
  { permission_name: 'can_approve_request', permission_readable: 'Can Approve request', permission_type: 'request' },

  { permission_name: 'can_create_rrp', permission_readable: 'Can Create rrp', permission_type: 'rrp' },
  { permission_name: 'can_approve_rrp', permission_readable: 'Can Approve rrp', permission_type: 'rrp' },

  { permission_name: 'can_search_items', permission_readable: 'Search Inventory', permission_type: 'search' },
  { permission_name: 'can_view_full_item_details_in_search', permission_readable: 'Can See Find search', permission_type: 'search' },

  { permission_name: 'can_manage_users', permission_readable: 'Access Users', permission_type: 'user' },
  { permission_name: 'can_create_users', permission_readable: 'Can Create user', permission_type: 'user' },
  { permission_name: 'can_edit_users', permission_readable: 'Can Edit User', permission_type: 'user' },
  { permission_name: 'can_delete_users', permission_readable: 'Can Delete user', permission_type: 'user' },
  { permission_name: 'can_read_users', permission_readable: 'Can See User', permission_type: 'user' },
  { permission_name: 'can_manage_user_permissions', permission_readable: 'Can Manage user', permission_type: 'user' },

  { permission_name: 'can_access_report', permission_readable: 'Can Access report', permission_type: 'report' },
  { permission_name: 'can_generate_daily_issue_reports', permission_readable: 'Can Generate report', permission_type: 'report' },
  { permission_name: 'can_generate_stock_card', permission_readable: 'Can Generate report', permission_type: 'report' },

  { permission_name: 'can_access_settings', permission_readable: 'Can Access settings', permission_type: 'settings' },
  { permission_name: 'can_access_request_settings', permission_readable: 'Can Access settings', permission_type: 'settings' },
  { permission_name: 'can_access_receive_settings', permission_readable: 'Can Access settings', permission_type: 'settings' },
  { permission_name: 'can_access_issue_settings', permission_readable: 'Can Access settings', permission_type: 'settings' },
  { permission_name: 'can_access_rrp_settings', permission_readable: 'Can Access settings', permission_type: 'settings' },
  { permission_name: 'can_change_fy', permission_readable: 'Can Change settings', permission_type: 'settings' },
  { permission_name: 'can_edit_request_authority_details', permission_readable: 'Can Edit R settings', permission_type: 'settings' },
  { permission_name: 'can_edit_rrp_authority_details', permission_readable: 'Can Edit R settings', permission_type: 'settings' },

  { permission_name: 'can_access_fuel_menu', permission_readable: 'Can Access fuel', permission_type: 'fuel' },
  { permission_name: 'can_receive_petrol', permission_readable: 'Can Receive fuel', permission_type: 'fuel' },
  { permission_name: 'can_issue_fuel', permission_readable: 'Can Issue fuel', permission_type: 'fuel' },
];


async function seedPermissions() {
  try {
    // Get the superadmin user's id
    const [users] = await pool.execute('SELECT id FROM users WHERE username = ?', ['superadmin@nac.com.np']);
    const superadminId = (users as any[])[0]?.id;
    if (!superadminId) {
      throw new Error('Superadmin user not found!');
    }

    for (const perm of permissions) {
      await pool.execute(
        `INSERT INTO user_permissions (permission_name, permission_readable, permission_type, allowed_user_ids) VALUES (?, ?, ?, ?)`,
        [perm.permission_name, perm.permission_readable, perm.permission_type, String(superadminId)]
      );
    }
    console.log('Permissions seeded successfully!');
    await pool.end();
  } catch (error) {
    console.error('Error seeding permissions:', error);
    await pool.end();
  }
}

seedPermissions(); 