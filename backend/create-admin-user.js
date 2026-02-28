require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./utils/db');

async function createAdminUser() {
  try {
    console.log('\n=== Creating Admin User ===\n');

    // Admin user details
    const email = 'admin@nursery.com';
    const password = 'Admin@123456';
    const fullName = 'System Administrator';
    const phone = '+919999999999';

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      console.log('❌ Admin user already exists!');
      console.log(`   Email: ${email}`);
      console.log('\n💡 If you forgot the password, you can reset it manually in the database.\n');
      await pool.closePool();
      return;
    }

    // Hash the password
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user
    console.log('👤 Creating admin user...');
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, email, full_name`,
      [email, hashedPassword, fullName, phone]
    );

    const userId = userResult.rows[0].id;
    console.log('   ✓ User created:', userResult.rows[0].full_name);

    // Get Admin role ID
    console.log('🔑 Assigning Admin role...');
    const roleResult = await pool.query(
      "SELECT id FROM roles WHERE name = 'Admin'"
    );

    if (roleResult.rows.length === 0) {
      console.log('   ❌ Admin role not found! Run migrations first.');
      await pool.closePool();
      return;
    }

    const adminRoleId = roleResult.rows[0].id;

    // Assign Admin role to user
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)`,
      [userId, adminRoleId]
    );
    console.log('   ✓ Admin role assigned');

    console.log('\n✅ Admin user created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   📧 Email:    ${email}`);
    console.log(`   🔑 Password: ${password}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 You can now login at: http://localhost:5173\n');
    console.log('⚠️  IMPORTANT: Change this password after first login!\n');

    await pool.closePool();
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    await pool.closePool();
    process.exit(1);
  }
}

createAdminUser();
