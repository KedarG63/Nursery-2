/**
 * Form Components Tests
 * Phase 19 - Issue #95
 *
 * Tests for form handling and validation
 */

import { describe, test, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../utils';
import { useState } from 'react';

// Mock Login Form Component
function LoginForm({ onSubmit }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (!email) newErrors.email = 'Email is required';
    if (!password) newErrors.password = 'Password is required';
    if (email && !/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Email is invalid';
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validate();

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      await onSubmit({ email, password });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="login-form">
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="email-input"
        />
        {errors.email && <span className="error">{errors.email}</span>}
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="password-input"
        />
        {errors.password && <span className="error">{errors.password}</span>}
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}

// Mock Order Form Component
function OrderForm({ onSubmit, customers = [] }) {
  const [formData, setFormData] = useState({
    customer_id: '',
    delivery_date: '',
    notes: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} data-testid="order-form">
      <div>
        <label htmlFor="customer">Customer</label>
        <select
          id="customer"
          value={formData.customer_id}
          onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
          data-testid="customer-select"
        >
          <option value="">Select Customer</option>
          {customers.map(customer => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="delivery_date">Delivery Date</label>
        <input
          id="delivery_date"
          type="date"
          value={formData.delivery_date}
          onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
          data-testid="delivery-date-input"
        />
      </div>

      <div>
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          data-testid="notes-textarea"
        />
      </div>

      <button type="submit">Create Order</button>
    </form>
  );
}

describe('LoginForm Component', () => {
  test('should render login form fields', () => {
    renderWithProviders(<LoginForm onSubmit={() => {}} />);

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  test('should update email field when typing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm onSubmit={() => {}} />);

    const emailInput = screen.getByLabelText('Email');
    await user.type(emailInput, 'test@example.com');

    expect(emailInput).toHaveValue('test@example.com');
  });

  test('should update password field when typing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm onSubmit={() => {}} />);

    const passwordInput = screen.getByLabelText('Password');
    await user.type(passwordInput, 'password123');

    expect(passwordInput).toHaveValue('password123');
  });

  test('should show validation errors when submitting empty form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm onSubmit={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
  });

  test('should not submit form with invalid email', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'invalid-email');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    // Main assertion: should not submit with invalid email
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  test('should submit form with valid data', async () => {
    const handleSubmit = vi.fn().mockResolvedValue({});
    const user = userEvent.setup();

    renderWithProviders(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
    });
  });

  test('should show loading state during submission', async () => {
    const handleSubmit = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
    const user = userEvent.setup();

    renderWithProviders(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(screen.getByText('Logging in...')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
  });

  test('should not submit when validation fails', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<LoginForm onSubmit={handleSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });
});

describe('OrderForm Component', () => {
  const mockCustomers = [
    { id: '1', name: 'Customer 1' },
    { id: '2', name: 'Customer 2' },
    { id: '3', name: 'Customer 3' }
  ];

  test('should render order form fields', () => {
    renderWithProviders(<OrderForm onSubmit={() => {}} customers={mockCustomers} />);

    expect(screen.getByLabelText('Customer')).toBeInTheDocument();
    expect(screen.getByLabelText('Delivery Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
  });

  test('should render customer options', () => {
    renderWithProviders(<OrderForm onSubmit={() => {}} customers={mockCustomers} />);

    expect(screen.getByRole('option', { name: 'Select Customer' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Customer 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Customer 2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Customer 3' })).toBeInTheDocument();
  });

  test('should select customer from dropdown', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderForm onSubmit={() => {}} customers={mockCustomers} />);

    const customerSelect = screen.getByLabelText('Customer');
    await user.selectOptions(customerSelect, '2');

    expect(customerSelect).toHaveValue('2');
  });

  test('should update delivery date', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderForm onSubmit={() => {}} customers={mockCustomers} />);

    const dateInput = screen.getByLabelText('Delivery Date');
    await user.type(dateInput, '2025-11-01');

    expect(dateInput).toHaveValue('2025-11-01');
  });

  test('should update notes textarea', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderForm onSubmit={() => {}} customers={mockCustomers} />);

    const notesTextarea = screen.getByLabelText('Notes');
    await user.type(notesTextarea, 'Special delivery instructions');

    expect(notesTextarea).toHaveValue('Special delivery instructions');
  });

  test('should submit form with correct data', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<OrderForm onSubmit={handleSubmit} customers={mockCustomers} />);

    await user.selectOptions(screen.getByLabelText('Customer'), '1');
    await user.type(screen.getByLabelText('Delivery Date'), '2025-11-01');
    await user.type(screen.getByLabelText('Notes'), 'Test notes');
    await user.click(screen.getByRole('button', { name: 'Create Order' }));

    expect(handleSubmit).toHaveBeenCalledWith({
      customer_id: '1',
      delivery_date: '2025-11-01',
      notes: 'Test notes'
    });
  });

  test('should handle empty customers array', () => {
    renderWithProviders(<OrderForm onSubmit={() => {}} customers={[]} />);

    const customerSelect = screen.getByLabelText('Customer');
    const options = customerSelect.querySelectorAll('option');

    expect(options).toHaveLength(1); // Only "Select Customer" option
  });
});
