/**
 * Test Sales Report API - Check if data is being returned
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function testSalesAPI() {
  try {
    console.log('\n=== TESTING SALES REPORT API ===\n');

    // Step 1: Login
    console.log('1. Logging in...');
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@nursery.com',
      password: 'Admin@123456'
    });

    const token = loginRes.data.tokens?.accessToken || loginRes.data.token;
    console.log('✓ Login successful\n');

    // Step 2: Test sales report API
    console.log('2. Fetching sales report...');
    console.log('   Date range: 2025-07-01 to 2025-11-30');
    console.log('   Group by: day\n');

    const reportRes = await axios.get(`${BASE_URL}/api/reports/sales`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        start_date: '2025-07-01',
        end_date: '2025-11-30',
        group_by: 'day'
      }
    });

    console.log('✓ API Response received\n');
    console.log('Response structure:', Object.keys(reportRes.data));

    if (reportRes.data.success && reportRes.data.data) {
      const data = reportRes.data.data;
      console.log('\n=== REPORT DATA ===');
      console.log('KPIs:', data.kpis);
      console.log('Revenue Trend items:', data.revenueTrend?.length || 0);
      console.log('Top Products:', data.topProducts?.length || 0);
      console.log('Status Breakdown:', data.statusBreakdown?.length || 0);

      if (data.revenueTrend && data.revenueTrend.length > 0) {
        console.log('\n✓ REVENUE TREND HAS DATA!');
        console.log('Sample (first 3 items):');
        data.revenueTrend.slice(0, 3).forEach(item => {
          console.log(`  ${item.period}: ₹${item.revenue} (${item.orderCount} orders, ${item.paymentCount} payments)`);
        });
      } else {
        console.log('\n❌ REVENUE TREND IS EMPTY!');
      }

      if (data.topProducts && data.topProducts.length > 0) {
        console.log('\n✓ TOP PRODUCTS HAS DATA!');
        console.log('Top 3:');
        data.topProducts.slice(0, 3).forEach((p, i) => {
          console.log(`  ${i+1}. ${p.product_name}: ₹${p.total_revenue}`);
        });
      } else {
        console.log('\n❌ TOP PRODUCTS IS EMPTY!');
      }

    } else {
      console.log('\n❌ No data in response or success=false');
      console.log('Full response:', JSON.stringify(reportRes.data, null, 2));
    }

    console.log('\n=== DIAGNOSIS ===');
    if (data.revenueTrend?.length === 0) {
      console.log('⚠️  Revenue trend is empty. Possible causes:');
      console.log('   1. No payments with status="success" in date range');
      console.log('   2. Payment dates are outside the filter range');
      console.log('   3. Check payment_date column in payments table');
    } else {
      console.log('✓ Data is being returned correctly!');
      console.log('  If frontend charts still empty:');
      console.log('  1. Check browser console for errors');
      console.log('  2. Verify frontend date range matches');
      console.log('  3. Check network tab for API response');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
  }
}

testSalesAPI();
