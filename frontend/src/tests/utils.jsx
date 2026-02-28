/**
 * Frontend Test Utilities
 * Phase 19 - Issue #95
 *
 * Helper functions for React component testing
 */

import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';

// Initialize i18n for tests
i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'common.save': 'Save',
        'common.cancel': 'Cancel',
        'common.delete': 'Delete',
        'common.edit': 'Edit',
        'auth.login': 'Login',
        'auth.logout': 'Logout'
      }
    }
  }
});

/**
 * Create mock Redux store
 * @param {Object} preloadedState - Initial state
 * @returns {Object} Mock store
 */
export function createMockStore(preloadedState = {}) {
  return configureStore({
    reducer: {
      auth: (state = preloadedState.auth || { user: null, token: null }, action) => state,
      orders: (state = preloadedState.orders || { orders: [], loading: false }, action) => state,
      customers: (state = preloadedState.customers || { customers: [], loading: false }, action) => state,
      products: (state = preloadedState.products || { products: [], loading: false }, action) => state
    },
    preloadedState
  });
}

/**
 * Render component with all providers
 * @param {ReactElement} ui - Component to render
 * @param {Object} options - Render options
 * @returns {Object} Render result
 */
export function renderWithProviders(
  ui,
  {
    preloadedState = {},
    store = createMockStore(preloadedState),
    ...renderOptions
  } = {}
) {
  function Wrapper({ children }) {
    return (
      <Provider store={store}>
        <BrowserRouter>
          <I18nextProvider i18n={i18n}>
            {children}
          </I18nextProvider>
        </BrowserRouter>
      </Provider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}

/**
 * Create mock user object
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock user
 */
export function createMockUser(overrides = {}) {
  return {
    id: 'user-123',
    email: 'test@example.com',
    fullName: 'Test User',
    roles: ['Admin'],
    ...overrides
  };
}

/**
 * Create mock order object
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock order
 */
export function createMockOrder(overrides = {}) {
  return {
    id: 'order-123',
    order_number: 'ORD001',
    customer_name: 'Test Customer',
    status: 'pending',
    total_amount: 1500,
    created_at: new Date().toISOString(),
    items: [],
    ...overrides
  };
}

/**
 * Create mock customer object
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock customer
 */
export function createMockCustomer(overrides = {}) {
  return {
    id: 'customer-123',
    name: 'Test Customer',
    email: 'customer@example.com',
    phone: '9876543210',
    credit_limit: 100000,
    credit_used: 0,
    ...overrides
  };
}

/**
 * Create mock product object
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock product
 */
export function createMockProduct(overrides = {}) {
  return {
    id: 'product-123',
    name: 'Test Plant',
    category: 'Flowering',
    description: 'Test description',
    is_active: true,
    ...overrides
  };
}

// Re-export testing library utilities
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
