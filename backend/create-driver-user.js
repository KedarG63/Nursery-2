require('dotenv').config();
const pool = require('./utils/db');
const bcrypt = require('bcrypt');

async function createDriverUser() {
  try {
    // Create password hash
    const passwordHash = await bcrypt.hash('driver123', 10);

    // Create driver user
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, full_name, phone, status)
      VALUES ('rajesh.driver@nursery.com', $1, 'Rajesh Kumar', '+919876543210', 'active')
      ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
      RETURNING id, email, full_name
    `, [passwordHash]);

    console.log('\n=== Driver User Created ===');
    console.log(`Name: ${userResult.rows[0].full_name}`);
    console.log(`Email: ${userResult.rows[0].email}`);
    console.log(`ID: ${userResult.rows[0].id}`);
    console.log(`Password: driver123\n`);

    // Check if roles table is used (instead of user role field)
    const roleCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'roles'
      ) as has_roles_table
    `);

    if (roleCheck.rows[0].has_roles_table) {
      // Check for Delivery role
      const deliveryRole = await pool.query(`
        SELECT id FROM roles WHERE name = 'Delivery' LIMIT 1
      `);

      if (deliveryRole.rows.length > 0) {
        // Assign role to user
        await pool.query(`
          INSERT INTO user_roles (user_id, role_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [userResult.rows[0].id, deliveryRole.rows[0].id]);
        console.log('✓ Assigned Delivery role to user\n');
      } else {
        console.log('⚠ Delivery role not found - you may need to create it first\n');
      }
    }

    await pool.closePool();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.closePool();
    process.exit(1);
  }
}

createDriverUser();
