const validator = require('validator');
const xss = require('xss');

class Sanitizer {
  // Sanitize HTML to prevent XSS
  sanitizeHtml(html) {
    if (!html) return '';

    return xss(html, {
      whiteList: {
        // Allow only safe HTML tags
        p: [],
        br: [],
        strong: [],
        em: [],
        u: [],
        ul: ['class'],
        ol: ['class'],
        li: [],
      },
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style'],
    });
  }

  // Sanitize plain text
  sanitizeText(text) {
    if (!text) return '';
    return validator.escape(text.toString().trim());
  }

  // Sanitize email
  sanitizeEmail(email) {
    if (!email) return '';
    return validator.normalizeEmail(email, {
      gmail_remove_dots: false,
      gmail_remove_subaddress: false,
    });
  }

  // Sanitize phone number (remove formatting)
  sanitizePhone(phone) {
    if (!phone) return '';
    return phone.toString().replace(/\D/g, '');
  }

  // Sanitize URL
  sanitizeUrl(url) {
    if (!url) return '';
    const sanitized = validator.trim(url);
    return validator.isURL(sanitized) ? sanitized : '';
  }

  // Sanitize object (recursively sanitize all string values)
  sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeText(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  // Remove SQL injection patterns (defense in depth)
  removeSqlInjection(text) {
    if (!text) return '';

    const patterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
      /(--|;|\/\*|\*\/|xp_|sp_)/gi,
      /(\bOR\b.*=.*|'\s*OR\s*'1'\s*=\s*'1)/gi,
    ];

    let cleaned = text.toString();
    patterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    return cleaned;
  }

  // Validate and sanitize file upload
  validateFile(file, options = {}) {
    const {
      maxSize = 5 * 1024 * 1024, // 5MB
      allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],
      allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'],
    } = options;

    const errors = [];

    // Check file exists
    if (!file) {
      errors.push('No file provided');
      return { valid: false, errors };
    }

    // Check file size
    if (file.size > maxSize) {
      errors.push(`File size exceeds ${maxSize / 1024 / 1024}MB limit`);
    }

    // Check MIME type
    if (!allowedTypes.includes(file.mimetype)) {
      errors.push(`File type ${file.mimetype} not allowed`);
    }

    // Check file extension
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (!allowedExtensions.includes(ext)) {
      errors.push(`File extension ${ext} not allowed`);
    }

    // Check for double extensions (e.g., file.php.jpg)
    const parts = file.originalname.split('.');
    if (parts.length > 2) {
      errors.push('Multiple file extensions not allowed');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

module.exports = new Sanitizer();
