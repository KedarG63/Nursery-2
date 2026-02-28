/**
 * Sample Test
 * Verify Jest setup is working
 */

describe('Sample Test Suite', () => {
  test('should pass basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  test('should have access to custom matchers', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(uuid).toBeValidUUID();
  });

  test('should validate ISO dates', () => {
    const date = new Date().toISOString();
    expect(date).toBeValidISODate();
  });
});
