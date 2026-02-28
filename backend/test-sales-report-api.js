/**
 * Test Sales Report API
 * Check if the API is returning data correctly
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function testReportAPI() {
  try {
    console.log('\n=== TESTING SALES REPORT API ===\n');

    // Step 1: Login to get token
    console.log('1. Logging in...');
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@nursery.com',
      password: 'admin123'
    });

    const token = loginRes.data.token || loginRes.data.accessToken;
    console.log('✓ Login successful, token obtained');

    // Step 2: Call sales report API
    console.log('\n2. Fetching sales report (Last 30 days)...');
    const reportRes = await axios.get(`${BASE_URL}/api/reports/sales`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        group_by: 'day'
      }
    });

    console.log('\n✓ Report API Response:');
    console.log('Status:', reportRes.status);
    console.log('Data structure:', Object.keys(reportRes.data));

    if (reportRes.data.data) {
      const data = reportRes.data.data;
      console.log('\nReport Data:');
      console.log('  KPIs:', data.kpis);
      console.log('  Revenue Trend items:', data.revenueTrend?.length || 0);
      console.log('  Top Products:', data.topProducts?.length || 0);
      console.log('  Status Breakdown:', data.statusBreakdown?.length || 0);

      if (data.revenueTrend && data.revenueTrend.length > 0) {
        console.log('\n  Sample Revenue Trend (first 3):');
        data.revenueTrend.slice(0, 3).forEach(item => {
          console.log(`    ${item.period}: ₹${item.revenue} (${item.orderCount} orders)`);
        });
      } else {
        console.log('\n  ⚠️  Revenue Trend is EMPTY');
      }

      if (data.topProducts && data.topProducts.length > 0) {
        console.log('\n  Top 3 Products:');
        data.topProducts.slice(0, 3).forEach((p, i) => {
          console.log(`    ${i+1}. ${p.product_name}: ₹${p.total_revenue}`);
        });
      } else {
        console.log('\n  ⚠️  Top Products is EMPTY');
      }
    }

    console.log('\n=== DIAGNOSIS ===');
    if (!reportRes.data.data) {
      console.log('❌ No data in response - check API implementation');
    } else if (!reportRes.data.data.revenueTrend || reportRes.data.data.revenueTrend.length === 0) {
      console.log('⚠️  Revenue trend is empty - possible causes:');
      console.log('   1. No payments in the selected date range');
      console.log('   2. All payments have status != "success"');
      console.log('   3. Payments have payment_date outside the range');
      console.log('\n   Solution: Check payment dates and status in database');
    } else {
      console.log('✓ Data is being returned correctly!');
      console.log('  If charts are still empty in frontend:');
      console.log('  1. Check browser console for errors');
      console.log('  2. Verify frontend is calling the correct endpoint');
      console.log('  3. Check date range filter in frontend (default is last 7 days)');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
  }
}

testReportAPI();
