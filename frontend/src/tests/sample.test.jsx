/**
 * Sample Frontend Test
 * Verify React Testing Library setup
 */

import { describe, test, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './utils';

// Simple test component
function TestComponent() {
  return (
    <div>
      <h1>Test Component</h1>
      <p>Testing setup is working</p>
    </div>
  );
}

describe('Sample Test', () => {
  test('should render test component', () => {
    renderWithProviders(<TestComponent />);

    expect(screen.getByText('Test Component')).toBeInTheDocument();
    expect(screen.getByText('Testing setup is working')).toBeInTheDocument();
  });

  test('should pass basic assertions', () => {
    expect(1 + 1).toBe(2);
    expect(true).toBe(true);
  });
});
