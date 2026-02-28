/**
 * Lot Allocation Service Tests
 * Phase 19 - Issue #94
 *
 * Tests for intelligent lot allocation algorithm
 */

const lotAllocationService = require('../../../services/lotAllocationService');
const pool = require('../../../config/database');

// Mock the database pool
jest.mock('../../../config/database');

// Mock stock alert service
jest.mock('../../../services/stockAlertService', () => {
  return jest.fn().mockImplementation(() => ({
    checkStockLevel: jest.fn().mockResolvedValue(true)
  }));
});

describe('Lot Allocation Service - allocateLotsToOrder', () => {
  let mockClient;

  beforeEach(() => {
    // Create mock client with query and release methods
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    pool.connect = jest.fn().mockResolvedValue(mockClient);
    jest.clearAllMocks();
  });

  test('should allocate lots successfully for a valid order', async () => {
    const orderId = 'order-123';

    // Mock order fetch
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: orderId,
          delivery_date: new Date('2025-11-01'),
          status: 'pending'
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'item-1',
          sku_id: 'sku-1',
          quantity: 50,
          status: 'pending',
          sku_code: 'SKU001',
          sku_name: 'Test Plant'
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'lot-1',
          lot_number: 'LOT001',
          quantity: 100,
          allocated_quantity: 0,
          available_quantity: 100,
          growth_stage: 'ready',
          expected_ready_date: new Date('2025-10-25'),
          current_location: 'A1'
        }]
      })
      .mockResolvedValueOnce({}) // UPDATE order_items
      .mockResolvedValueOnce({
        rows: [{ max_ready_date: new Date('2025-10-25') }]
      })
      .mockResolvedValueOnce({}) // UPDATE orders expected_ready_date
      .mockResolvedValueOnce({}); // COMMIT

    const result = await lotAllocationService.allocateLotsToOrder(orderId);

    expect(result.success).toBe(true);
    expect(result.allocated).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('should throw error when order not found', async () => {
    const orderId = 'non-existent-order';

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // Order not found

    await expect(
      lotAllocationService.allocateLotsToOrder(orderId)
    ).rejects.toThrow('Order not found');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('should throw error for invalid order status', async () => {
    const orderId = 'order-123';

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: orderId,
          delivery_date: new Date(),
          status: 'completed' // Invalid status
        }]
      });

    await expect(
      lotAllocationService.allocateLotsToOrder(orderId)
    ).rejects.toThrow('Cannot allocate lots for order with status: completed');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('should handle orders with no items to allocate', async () => {
    const orderId = 'order-123';

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: orderId,
          delivery_date: new Date(),
          status: 'pending'
        }]
      })
      .mockResolvedValueOnce({ rows: [] }); // No items

    const result = await lotAllocationService.allocateLotsToOrder(orderId);

    expect(result.success).toBe(true);
    expect(result.message).toBe('No items to allocate');
    expect(result.allocated).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  test('should handle partial allocation when insufficient inventory', async () => {
    const orderId = 'order-123';

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: orderId,
          delivery_date: new Date('2025-11-01'),
          status: 'pending'
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'item-1',
          sku_id: 'sku-1',
          quantity: 100,
          status: 'pending',
          sku_code: 'SKU001',
          sku_name: 'Test Plant'
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'lot-1',
          lot_number: 'LOT001',
          quantity: 50,
          allocated_quantity: 0,
          available_quantity: 50, // Only 50 available, need 100
          growth_stage: 'ready',
          expected_ready_date: new Date('2025-10-25'),
          current_location: 'A1'
        }]
      })
      .mockResolvedValueOnce({}) // UPDATE order_items
      .mockResolvedValueOnce({
        rows: [{ max_ready_date: new Date('2025-10-25') }]
      })
      .mockResolvedValueOnce({}) // UPDATE orders
      .mockResolvedValueOnce({}); // COMMIT

    const result = await lotAllocationService.allocateLotsToOrder(orderId);

    expect(result.success).toBe(true);
    expect(result.partiallyAllocated).toHaveLength(1);
  });

  test('should prioritize ready lots over transplant stage', async () => {
    const orderId = 'order-123';

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: orderId,
          delivery_date: new Date('2025-11-01'),
          status: 'pending'
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'item-1',
          sku_id: 'sku-1',
          quantity: 30,
          status: 'pending',
          sku_code: 'SKU001',
          sku_name: 'Test Plant'
        }]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'lot-1',
            lot_number: 'LOT001',
            quantity: 50,
            available_quantity: 50,
            growth_stage: 'ready', // Should be prioritized
            expected_ready_date: new Date('2025-10-25')
          },
          {
            id: 'lot-2',
            lot_number: 'LOT002',
            quantity: 100,
            available_quantity: 100,
            growth_stage: 'transplant',
            expected_ready_date: new Date('2025-10-20') // Earlier date but not ready
          }
        ]
      })
      .mockResolvedValueOnce({}) // UPDATE should use lot-1 (ready stage)
      .mockResolvedValueOnce({ rows: [{ max_ready_date: null }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await lotAllocationService.allocateLotsToOrder(orderId);

    // Verify the UPDATE query used lot-1 (ready stage)
    const updateCall = mockClient.query.mock.calls.find(
      call => call[0] && call[0].includes('UPDATE order_items')
    );
    expect(updateCall[1][0]).toBe('lot-1'); // lot_id should be lot-1
  });

  test('should handle allocation failure for specific items', async () => {
    const orderId = 'order-123';

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: orderId,
          delivery_date: new Date(),
          status: 'pending'
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'item-1',
          sku_id: 'sku-1',
          quantity: 50,
          status: 'pending',
          sku_code: 'SKU001',
          sku_name: 'Test Plant'
        }]
      })
      .mockResolvedValueOnce({ rows: [] }) // No lots available
      .mockResolvedValueOnce({ rows: [{ max_ready_date: null }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await lotAllocationService.allocateLotsToOrder(orderId);

    expect(result.success).toBe(true);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain('No available lots');
  });

  test('should rollback transaction on error', async () => {
    const orderId = 'order-123';

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('Database error')); // Fetch order fails

    await expect(
      lotAllocationService.allocateLotsToOrder(orderId)
    ).rejects.toThrow('Database error');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('Lot Allocation Service - allocateSingleItem', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn()
    };
    jest.clearAllMocks();
  });

  test('should allocate single lot when sufficient quantity available', async () => {
    const item = {
      id: 'item-1',
      sku_id: 'sku-1',
      quantity: 30,
      sku_code: 'SKU001'
    };

    mockClient.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'lot-1',
          lot_number: 'LOT001',
          quantity: 100,
          available_quantity: 100,
          growth_stage: 'ready',
          expected_ready_date: new Date('2025-10-25')
        }]
      })
      .mockResolvedValueOnce({}); // UPDATE order_items

    const result = await lotAllocationService.__testExports.allocateSingleItem(
      mockClient,
      item,
      new Date('2025-11-01')
    );

    expect(result.fullyAllocated).toBe(true);
    expect(result.lots).toHaveLength(1);
    expect(result.lots[0].quantity).toBe(30);
  });

  test('should allocate from multiple lots when needed', async () => {
    const item = {
      id: 'item-1',
      sku_id: 'sku-1',
      quantity: 150,
      sku_code: 'SKU001'
    };

    mockClient.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'lot-1',
            lot_number: 'LOT001',
            quantity: 100,
            available_quantity: 100,
            growth_stage: 'ready',
            expected_ready_date: new Date('2025-10-25')
          },
          {
            id: 'lot-2',
            lot_number: 'LOT002',
            quantity: 80,
            available_quantity: 80,
            growth_stage: 'ready',
            expected_ready_date: new Date('2025-10-26')
          }
        ]
      })
      .mockResolvedValueOnce({}) // UPDATE first lot
      .mockResolvedValueOnce({ // INSERT for second lot
        rows: [{ id: 'item-2' }]
      });

    const result = await lotAllocationService.__testExports.allocateSingleItem(
      mockClient,
      item,
      new Date('2025-11-01')
    );

    expect(result.fullyAllocated).toBe(true);
    expect(result.lots).toHaveLength(2);
    expect(result.lots[0].quantity).toBe(100);
    expect(result.lots[1].quantity).toBe(50);
  });

  test('should return partial allocation when insufficient total quantity', async () => {
    const item = {
      id: 'item-1',
      sku_id: 'sku-1',
      quantity: 200,
      sku_code: 'SKU001'
    };

    mockClient.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'lot-1',
          lot_number: 'LOT001',
          quantity: 100,
          available_quantity: 100,
          growth_stage: 'ready',
          expected_ready_date: new Date('2025-10-25')
        }]
      })
      .mockResolvedValueOnce({}); // UPDATE

    const result = await lotAllocationService.__testExports.allocateSingleItem(
      mockClient,
      item,
      new Date('2025-11-01')
    );

    expect(result.fullyAllocated).toBe(false);
    expect(result.partiallyAllocated).toBe(true);
    expect(result.allocated_quantity).toBe(100);
    expect(result.remaining_quantity).toBe(100);
  });

  test('should return failure when no lots available', async () => {
    const item = {
      id: 'item-1',
      sku_id: 'sku-1',
      quantity: 50,
      sku_code: 'SKU001'
    };

    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const result = await lotAllocationService.__testExports.allocateSingleItem(
      mockClient,
      item,
      new Date('2025-11-01')
    );

    expect(result.fullyAllocated).toBe(false);
    expect(result.partiallyAllocated).toBe(false);
    expect(result.reason).toContain('No available lots');
  });
});

describe('Lot Allocation Service - checkLotAvailability', () => {
  beforeEach(() => {
    pool.query = jest.fn();
    jest.clearAllMocks();
  });

  test('should return available when sufficient quantity exists', async () => {
    const skuId = 'sku-1';
    const quantity = 50;

    pool.query.mockResolvedValueOnce({
      rows: [{
        total_available: '100',
        lot_count: '3',
        earliest_ready_date: new Date('2025-10-25')
      }]
    });

    const result = await lotAllocationService.checkLotAvailability(skuId, quantity);

    expect(result.available).toBe(true);
    expect(result.total_available).toBe(100);
    expect(result.shortage).toBe(0);
    expect(result.lot_count).toBe(3);
  });

  test('should return unavailable when insufficient quantity exists', async () => {
    const skuId = 'sku-1';
    const quantity = 150;

    pool.query.mockResolvedValueOnce({
      rows: [{
        total_available: '100',
        lot_count: '2',
        earliest_ready_date: new Date('2025-10-25')
      }]
    });

    const result = await lotAllocationService.checkLotAvailability(skuId, quantity);

    expect(result.available).toBe(false);
    expect(result.total_available).toBe(100);
    expect(result.shortage).toBe(50);
  });

  test('should handle no lots available', async () => {
    const skuId = 'sku-1';
    const quantity = 50;

    pool.query.mockResolvedValueOnce({
      rows: [{
        total_available: null,
        lot_count: '0',
        earliest_ready_date: null
      }]
    });

    const result = await lotAllocationService.checkLotAvailability(skuId, quantity);

    expect(result.available).toBe(false);
    expect(result.total_available).toBe(0);
    expect(result.shortage).toBe(50);
    expect(result.lot_count).toBe(0);
  });

  test('should calculate exact match correctly', async () => {
    const skuId = 'sku-1';
    const quantity = 100;

    pool.query.mockResolvedValueOnce({
      rows: [{
        total_available: '100',
        lot_count: '1',
        earliest_ready_date: new Date('2025-10-25')
      }]
    });

    const result = await lotAllocationService.checkLotAvailability(skuId, quantity);

    expect(result.available).toBe(true);
    expect(result.shortage).toBe(0);
  });
});

describe('Lot Allocation Service - releaseAllocatedLots', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    pool.connect = jest.fn().mockResolvedValue(mockClient);
    jest.clearAllMocks();
  });

  test('should release allocated lots successfully', async () => {
    const orderId = 'order-123';

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'item-1',
            lot_id: 'lot-1',
            quantity: 50
          },
          {
            id: 'item-2',
            lot_id: 'lot-2',
            quantity: 30
          }
        ]
      })
      .mockResolvedValueOnce({}) // UPDATE lots (lot-1)
      .mockResolvedValueOnce({}) // UPDATE lots (lot-2)
      .mockResolvedValueOnce({}) // UPDATE order_items
      .mockResolvedValueOnce({}); // COMMIT

    const result = await lotAllocationService.releaseAllocatedLots(orderId);

    expect(result.success).toBe(true);
    expect(result.deallocated_items).toBe(2);
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('should handle order with no allocated lots', async () => {
    const orderId = 'order-123';

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // No items
      .mockResolvedValueOnce({ rows: [] }) // UPDATE result
      .mockResolvedValueOnce({}); // COMMIT

    const result = await lotAllocationService.releaseAllocatedLots(orderId);

    expect(result.success).toBe(true);
    expect(result.deallocated_items).toBe(0);
  });

  test('should rollback on error during release', async () => {
    const orderId = 'order-123';

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('Database error'));

    await expect(
      lotAllocationService.releaseAllocatedLots(orderId)
    ).rejects.toThrow('Database error');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('Lot Allocation Service - Edge Cases', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    pool.connect = jest.fn().mockResolvedValue(mockClient);
    pool.query = jest.fn();
    jest.clearAllMocks();
  });

  test('should handle zero quantity request', async () => {
    const skuId = 'sku-1';
    const quantity = 0;

    pool.query.mockResolvedValueOnce({
      rows: [{
        total_available: '100',
        lot_count: '1',
        earliest_ready_date: new Date()
      }]
    });

    const result = await lotAllocationService.checkLotAvailability(skuId, quantity);

    expect(result.available).toBe(true);
    expect(result.shortage).toBe(0);
  });

  test('should handle large quantity request', async () => {
    const skuId = 'sku-1';
    const quantity = 1000000;

    pool.query.mockResolvedValueOnce({
      rows: [{
        total_available: '100',
        lot_count: '1',
        earliest_ready_date: new Date()
      }]
    });

    const result = await lotAllocationService.checkLotAvailability(skuId, quantity);

    expect(result.available).toBe(false);
    expect(result.shortage).toBe(999900);
  });

  test('should handle allocation with null expected_ready_date', async () => {
    const item = {
      id: 'item-1',
      sku_id: 'sku-1',
      quantity: 30,
      sku_code: 'SKU001'
    };

    mockClient.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'lot-1',
          lot_number: 'LOT001',
          quantity: 100,
          available_quantity: 100,
          growth_stage: 'ready',
          expected_ready_date: null // No ready date
        }]
      })
      .mockResolvedValueOnce({});

    const result = await lotAllocationService.__testExports.allocateSingleItem(
      mockClient,
      item,
      new Date('2025-11-01')
    );

    expect(result.fullyAllocated).toBe(true);
    expect(result.lots[0].expected_ready_date).toBeNull();
  });

  test('should validate order status before allocation', async () => {
    const orderId = 'order-123';
    const invalidStatuses = ['shipped', 'delivered', 'cancelled'];

    for (const status of invalidStatuses) {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: orderId,
            delivery_date: new Date(),
            status: status
          }]
        });

      await expect(
        lotAllocationService.allocateLotsToOrder(orderId)
      ).rejects.toThrow(`Cannot allocate lots for order with status: ${status}`);

      jest.clearAllMocks();
    }
  });

  test('should allow allocation for valid order statuses', async () => {
    const orderId = 'order-123';
    const validStatuses = ['pending', 'confirmed', 'preparing'];

    for (const status of validStatuses) {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: orderId,
            delivery_date: new Date(),
            status: status
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // No items to allocate

      const result = await lotAllocationService.allocateLotsToOrder(orderId);

      expect(result.success).toBe(true);
      jest.clearAllMocks();
    }
  });
});
