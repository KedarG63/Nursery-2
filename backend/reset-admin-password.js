require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./utils/db');

async function resetPassword() {
  const newPassword = process.argv[2] || 'Admin@123456';
  const email = process.argv[3] || 'admin@nursery.com';

  try {
    console.log('\n🔐 Resetting password...\n');

    // Hash the new password
    const hash = await bcrypt.hash(newPassword, 10);

    // Update the password
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING email, full_name',
      [hash, email]
    );

    if (result.rows.length > 0) {
      console.log('✅ Password reset successfully!\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔐 Login Credentials:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`   👤 Name:     ${result.rows[0].full_name}`);
      console.log(`   📧 Email:    ${result.rows[0].email}`);
      console.log(`   🔑 Password: ${newPassword}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n💡 Login at: http://localhost:5173\n');
      console.log('⚠️  Change this password after first login!\n');
    } else {
      console.log(`❌ User with email "${email}" not found\n`);
      console.log('💡 Available users:');
      const users = await pool.query('SELECT email, full_name FROM users LIMIT 5');
      users.rows.forEach(u => {
        console.log(`   - ${u.email} (${u.full_name})`);
      });
      console.log();
    }

    await pool.closePool();
  } catch (error) {
    console.error('❌ Error resetting password:', error.message);
    await pool.closePool();
    process.exit(1);
  }
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node reset-admin-password.js [password] [email]

Examples:
  node reset-admin-password.js
    → Resets admin@nursery.com password to "Admin@123456"

  node reset-admin-password.js "MyNewPassword123!"
    → Resets admin@nursery.com password to "MyNewPassword123!"

  node reset-admin-password.js "MyPassword!" "user@example.com"
    → Resets user@example.com password to "MyPassword!"

Options:
  --help, -h    Show this help message
  `);
  process.exit(0);
}

resetPassword();
