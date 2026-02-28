/**
 * Script to check if Phase 22 tables exist in the database
 * Run with: node check-phase22-tables.js
 */

require('dotenv').config();
const pool = require('./config/database');

async function checkTables() {
  try {
    console.log('🔍 Checking Phase 22 database tables...\n');

    // Check if tables exist
    const tablesQuery = `
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND (tablename LIKE 'seed%' OR tablename LIKE 'vendor%')
      ORDER BY tablename;
    `;

    const result = await pool.query(tablesQuery);

    if (result.rows.length === 0) {
      console.log('❌ No Phase 22 tables found!');
      console.log('\n📋 Expected tables:');
      console.log('   - vendors');
      console.log('   - seed_purchases');
      console.log('   - seed_purchase_payments');
      console.log('   - seed_usage_history');
      console.log('\n💡 To create these tables, run:');
      console.log('   npm run migrate:up\n');
      process.exit(1);
    }

    console.log(`✅ Found ${result.rows.length} Phase 22 tables:\n`);
    result.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.tablename}`);
    });

    // Check if vendors table has data
    console.log('\n📊 Checking data...\n');

    try {
      const vendorCount = await pool.query(
        'SELECT COUNT(*) FROM vendors WHERE deleted_at IS NULL'
      );
      console.log(`   Vendors: ${vendorCount.rows[0].count}`);
    } catch (e) {
      console.log(`   Vendors: Error - ${e.message}`);
    }

    try {
      const purchaseCount = await pool.query(
        'SELECT COUNT(*) FROM seed_purchases WHERE deleted_at IS NULL'
      );
      console.log(`   Seed Purchases: ${purchaseCount.rows[0].count}`);
    } catch (e) {
      console.log(`   Seed Purchases: Error - ${e.message}`);
    }

    // Check recent migrations
    console.log('\n📜 Recent migrations:\n');
    try {
      const migrationsResult = await pool.query(`
        SELECT id, name, run_on
        FROM pgmigrations
        WHERE name LIKE '%vendor%' OR name LIKE '%seed%'
        ORDER BY id DESC
        LIMIT 10
      `);

      if (migrationsResult.rows.length === 0) {
        console.log('   ⚠️  No Phase 22 migrations found in pgmigrations table');
        console.log('   💡 Run: npm run migrate:up');
      } else {
        migrationsResult.rows.forEach((row) => {
          const date = new Date(row.run_on).toLocaleString();
          console.log(`   ✓ ${row.name} (${date})`);
        });
      }
    } catch (e) {
      console.log(`   Error checking migrations: ${e.message}`);
    }

    console.log('\n✅ Database check complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

checkTables();
