/**
 * Role-based access control utility
 */

export const ROLES = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  WAREHOUSE: 'Warehouse',
  SALES: 'Sales',
  DELIVERY: 'Delivery',
};

/**
 * Check if user has permission based on required roles
 * @param {string|string[]} userRole - Current user's role(s) - can be string or array
 * @param {string[]} requiredRoles - Array of roles that have access
 * @returns {boolean} - True if user has permission
 */
export const hasPermission = (userRole, requiredRoles) => {
  if (!userRole || !requiredRoles) return false;

  // Handle both single role (string) and multiple roles (array)
  const userRoles = Array.isArray(userRole) ? userRole : [userRole];

  // Check if user has any of the required roles
  return userRoles.some(role => requiredRoles.includes(role));
};

/**
 * Check if user can edit (Admin, Manager, or Warehouse)
 * @param {string|string[]} userRole - Current user's role(s)
 * @returns {boolean}
 */
export const canEdit = (userRole) => {
  return hasPermission(userRole, [ROLES.ADMIN, ROLES.MANAGER, ROLES.WAREHOUSE]);
};

/**
 * Check if user can delete (Admin or Manager)
 * @param {string} userRole - Current user's role
 * @returns {boolean}
 */
export const canDelete = (userRole) => {
  return hasPermission(userRole, [ROLES.ADMIN, ROLES.MANAGER]);
};

/**
 * Check if user can view inventory (Admin, Manager, Warehouse)
 * @param {string} userRole - Current user's role
 * @returns {boolean}
 */
export const canViewInventory = (userRole) => {
  return hasPermission(userRole, [ROLES.ADMIN, ROLES.MANAGER, ROLES.WAREHOUSE]);
};

/**
 * Check if user can manage warehouse operations (Admin, Manager, Warehouse)
 * @param {string} userRole - Current user's role
 * @returns {boolean}
 */
export const canManageWarehouse = (userRole) => {
  return hasPermission(userRole, [ROLES.ADMIN, ROLES.MANAGER, ROLES.WAREHOUSE]);
};
