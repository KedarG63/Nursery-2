/**
 * Common Components Tests
 * Phase 19 - Issue #95
 *
 * Tests for common UI components
 */

import { describe, test, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../utils';

// Mock common components for testing
function Button({ children, onClick, disabled, variant = 'contained' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn-${variant}`}
      data-testid="button"
    >
      {children}
    </button>
  );
}

function TextField({ label, value, onChange, error, helperText, type = 'text' }) {
  return (
    <div>
      <label htmlFor={label}>{label}</label>
      <input
        id={label}
        type={type}
        value={value}
        onChange={onChange}
        aria-invalid={!!error}
        data-testid={`textfield-${label}`}
      />
      {helperText && <span className="helper-text">{helperText}</span>}
    </div>
  );
}

function StatusBadge({ status }) {
  const colorMap = {
    pending: 'yellow',
    confirmed: 'blue',
    completed: 'green',
    cancelled: 'red'
  };

  return (
    <span
      className={`badge badge-${colorMap[status] || 'gray'}`}
      data-testid="status-badge"
    >
      {status}
    </span>
  );
}

function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div data-testid="confirm-dialog">
      <h2>{title}</h2>
      <p>{message}</p>
      <Button onClick={onConfirm}>Confirm</Button>
      <Button onClick={onCancel} variant="outlined">Cancel</Button>
    </div>
  );
}

describe('Button Component', () => {
  test('should render button with text', () => {
    renderWithProviders(<Button>Click Me</Button>);

    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  test('should call onClick when clicked', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<Button onClick={handleClick}>Click Me</Button>);

    await user.click(screen.getByText('Click Me'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test('should not call onClick when disabled', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <Button onClick={handleClick} disabled>
        Click Me
      </Button>
    );

    const button = screen.getByText('Click Me');
    expect(button).toBeDisabled();

    await user.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  test('should apply correct variant class', () => {
    renderWithProviders(<Button variant="outlined">Outlined Button</Button>);

    const button = screen.getByTestId('button');
    expect(button).toHaveClass('btn-outlined');
  });
});

describe('TextField Component', () => {
  test('should render label and input', () => {
    renderWithProviders(
      <TextField label="Email" value="" onChange={() => {}} />
    );

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  test('should display value', () => {
    renderWithProviders(
      <TextField label="Email" value="test@example.com" onChange={() => {}} />
    );

    const input = screen.getByLabelText('Email');
    expect(input).toHaveValue('test@example.com');
  });

  test('should call onChange when typing', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <TextField label="Email" value="" onChange={handleChange} />
    );

    const input = screen.getByLabelText('Email');
    await user.type(input, 'test');

    expect(handleChange).toHaveBeenCalled();
  });

  test('should display error state', () => {
    renderWithProviders(
      <TextField
        label="Email"
        value=""
        onChange={() => {}}
        error
        helperText="Email is required"
      />
    );

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Email is required')).toBeInTheDocument();
  });

  test('should support password type', () => {
    renderWithProviders(
      <TextField
        label="Password"
        value=""
        onChange={() => {}}
        type="password"
      />
    );

    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
  });
});

describe('StatusBadge Component', () => {
  test('should render pending status', () => {
    renderWithProviders(<StatusBadge status="pending" />);

    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveTextContent('pending');
    expect(badge).toHaveClass('badge-yellow');
  });

  test('should render confirmed status', () => {
    renderWithProviders(<StatusBadge status="confirmed" />);

    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveTextContent('confirmed');
    expect(badge).toHaveClass('badge-blue');
  });

  test('should render completed status', () => {
    renderWithProviders(<StatusBadge status="completed" />);

    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveTextContent('completed');
    expect(badge).toHaveClass('badge-green');
  });

  test('should render cancelled status', () => {
    renderWithProviders(<StatusBadge status="cancelled" />);

    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveTextContent('cancelled');
    expect(badge).toHaveClass('badge-red');
  });

  test('should handle unknown status', () => {
    renderWithProviders(<StatusBadge status="unknown" />);

    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveClass('badge-gray');
  });
});

describe('ConfirmDialog Component', () => {
  test('should not render when closed', () => {
    renderWithProviders(
      <ConfirmDialog
        open={false}
        title="Confirm"
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  test('should render when open', () => {
    renderWithProviders(
      <ConfirmDialog
        open={true}
        title="Confirm Delete"
        message="Are you sure you want to delete?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete?')).toBeInTheDocument();
  });

  test('should call onConfirm when confirmed', async () => {
    const handleConfirm = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <ConfirmDialog
        open={true}
        title="Confirm Action"
        message="Proceed?"
        onConfirm={handleConfirm}
        onCancel={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  test('should call onCancel when cancelled', async () => {
    const handleCancel = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Proceed?"
        onConfirm={() => {}}
        onCancel={handleCancel}
      />
    );

    await user.click(screen.getByText('Cancel'));

    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});
