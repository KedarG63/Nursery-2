import api from './api';
import { toast } from 'react-toastify';

/**
 * Upload product image to server
 * @param {File} file - Image file to upload
 * @returns {Promise<string>} - URL of uploaded image
 */
export const uploadProductImage = async (file) => {
  // Validate file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    throw new Error('Invalid file type. Please upload JPG, PNG, or WebP image.');
  }

  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  if (file.size > maxSize) {
    throw new Error('File size too large. Maximum size is 5MB.');
  }

  // Create FormData
  const formData = new FormData();
  formData.append('image', file);

  try {
    // Upload to backend
    const response = await api.post('/api/upload/product-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data.imageUrl;
  } catch (error) {
    console.error('Image upload failed:', error);
    throw new Error(error.response?.data?.message || 'Failed to upload image');
  }
};

/**
 * Validate image dimensions (optional)
 * @param {File} file - Image file
 * @param {Object} options - Min/max width and height
 * @returns {Promise<boolean>}
 */
export const validateImageDimensions = (file, options = {}) => {
  return new Promise((resolve, reject) => {
    const { minWidth = 0, minHeight = 0, maxWidth = Infinity, maxHeight = Infinity } = options;

    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(img.src);

      if (img.width < minWidth || img.height < minHeight) {
        reject(new Error(`Image must be at least ${minWidth}x${minHeight}px`));
      } else if (img.width > maxWidth || img.height > maxHeight) {
        reject(new Error(`Image must be at most ${maxWidth}x${maxHeight}px`));
      } else {
        resolve(true);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Invalid image file'));
    };
  });
};

/**
 * Get image preview URL from file
 * @param {File} file - Image file
 * @returns {string} - Object URL for preview
 */
export const getImagePreview = (file) => {
  return URL.createObjectURL(file);
};

/**
 * Revoke image preview URL to free memory
 * @param {string} url - Object URL to revoke
 */
export const revokeImagePreview = (url) => {
  URL.revokeObjectURL(url);
};
