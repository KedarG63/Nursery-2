/**
 * Invoice Service — HTML invoice template generation
 * Phase 23: Billing & Accounting
 */

const formatCurrency = (amount) => {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(num);
};

const formatDate = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Generate printable HTML for an invoice.
 *
 * @param {Object} invoice  - Invoice record with totals and status
 * @param {Array}  items    - invoice_items rows (with sku_code if available)
 * @param {Object} customer - Customer record
 * @param {Object|null} order - Linked order record (may be null)
 * @returns {string} Full HTML document
 */
const generateInvoiceHTML = (invoice, items, customer, order) => {
  const statusWatermark = ['paid', 'void'].includes(invoice.status)
    ? `<div class="watermark">${invoice.status.toUpperCase()}</div>`
    : '';

  const itemRows = items
    .map(
      (item, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td>${item.description || ''}${item.sku_code ? `<br><small class="muted">${item.sku_code}</small>` : ''}</td>
        <td class="center">${item.quantity}</td>
        <td class="right">${formatCurrency(item.unit_price)}</td>
        <td class="right">${item.discount_amount > 0 ? formatCurrency(item.discount_amount) : '—'}</td>
        <td class="right">${formatCurrency(item.line_total)}</td>
        <td class="center">${parseFloat(item.tax_rate) > 0 ? `${item.tax_rate}%` : '—'}</td>
        <td class="right">${parseFloat(item.tax_amount) > 0 ? formatCurrency(item.tax_amount) : '—'}</td>
      </tr>
    `
    )
    .join('');

  const customerAddress = [
    customer.address_line1,
    customer.address_line2,
    customer.landmark,
    [customer.city, customer.state, customer.pincode].filter(Boolean).join(', '),
    customer.country,
  ]
    .filter(Boolean)
    .join('<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #333; padding: 20px; }
    .invoice-container { max-width: 800px; margin: 0 auto; position: relative; }
    .watermark {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 96px; font-weight: bold; color: rgba(0,0,0,0.06); pointer-events: none;
      z-index: 0; text-transform: uppercase; letter-spacing: 10px;
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #2e7d32; padding-bottom: 16px; }
    .company-name { font-size: 22px; font-weight: bold; color: #2e7d32; }
    .company-sub { font-size: 11px; color: #666; margin-top: 4px; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 28px; color: #2e7d32; text-transform: uppercase; letter-spacing: 2px; }
    .invoice-title .invoice-number { font-size: 15px; font-weight: bold; margin-top: 4px; }
    .meta-section { display: flex; justify-content: space-between; margin-bottom: 20px; gap: 16px; }
    .meta-box { flex: 1; }
    .meta-box h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px; }
    .meta-box p { margin: 2px 0; font-size: 12px; }
    .meta-box .bold { font-weight: bold; font-size: 13px; }
    .dates-section { background: #f9f9f9; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; display: flex; gap: 24px; }
    .date-item { display: flex; flex-direction: column; }
    .date-item span:first-child { font-size: 10px; text-transform: uppercase; color: #888; }
    .date-item span:last-child { font-size: 13px; font-weight: bold; margin-top: 2px; }
    .date-item.overdue span:last-child { color: #c62828; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    thead { background: #2e7d32; color: #fff; }
    thead th { padding: 8px 10px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; }
    tbody tr:nth-child(even) { background: #f5f5f5; }
    tbody td { padding: 7px 10px; border-bottom: 1px solid #eee; }
    tfoot td { padding: 6px 10px; border-top: 1px solid #ddd; font-weight: bold; background: #f9f9f9; }
    .center { text-align: center; }
    .right { text-align: right; }
    .totals-section { display: flex; justify-content: flex-end; margin-bottom: 20px; }
    .totals-table { width: 300px; border-collapse: collapse; }
    .totals-table td { padding: 5px 10px; font-size: 12px; }
    .totals-table .label { text-align: left; color: #555; }
    .totals-table .amount { text-align: right; font-weight: bold; }
    .totals-table .total-row td { font-size: 14px; font-weight: bold; border-top: 2px solid #2e7d32; padding-top: 8px; color: #2e7d32; }
    .totals-table .balance-row td { font-size: 14px; font-weight: bold; color: #c62828; }
    .totals-table .paid-row td { color: #388e3c; }
    .terms-section { margin-top: 16px; padding: 12px; background: #f9f9f9; border-radius: 4px; }
    .terms-section h4 { font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 6px; }
    .terms-section p { font-size: 11px; color: #555; line-height: 1.5; }
    .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #aaa; border-top: 1px solid #eee; padding-top: 12px; }
    .muted { color: #999; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    ${statusWatermark}

    <!-- Header -->
    <div class="header">
      <div>
        <div class="company-name">Green Nursery</div>
        <div class="company-sub">Plant Nursery Management System</div>
      </div>
      <div class="invoice-title">
        <h1>Invoice</h1>
        <div class="invoice-number">${invoice.invoice_number}</div>
      </div>
    </div>

    <!-- Meta: Bill To + Order Reference -->
    <div class="meta-section">
      <div class="meta-box">
        <h3>Bill To</h3>
        <p class="bold">${customer.name || ''}</p>
        <p>${customer.customer_code || ''}</p>
        ${customerAddress ? `<p>${customerAddress}</p>` : ''}
        ${customer.phone ? `<p>Phone: ${customer.phone}</p>` : ''}
        ${customer.email ? `<p>Email: ${customer.email}</p>` : ''}
        ${customer.gst_number ? `<p>GSTIN: <strong>${customer.gst_number}</strong></p>` : ''}
      </div>
      <div class="meta-box" style="text-align:right;">
        ${
          order
            ? `<h3>Against Order</h3>
               <p class="bold">${order.order_number}</p>
               <p>Order Date: ${formatDate(order.order_date)}</p>
               <p>Status: ${order.status || ''}</p>`
            : ''
        }
      </div>
    </div>

    <!-- Dates -->
    <div class="dates-section">
      <div class="date-item">
        <span>Invoice Date</span>
        <span>${formatDate(invoice.invoice_date)}</span>
      </div>
      <div class="date-item ${invoice.status !== 'paid' && new Date(invoice.due_date) < new Date() ? 'overdue' : ''}">
        <span>Due Date</span>
        <span>${formatDate(invoice.due_date)}</span>
      </div>
      <div class="date-item">
        <span>Status</span>
        <span>${invoice.status.replace('_', ' ').toUpperCase()}</span>
      </div>
    </div>

    <!-- Line Items Table -->
    <table>
      <thead>
        <tr>
          <th class="center" style="width:40px">#</th>
          <th>Description</th>
          <th class="center" style="width:60px">Qty</th>
          <th class="right" style="width:90px">Unit Price</th>
          <th class="right" style="width:80px">Discount</th>
          <th class="right" style="width:90px">Line Total</th>
          <th class="center" style="width:60px">Tax %</th>
          <th class="right" style="width:80px">Tax Amt</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td colspan="8" style="text-align:center;color:#999">No items</td></tr>'}
      </tbody>
    </table>

    <!-- Totals -->
    <div class="totals-section">
      <table class="totals-table">
        <tr>
          <td class="label">Subtotal</td>
          <td class="amount">${formatCurrency(invoice.subtotal_amount)}</td>
        </tr>
        ${
          parseFloat(invoice.discount_amount) > 0
            ? `<tr>
                 <td class="label">Discount</td>
                 <td class="amount">(${formatCurrency(invoice.discount_amount)})</td>
               </tr>`
            : ''
        }
        ${
          parseFloat(invoice.tax_amount) > 0
            ? `<tr>
                 <td class="label">GST (${invoice.tax_rate}%)</td>
                 <td class="amount">${formatCurrency(invoice.tax_amount)}</td>
               </tr>`
            : ''
        }
        <tr class="total-row">
          <td class="label">Total Amount</td>
          <td class="amount">${formatCurrency(invoice.total_amount)}</td>
        </tr>
        ${
          parseFloat(invoice.paid_amount) > 0
            ? `<tr class="paid-row">
                 <td class="label">Paid</td>
                 <td class="amount">(${formatCurrency(invoice.paid_amount)})</td>
               </tr>`
            : ''
        }
        <tr class="balance-row">
          <td class="label">Balance Due</td>
          <td class="amount">${formatCurrency(invoice.balance_amount)}</td>
        </tr>
      </table>
    </div>

    ${
      invoice.terms_and_conditions
        ? `<div class="terms-section">
             <h4>Terms &amp; Conditions</h4>
             <p>${invoice.terms_and_conditions.replace(/\n/g, '<br>')}</p>
           </div>`
        : ''
    }

    ${
      invoice.notes
        ? `<div class="terms-section" style="margin-top:8px;">
             <h4>Notes</h4>
             <p>${invoice.notes.replace(/\n/g, '<br>')}</p>
           </div>`
        : ''
    }

    <div class="footer">
      <p>Thank you for your business. This is a computer-generated invoice.</p>
    </div>
  </div>

  <script>window.addEventListener('load', () => window.print());</script>
</body>
</html>`;
};

module.exports = { generateInvoiceHTML };
