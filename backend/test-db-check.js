const pool = require('./utils/db');

async function checkTables() {
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name LIKE '%vehicle%'
          OR table_name LIKE '%route%'
          OR table_name LIKE '%delivery%'
          OR table_name LIKE '%gps%'
          OR table_name LIKE '%driver%')
      ORDER BY table_name
    `);

    console.log('\n=== Phase 8 Tables ===');
    result.rows.forEach(row => {
      console.log(`✓ ${row.table_name}`);
    });
    console.log(`\nTotal: ${result.rows.length} tables\n`);

    await pool.closePool();
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkTables();
