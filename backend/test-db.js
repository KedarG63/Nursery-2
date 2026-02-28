const pool = require('./config/database');

async function testTables() {
  try {
    // Check if vendors table exists
    const vendorsCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'vendors'
      );
    `);
    console.log('Vendors table exists:', vendorsCheck.rows[0].exists);

    // Check if seed_purchases table exists
    const seedPurchasesCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'seed_purchases'
      );
    `);
    console.log('Seed_purchases table exists:', seedPurchasesCheck.rows[0].exists);

    // Check lots table structure
    const lotsColumns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'lots'
      AND column_name LIKE '%seed%'
      ORDER BY ordinal_position;
    `);
    console.log('\nLots table seed-related columns:');
    lotsColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

    // Try the actual query
    console.log('\nTesting actual lots query...');
    const result = await pool.query(`
      SELECT
        l.*,
        s.sku_code,
        s.product_id,
        p.name as product_name,
        sp.seed_lot_number,
        v.vendor_name as seed_vendor_name,
        sp.expiry_date as seed_expiry_date,
        sp.purchase_date as seed_purchase_date
       FROM lots l
       JOIN skus s ON l.sku_id = s.id
       JOIN products p ON s.product_id = p.id
       LEFT JOIN seed_purchases sp ON l.seed_purchase_id = sp.id AND sp.deleted_at IS NULL
       LEFT JOIN vendors v ON sp.vendor_id = v.id AND v.deleted_at IS NULL
       WHERE l.deleted_at IS NULL
       LIMIT 1
    `);
    console.log('Query successful! Rows returned:', result.rows.length);
    if (result.rows.length > 0) {
      console.log('Sample row:', JSON.stringify(result.rows[0], null, 2));
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

testTables();
