/**
 * List Components Tests
 * Phase 19 - Issue #95
 *
 * Tests for list/table components and data display
 */

import { describe, test, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders, userEvent, createMockOrder, createMockCustomer } from '../utils';

// Mock OrdersTable Component
function OrdersTable({ orders, onView, onEdit, onDelete }) {
  if (orders.length === 0) {
    return <div data-testid="empty-state">No orders found</div>;
  }

  return (
    <table data-testid="orders-table">
      <thead>
        <tr>
          <th>Order #</th>
          <th>Customer</th>
          <th>Status</th>
          <th>Amount</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id} data-testid={`order-row-${order.id}`}>
            <td>{order.order_number}</td>
            <td>{order.customer_name}</td>
            <td>
              <span className={`badge status-${order.status}`}>
                {order.status}
              </span>
            </td>
            <td>₹{order.total_amount.toLocaleString()}</td>
            <td>
              <button onClick={() => onView(order.id)}>View</button>
              <button onClick={() => onEdit(order.id)}>Edit</button>
              <button onClick={() => onDelete(order.id)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Mock CustomersTable Component
function CustomersTable({ customers, onSelect }) {
  return (
    <div data-testid="customers-table">
      {customers.map((customer) => (
        <div
          key={customer.id}
          data-testid={`customer-card-${customer.id}`}
          onClick={() => onSelect(customer.id)}
          style={{ cursor: 'pointer', padding: '10px', border: '1px solid #ddd', margin: '5px' }}
        >
          <h3>{customer.name}</h3>
          <p>{customer.email}</p>
          <p>Credit: ₹{customer.credit_limit.toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}

// Mock SearchableList Component
function SearchableList({ items, onSearch, searchTerm }) {
  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div data-testid="searchable-list">
      <input
        type="text"
        placeholder="Search..."
        value={searchTerm}
        onChange={(e) => onSearch(e.target.value)}
        data-testid="search-input"
      />
      <div data-testid="results-count">
        Found {filteredItems.length} items
      </div>
      <ul>
        {filteredItems.map(item => (
          <li key={item.id} data-testid={`item-${item.id}`}>
            {item.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('OrdersTable Component', () => {
  const mockOrders = [
    createMockOrder({ id: '1', order_number: 'ORD001', customer_name: 'Customer 1', status: 'pending', total_amount: 1500 }),
    createMockOrder({ id: '2', order_number: 'ORD002', customer_name: 'Customer 2', status: 'confirmed', total_amount: 2500 }),
    createMockOrder({ id: '3', order_number: 'ORD003', customer_name: 'Customer 3', status: 'delivered', total_amount: 3500 })
  ];

  test('should render orders table with data', () => {
    renderWithProviders(
      <OrdersTable
        orders={mockOrders}
        onView={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.getByTestId('orders-table')).toBeInTheDocument();
    expect(screen.getByText('ORD001')).toBeInTheDocument();
    expect(screen.getByText('ORD002')).toBeInTheDocument();
    expect(screen.getByText('ORD003')).toBeInTheDocument();
  });

  test('should display all order details', () => {
    renderWithProviders(
      <OrdersTable
        orders={mockOrders}
        onView={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // Check first order details
    const firstRow = screen.getByTestId('order-row-1');
    expect(within(firstRow).getByText('ORD001')).toBeInTheDocument();
    expect(within(firstRow).getByText('Customer 1')).toBeInTheDocument();
    expect(within(firstRow).getByText('pending')).toBeInTheDocument();
    expect(within(firstRow).getByText('₹1,500')).toBeInTheDocument();
  });

  test('should show empty state when no orders', () => {
    renderWithProviders(
      <OrdersTable
        orders={[]}
        onView={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No orders found')).toBeInTheDocument();
  });

  test('should call onView when view button clicked', async () => {
    const handleView = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <OrdersTable
        orders={mockOrders}
        onView={handleView}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    const firstRow = screen.getByTestId('order-row-1');
    const viewButton = within(firstRow).getByText('View');

    await user.click(viewButton);

    expect(handleView).toHaveBeenCalledWith('1');
  });

  test('should call onEdit when edit button clicked', async () => {
    const handleEdit = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <OrdersTable
        orders={mockOrders}
        onView={() => {}}
        onEdit={handleEdit}
        onDelete={() => {}}
      />
    );

    const secondRow = screen.getByTestId('order-row-2');
    const editButton = within(secondRow).getByText('Edit');

    await user.click(editButton);

    expect(handleEdit).toHaveBeenCalledWith('2');
  });

  test('should call onDelete when delete button clicked', async () => {
    const handleDelete = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <OrdersTable
        orders={mockOrders}
        onView={() => {}}
        onEdit={() => {}}
        onDelete={handleDelete}
      />
    );

    const thirdRow = screen.getByTestId('order-row-3');
    const deleteButton = within(thirdRow).getByText('Delete');

    await user.click(deleteButton);

    expect(handleDelete).toHaveBeenCalledWith('3');
  });

  test('should render correct number of rows', () => {
    renderWithProviders(
      <OrdersTable
        orders={mockOrders}
        onView={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    const rows = screen.getAllByTestId(/^order-row-/);
    expect(rows).toHaveLength(3);
  });

  test('should display formatted amounts', () => {
    renderWithProviders(
      <OrdersTable
        orders={mockOrders}
        onView={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.getByText('₹1,500')).toBeInTheDocument();
    expect(screen.getByText('₹2,500')).toBeInTheDocument();
    expect(screen.getByText('₹3,500')).toBeInTheDocument();
  });
});

describe('CustomersTable Component', () => {
  const mockCustomers = [
    createMockCustomer({ id: '1', name: 'Customer 1', email: 'customer1@test.com', credit_limit: 100000 }),
    createMockCustomer({ id: '2', name: 'Customer 2', email: 'customer2@test.com', credit_limit: 50000 })
  ];

  test('should render customer cards', () => {
    renderWithProviders(
      <CustomersTable customers={mockCustomers} onSelect={() => {}} />
    );

    expect(screen.getByTestId('customer-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('customer-card-2')).toBeInTheDocument();
  });

  test('should display customer details', () => {
    renderWithProviders(
      <CustomersTable customers={mockCustomers} onSelect={() => {}} />
    );

    expect(screen.getByText('Customer 1')).toBeInTheDocument();
    expect(screen.getByText('customer1@test.com')).toBeInTheDocument();
    expect(screen.getByText('Credit: ₹1,00,000')).toBeInTheDocument();
  });

  test('should call onSelect when customer clicked', async () => {
    const handleSelect = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <CustomersTable customers={mockCustomers} onSelect={handleSelect} />
    );

    const card = screen.getByTestId('customer-card-2');
    await user.click(card);

    expect(handleSelect).toHaveBeenCalledWith('2');
  });
});

describe('SearchableList Component', () => {
  const mockItems = [
    { id: '1', name: 'Rose Plant' },
    { id: '2', name: 'Tulsi Plant' },
    { id: '3', name: 'Fern Plant' },
    { id: '4', name: 'Rose Bush' }
  ];

  test('should render search input', () => {
    renderWithProviders(
      <SearchableList items={mockItems} onSearch={() => {}} searchTerm="" />
    );

    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  test('should display all items when search is empty', () => {
    renderWithProviders(
      <SearchableList items={mockItems} onSearch={() => {}} searchTerm="" />
    );

    expect(screen.getByText('Found 4 items')).toBeInTheDocument();
    expect(screen.getByText('Rose Plant')).toBeInTheDocument();
    expect(screen.getByText('Tulsi Plant')).toBeInTheDocument();
    expect(screen.getByText('Fern Plant')).toBeInTheDocument();
    expect(screen.getByText('Rose Bush')).toBeInTheDocument();
  });

  test('should filter items based on search term', () => {
    renderWithProviders(
      <SearchableList items={mockItems} onSearch={() => {}} searchTerm="rose" />
    );

    expect(screen.getByText('Found 2 items')).toBeInTheDocument();
    expect(screen.getByText('Rose Plant')).toBeInTheDocument();
    expect(screen.getByText('Rose Bush')).toBeInTheDocument();
    expect(screen.queryByText('Tulsi Plant')).not.toBeInTheDocument();
    expect(screen.queryByText('Fern Plant')).not.toBeInTheDocument();
  });

  test('should call onSearch when typing', async () => {
    const handleSearch = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <SearchableList items={mockItems} onSearch={handleSearch} searchTerm="" />
    );

    const searchInput = screen.getByTestId('search-input');
    await user.type(searchInput, 'tulsi');

    expect(handleSearch).toHaveBeenCalled();
  });

  test('should show no results when search has no matches', () => {
    renderWithProviders(
      <SearchableList items={mockItems} onSearch={() => {}} searchTerm="xyz" />
    );

    expect(screen.getByText('Found 0 items')).toBeInTheDocument();
  });

  test('should be case insensitive', () => {
    renderWithProviders(
      <SearchableList items={mockItems} onSearch={() => {}} searchTerm="ROSE" />
    );

    expect(screen.getByText('Found 2 items')).toBeInTheDocument();
    expect(screen.getByText('Rose Plant')).toBeInTheDocument();
    expect(screen.getByText('Rose Bush')).toBeInTheDocument();
  });
});
