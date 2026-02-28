/**
 * Authentication Middleware Tests
 * Phase 19 - Issue #92
 *
 * Tests for JWT authentication and authorization middleware
 */

const { authenticate } = require('../../../middleware/auth');
const { authorize } = require('../../../middleware/authorize');
const { verifyAccessToken } = require('../../../utils/jwt');
const db = require('../../../utils/db');

// Mock dependencies
jest.mock('../../../utils/jwt');
jest.mock('../../../utils/db');

describe('authenticate middleware', () => {
  let req, res, next;

  beforeEach(() => {
    // Setup request, response, and next function mocks
    req = {
      headers: {},
      user: null
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    next = jest.fn();

    jest.clearAllMocks();
  });

  test('should authenticate user with valid token', async () => {
    // Setup
    req.headers.authorization = 'Bearer valid-token';

    verifyAccessToken.mockReturnValue({
      userId: 'user-123',
      email: 'test@example.com'
    });

    db.query.mockResolvedValue({
      rows: [{
        id: 'user-123',
        email: 'test@example.com',
        full_name: 'Test User',
        status: 'active',
        roles: ['Admin', 'Manager']
      }]
    });

    // Execute
    await authenticate(req, res, next);

    // Assert
    expect(verifyAccessToken).toHaveBeenCalledWith('valid-token');
    expect(db.query).toHaveBeenCalled();
    expect(req.user).toEqual({
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      status: 'active',
      roles: ['Admin', 'Manager']
    });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should return 401 when authorization header is missing', async () => {
    // Execute
    await authenticate(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: expect.stringContaining('No token provided')
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 when authorization header does not start with Bearer', async () => {
    // Setup
    req.headers.authorization = 'Basic some-token';

    // Execute
    await authenticate(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: expect.stringContaining('No token provided')
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 when token is invalid', async () => {
    // Setup
    req.headers.authorization = 'Bearer invalid-token';

    verifyAccessToken.mockImplementation(() => {
      throw new Error('Invalid access token');
    });

    // Execute
    await authenticate(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 when user not found in database', async () => {
    // Setup
    req.headers.authorization = 'Bearer valid-token';

    verifyAccessToken.mockReturnValue({
      userId: 'non-existent-user'
    });

    db.query.mockResolvedValue({
      rows: []
    });

    // Execute
    await authenticate(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'User not found'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 403 when user account is not active', async () => {
    // Setup
    req.headers.authorization = 'Bearer valid-token';

    verifyAccessToken.mockReturnValue({
      userId: 'user-123'
    });

    db.query.mockResolvedValue({
      rows: [{
        id: 'user-123',
        email: 'test@example.com',
        full_name: 'Test User',
        status: 'suspended',
        roles: ['Admin']
      }]
    });

    // Execute
    await authenticate(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: expect.stringContaining('suspended')
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should filter out null roles from array_agg', async () => {
    // Setup
    req.headers.authorization = 'Bearer valid-token';

    verifyAccessToken.mockReturnValue({
      userId: 'user-123'
    });

    db.query.mockResolvedValue({
      rows: [{
        id: 'user-123',
        email: 'test@example.com',
        full_name: 'Test User',
        status: 'active',
        roles: ['Admin', null, 'Manager', null]
      }]
    });

    // Execute
    await authenticate(req, res, next);

    // Assert
    expect(req.user.roles).toEqual(['Admin', 'Manager']);
    expect(req.user.roles).not.toContain(null);
    expect(next).toHaveBeenCalled();
  });

  test('should handle database errors', async () => {
    // Setup
    req.headers.authorization = 'Bearer valid-token';

    verifyAccessToken.mockReturnValue({
      userId: 'user-123'
    });

    db.query.mockRejectedValue(new Error('Database connection error'));

    // Execute
    await authenticate(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should correctly extract token from Bearer header', async () => {
    // Setup
    const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token';
    req.headers.authorization = `Bearer ${testToken}`;

    verifyAccessToken.mockReturnValue({
      userId: 'user-123'
    });

    db.query.mockResolvedValue({
      rows: [{
        id: 'user-123',
        email: 'test@example.com',
        full_name: 'Test User',
        status: 'active',
        roles: ['Admin']
      }]
    });

    // Execute
    await authenticate(req, res, next);

    // Assert
    expect(verifyAccessToken).toHaveBeenCalledWith(testToken);
  });
});

describe('authorize middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: null,
      path: '/api/test'
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    next = jest.fn();

    jest.clearAllMocks();
  });

  test('should allow access when user has required role', () => {
    // Setup
    req.user = {
      id: 'user-123',
      email: 'test@example.com',
      roles: ['Manager', 'Sales']
    };

    const middleware = authorize(['Manager']);

    // Execute
    middleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should allow access when user is Admin (regardless of required roles)', () => {
    // Setup
    req.user = {
      id: 'user-123',
      email: 'admin@example.com',
      roles: ['Admin']
    };

    const middleware = authorize(['Manager', 'Sales']);

    // Execute
    middleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should deny access when user lacks required role', () => {
    // Setup
    req.user = {
      id: 'user-123',
      email: 'test@example.com',
      roles: ['Warehouse']
    };

    const middleware = authorize(['Admin', 'Manager']);

    // Execute
    middleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: expect.stringContaining('Insufficient permissions'),
      userRoles: ['Warehouse'],
      requiredRoles: ['Admin', 'Manager']
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 when user is not authenticated', () => {
    // req.user is null (not authenticated)
    const middleware = authorize(['Manager']);

    // Execute
    middleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should allow access when user has one of multiple required roles', () => {
    // Setup
    req.user = {
      id: 'user-123',
      email: 'test@example.com',
      roles: ['Sales']
    };

    const middleware = authorize(['Admin', 'Manager', 'Sales']);

    // Execute
    middleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should handle empty user roles array', () => {
    // Setup
    req.user = {
      id: 'user-123',
      email: 'test@example.com',
      roles: []
    };

    const middleware = authorize(['Manager']);

    // Execute
    middleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: expect.stringContaining('Insufficient permissions'),
      userRoles: [],
      requiredRoles: ['Manager']
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should handle missing roles property on user object', () => {
    // Setup
    req.user = {
      id: 'user-123',
      email: 'test@example.com'
      // roles property missing
    };

    const middleware = authorize(['Manager']);

    // Execute
    middleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('should deny access when no roles are specified and user is not Admin', () => {
    // Setup
    req.user = {
      id: 'user-123',
      email: 'test@example.com',
      roles: ['Warehouse']
    };

    const middleware = authorize([]);

    // Execute
    middleware(req, res, next);

    // Assert
    // With empty allowed roles, user won't match any role (unless Admin)
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('should work correctly with single role requirement', () => {
    // Setup
    req.user = {
      id: 'user-123',
      email: 'delivery@example.com',
      roles: ['Delivery']
    };

    const middleware = authorize(['Delivery']);

    // Execute
    middleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should be case-sensitive for role names', () => {
    // Setup
    req.user = {
      id: 'user-123',
      email: 'test@example.com',
      roles: ['manager'] // lowercase
    };

    const middleware = authorize(['Manager']); // uppercase

    // Execute
    middleware(req, res, next);

    // Assert
    // Should not match because of case difference
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
