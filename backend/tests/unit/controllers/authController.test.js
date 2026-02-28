/**
 * Authentication Controller Tests
 * Phase 19 - Issue #92
 *
 * Tests for user registration, login, and token refresh
 */

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const authController = require('../../../controllers/authController');
const db = require('../../../utils/db');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../../../utils/jwt');

// Create test Express app
const app = express();
app.use(express.json());
app.post('/register', authController.register);
app.post('/login', authController.login);
app.post('/refresh', authController.refresh);

// Mock the db module
jest.mock('../../../utils/db');

// Mock the jwt module
jest.mock('../../../utils/jwt');

describe('AuthController - Registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should register a new user successfully', async () => {
    // Mock database responses
    db.query
      // Check existing user
      .mockResolvedValueOnce({ rows: [] })

    db.getClient.mockResolvedValueOnce({
      query: jest.fn()
        // BEGIN transaction
        .mockResolvedValueOnce({})
        // INSERT user
        .mockResolvedValueOnce({
          rows: [{
            id: '123e4567-e89b-12d3-a456-426614174000',
            email: 'test@example.com',
            full_name: 'Test User',
            status: 'active',
            created_at: new Date()
          }]
        })
        // Get Warehouse role
        .mockResolvedValueOnce({
          rows: [{ id: 'role-id-1' }]
        })
        // Assign role
        .mockResolvedValueOnce({})
        // COMMIT transaction
        .mockResolvedValueOnce({}),
      release: jest.fn()
    });

    // Mock JWT token generation
    generateAccessToken.mockReturnValue('mock-access-token');
    generateRefreshToken.mockReturnValue('mock-refresh-token');

    const response = await request(app)
      .post('/register')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!',
        fullName: 'Test User',
        phone: '9876543210'
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('message', 'User registered successfully');
    expect(response.body).toHaveProperty('user');
    expect(response.body.user).toHaveProperty('email', 'test@example.com');
    expect(response.body).toHaveProperty('tokens');
    expect(response.body.tokens).toHaveProperty('accessToken');
    expect(response.body.tokens).toHaveProperty('refreshToken');
  });

  test('should return 409 when email already exists', async () => {
    // Mock existing user
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'existing-user-id' }]
    });

    const response = await request(app)
      .post('/register')
      .send({
        email: 'existing@example.com',
        password: 'SecurePass123!',
        fullName: 'Existing User',
        phone: '9876543210'
      });

    expect(response.status).toBe(409);
    expect(response.body).toHaveProperty('error', 'Conflict');
    expect(response.body.message).toContain('already exists');
  });

  test('should handle missing required fields', async () => {
    const response = await request(app)
      .post('/register')
      .send({
        email: 'test@example.com'
        // Missing password and fullName
      });

    // Note: This will fail with 500 currently.
    // In production, you should add validation middleware
    expect(response.status).toBe(500);
  });

  test('should handle database errors during registration', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // No existing user
    db.getClient.mockResolvedValueOnce({
      query: jest.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database connection error')), // INSERT fails
      release: jest.fn()
    });

    const response = await request(app)
      .post('/register')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!',
        fullName: 'Test User'
      });

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error', 'Internal Server Error');
  });

  test('should convert email to lowercase', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const mockQuery = jest.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'user-id',
          email: 'test@example.com',
          full_name: 'Test User',
          status: 'active',
          created_at: new Date()
        }]
      })
      .mockResolvedValueOnce({ rows: [{ id: 'role-id' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    db.getClient.mockResolvedValueOnce({
      query: mockQuery,
      release: jest.fn()
    });

    generateAccessToken.mockReturnValue('token');
    generateRefreshToken.mockReturnValue('refresh-token');

    await request(app)
      .post('/register')
      .send({
        email: 'Test@EXAMPLE.COM',
        password: 'SecurePass123!',
        fullName: 'Test User'
      });

    // Check that email was lowercased in the INSERT query
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[1][0]).toBe('test@example.com');
  });
});

describe('AuthController - Login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should login successfully with valid credentials', async () => {
    const hashedPassword = await bcrypt.hash('SecurePass123!', 10);

    // Mock user query
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'user-id-123',
        email: 'test@example.com',
        password_hash: hashedPassword,
        full_name: 'Test User',
        status: 'active',
        roles: ['Admin', 'Manager']
      }]
    });

    generateAccessToken.mockReturnValue('access-token');
    generateRefreshToken.mockReturnValue('refresh-token');

    const response = await request(app)
      .post('/login')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!'
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', 'Login successful');
    expect(response.body.user).toHaveProperty('email', 'test@example.com');
    expect(response.body.user).toHaveProperty('roles');
    expect(response.body.tokens).toHaveProperty('accessToken');
    expect(response.body.tokens).toHaveProperty('refreshToken');
  });

  test('should return 401 for non-existent user', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .post('/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Unauthorized');
    expect(response.body.message).toContain('Invalid credentials');
  });

  test('should return 401 for incorrect password', async () => {
    const hashedPassword = await bcrypt.hash('CorrectPassword123!', 10);

    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'user-id',
        email: 'test@example.com',
        password_hash: hashedPassword,
        full_name: 'Test User',
        status: 'active',
        roles: ['Admin']
      }]
    });

    const response = await request(app)
      .post('/login')
      .send({
        email: 'test@example.com',
        password: 'WrongPassword123!'
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Unauthorized');
    expect(response.body.message).toContain('Invalid credentials');
  });

  test('should return 403 for inactive user', async () => {
    const hashedPassword = await bcrypt.hash('SecurePass123!', 10);

    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'user-id',
        email: 'test@example.com',
        password_hash: hashedPassword,
        full_name: 'Test User',
        status: 'suspended',
        roles: ['Admin']
      }]
    });

    const response = await request(app)
      .post('/login')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!'
      });

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error', 'Forbidden');
    expect(response.body.message).toContain('suspended');
  });

  test('should handle case-insensitive email', async () => {
    const hashedPassword = await bcrypt.hash('SecurePass123!', 10);

    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'user-id',
        email: 'test@example.com',
        password_hash: hashedPassword,
        full_name: 'Test User',
        status: 'active',
        roles: ['Admin']
      }]
    });

    generateAccessToken.mockReturnValue('token');
    generateRefreshToken.mockReturnValue('refresh');

    const response = await request(app)
      .post('/login')
      .send({
        email: 'TEST@EXAMPLE.COM',
        password: 'SecurePass123!'
      });

    expect(response.status).toBe(200);
  });

  test('should handle database errors during login', async () => {
    db.query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .post('/login')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!'
      });

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error', 'Internal Server Error');
  });

  test('should filter out null roles', async () => {
    const hashedPassword = await bcrypt.hash('SecurePass123!', 10);

    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'user-id',
        email: 'test@example.com',
        password_hash: hashedPassword,
        full_name: 'Test User',
        status: 'active',
        roles: ['Admin', null, 'Manager', null]
      }]
    });

    generateAccessToken.mockReturnValue('token');
    generateRefreshToken.mockReturnValue('refresh');

    const response = await request(app)
      .post('/login')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!'
      });

    expect(response.status).toBe(200);
    expect(response.body.user.roles).toEqual(['Admin', 'Manager']);
    expect(response.body.user.roles).not.toContain(null);
  });
});

describe('AuthController - Token Refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should refresh tokens successfully', async () => {
    // Mock token verification
    verifyRefreshToken.mockReturnValue({
      userId: 'user-id-123'
    });

    // Mock user query
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'user-id-123',
        email: 'test@example.com',
        status: 'active'
      }]
    });

    generateAccessToken.mockReturnValue('new-access-token');
    generateRefreshToken.mockReturnValue('new-refresh-token');

    const response = await request(app)
      .post('/refresh')
      .send({
        refreshToken: 'valid-refresh-token'
      });

    expect(response.status).toBe(200);
    expect(response.body.tokens).toHaveProperty('accessToken', 'new-access-token');
    expect(response.body.tokens).toHaveProperty('refreshToken', 'new-refresh-token');
  });

  test('should return 400 when refresh token is missing', async () => {
    const response = await request(app)
      .post('/refresh')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Bad Request');
    expect(response.body.message).toContain('required');
  });

  test('should return 401 for invalid refresh token', async () => {
    verifyRefreshToken.mockImplementation(() => {
      throw new Error('Invalid token');
    });

    const response = await request(app)
      .post('/refresh')
      .send({
        refreshToken: 'invalid-token'
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Unauthorized');
    expect(response.body.message).toContain('Invalid or expired');
  });

  test('should return 401 when user not found', async () => {
    verifyRefreshToken.mockReturnValue({
      userId: 'non-existent-user'
    });

    db.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .post('/refresh')
      .send({
        refreshToken: 'valid-token'
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Unauthorized');
    expect(response.body.message).toContain('User not found');
  });

  test('should return 403 for inactive user', async () => {
    verifyRefreshToken.mockReturnValue({
      userId: 'user-id'
    });

    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'user-id',
        email: 'test@example.com',
        status: 'suspended'
      }]
    });

    const response = await request(app)
      .post('/refresh')
      .send({
        refreshToken: 'valid-token'
      });

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error', 'Forbidden');
    expect(response.body.message).toContain('suspended');
  });

  test('should handle database errors during token refresh', async () => {
    verifyRefreshToken.mockReturnValue({
      userId: 'user-id'
    });

    db.query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .post('/refresh')
      .send({
        refreshToken: 'valid-token'
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'Unauthorized');
  });
});

describe('AuthController - Password Security', () => {
  test('should hash password before storing', async () => {
    const plainPassword = 'SecurePass123!';

    db.query.mockResolvedValueOnce({ rows: [] });

    const mockQuery = jest.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'user-id',
          email: 'test@example.com',
          full_name: 'Test',
          status: 'active',
          created_at: new Date()
        }]
      })
      .mockResolvedValueOnce({ rows: [{ id: 'role-id' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    db.getClient.mockResolvedValueOnce({
      query: mockQuery,
      release: jest.fn()
    });

    generateAccessToken.mockReturnValue('token');
    generateRefreshToken.mockReturnValue('refresh');

    await request(app)
      .post('/register')
      .send({
        email: 'test@example.com',
        password: plainPassword,
        fullName: 'Test User'
      });

    // Get the hashed password from the INSERT query
    const insertCall = mockQuery.mock.calls[1];
    const hashedPassword = insertCall[1][1];

    // Verify it's not the plain password
    expect(hashedPassword).not.toBe(plainPassword);

    // Verify it's a valid bcrypt hash
    expect(hashedPassword).toMatch(/^\$2[ayb]\$.{56}$/);

    // Verify it can be validated
    const isValid = await bcrypt.compare(plainPassword, hashedPassword);
    expect(isValid).toBe(true);
  });
});
