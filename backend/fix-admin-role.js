require('dotenv').config();
const pool = require('./utils/db');

async function fixAdminRole() {
  try {
    console.log('\n=== Fixing Admin User Role ===\n');

    // Get admin user ID
    const userResult = await pool.query(
      "SELECT id FROM users WHERE email = 'admin@nursery.com'"
    );

    if (userResult.rows.length === 0) {
      console.log('❌ Admin user not found!');
      await pool.closePool();
      return;
    }

    const userId = userResult.rows[0].id;

    // Get Admin role ID
    const roleResult = await pool.query(
      "SELECT id FROM roles WHERE name = 'Admin'"
    );

    if (roleResult.rows.length === 0) {
      console.log('❌ Admin role not found!');
      await pool.closePool();
      return;
    }

    const adminRoleId = roleResult.rows[0].id;

    // Check if user already has Admin role
    const existingRole = await pool.query(
      'SELECT * FROM user_roles WHERE user_id = $1 AND role_id = $2',
      [userId, adminRoleId]
    );

    if (existingRole.rows.length > 0) {
      console.log('✅ User already has Admin role');
    } else {
      // Add Admin role
      await pool.query(
        'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
        [userId, adminRoleId]
      );
      console.log('✅ Admin role added successfully');
    }

    // Show updated roles
    const updatedRoles = await pool.query(`
      SELECT array_agg(r.name) as roles
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
    `, [userId]);

    console.log('\nUpdated roles:', updatedRoles.rows[0].roles);
    console.log();

    await pool.closePool();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.closePool();
    process.exit(1);
  }
}

fixAdminRole();
