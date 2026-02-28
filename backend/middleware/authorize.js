/**
 * Role-based access control middleware
 * @param {Array<string>} allowedRoles - Array of role names that are allowed to access the route
 * @returns {Function} Express middleware function
 */
function authorize(allowedRoles = []) {
  return (req, res, next) => {
    // Check if user is authenticated (should be set by auth middleware)
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const userRoles = req.user.roles || [];

    // Admin has access to everything
    if (userRoles.includes('Admin')) {
      return next();
    }

    // Check if user has any of the allowed roles
    const hasPermission = allowedRoles.some(role => userRoles.includes(role));

    if (!hasPermission) {
      console.log(`Access denied for user ${req.user.email} to ${req.path}. Required roles: ${allowedRoles.join(', ')}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: `Insufficient permissions. Required role(s): ${allowedRoles.join(' or ')}`,
        userRoles,
        requiredRoles: allowedRoles,
      });
    }

    next();
  };
}

module.exports = { authorize };
