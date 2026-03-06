import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

/**
 * Format currency amount in Indian Rupees
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string (₹1,234.56)
 */
export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

/**
 * Format date in readable format
 * @param {string|Date} date - Date to format
 * @param {string} format - Optional format string (default: 'MMM D, YYYY')
 * @returns {string} Formatted date string
 */
export const formatDate = (date, format = 'MMM D, YYYY') => {
  if (!date) return '-';
  return dayjs(date).format(format);
};

/**
 * Format date and time
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date-time string
 */
export const formatDateTime = (date) => {
  if (!date) return '-';
  return dayjs(date).format('MMM D, YYYY h:mm A');
};

/**
 * Format date relative to now (e.g., "2 days ago")
 * @param {string|Date} date - Date to format
 * @returns {string} Relative date string
 */
export const formatRelativeDate = (date) => {
  if (!date) return '-';
  return dayjs(date).fromNow();
};

/**
 * Format phone number
 * @param {string} phone - Phone number to format
 * @returns {string} Formatted phone number
 */
export const formatPhone = (phone) => {
  if (!phone) return '-';
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');

  // Strip +91 country code for Indian numbers (12 digits starting with 91)
  const digits = (cleaned.length === 12 && cleaned.startsWith('91')) ? cleaned.slice(2) : cleaned;

  // Format as XXXXX XXXXX for 10 digits
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }

  // Return as-is if format not recognized
  return phone;
};

/**
 * Format order number with prefix
 * @param {string|number} id - Order ID or number
 * @returns {string} Formatted order number (ORD-12345)
 */
export const formatOrderNumber = (id) => {
  if (!id) return '-';
  return `ORD-${String(id).padStart(5, '0')}`;
};

/**
 * Format SKU code
 * @param {string} code - SKU code
 * @returns {string} Uppercase SKU code
 */
export const formatSKUCode = (code) => {
  if (!code) return '-';
  return code.toUpperCase();
};

/**
 * Format percentage
 * @param {number} value - Percentage value
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (value, decimals = 0) => {
  if (value === null || value === undefined) return '0%';
  return `${value.toFixed(decimals)}%`;
};

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export const truncateText = (text, maxLength = 50) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
};

/**
 * Format address as single line
 * @param {object} address - Address object
 * @returns {string} Formatted address string
 */
export const formatAddress = (address) => {
  if (!address) return '-';

  const parts = [
    address.address_line1,
    address.address_line2,
    address.city,
    address.state,
    address.pincode
  ].filter(Boolean);

  return parts.join(', ');
};
