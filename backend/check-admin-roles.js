require('dotenv').config();
const pool = require('./utils/db');

async function checkAdminRoles() {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.full_name,
        array_agg(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.email = 'admin@nursery.com'
      GROUP BY u.id, u.email, u.full_name
    `);

    console.log('\n=== Admin User Roles ===\n');
    console.log(JSON.stringify(result.rows[0], null, 2));
    console.log('\n');

    await pool.closePool();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.closePool();
    process.exit(1);
  }
}

checkAdminRoles();
