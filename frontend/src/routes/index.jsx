import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';

import PrivateRoute from '../utils/PrivateRoute';
import AppLayout from '../components/Layout/AppLayout';
import Login from '../pages/Login/Login';
import Dashboard from '../pages/Dashboard/Dashboard';
import ProductsList from '../pages/Products/ProductsList';
import SKUsList from '../pages/SKUs/SKUsList';
import InventoryDashboard from '../pages/Inventory/InventoryDashboard';
import LotsList from '../pages/Inventory/LotsList';
import LotScanner from '../pages/Inventory/LotScanner';
import LotTraceability from '../pages/Inventory/LotTraceability';
import PurchasesList from '../pages/Purchases/PurchasesList';
import VendorsList from '../pages/Purchases/VendorsList';
import CustomersList from '../pages/Customers/CustomersList';
import CustomerDetails from '../pages/Customers/CustomerDetails';
import OrdersList from '../pages/Orders/OrdersList';
import CreateOrder from '../pages/Orders/CreateOrder';
import OrderDetails from '../pages/Orders/OrderDetails';
import PaymentsList from '../pages/Payments/PaymentsList';
import CustomerPayments from '../pages/Payments/CustomerPayments';
import SalesDashboard from '../pages/Reports/SalesDashboard';
import InventoryReports from '../pages/Reports/InventoryReports';
import DeliveryReports from '../pages/Reports/DeliveryReports';
import DeliveryManagement from '../pages/Deliveries/DeliveryManagement';
import VehicleManagement from '../pages/Deliveries/VehicleManagement';
import RouteManagement from '../pages/Deliveries/RouteManagement';
import CreateRoute from '../pages/Deliveries/CreateRoute';
import DriversManagement from '../pages/Deliveries/DriversManagement';
import LiveTracking from '../pages/Deliveries/LiveTracking';
import UsersList from '../pages/Users/UsersList';
import InvoicesList from '../pages/Billing/InvoicesList';
import InvoiceDetails from '../pages/Billing/InvoiceDetails';
import CreateInvoice from '../pages/Billing/CreateInvoice';
import VendorBillsList from '../pages/Billing/VendorBillsList';
import VendorBillDetails from '../pages/Billing/VendorBillDetails';
import CustomerAgingReport from '../pages/Billing/CustomerAgingReport';
import VendorAgingReport from '../pages/Billing/VendorAgingReport';
import BankAccountsPage from '../pages/Banking/BankAccountsPage';
import BankLedgerPage from '../pages/Banking/BankLedgerPage';
import BankMonthlySummaryPage from '../pages/Banking/BankMonthlySummaryPage';
import TrashPage from '../pages/Trash/TrashPage';

const AppRoutes = () => {
  const { isAuthenticated } = useSelector((state) => state.auth);

  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="dashboard" element={<Dashboard />} />

        {/* Products & SKUs */}
        <Route path="products" element={<ProductsList />} />
        <Route path="skus" element={<SKUsList />} />

        {/* Inventory */}
        <Route path="inventory" element={<InventoryDashboard />} />
        <Route path="inventory/lots" element={<LotsList />} />
        <Route path="inventory/lots/scan" element={<LotScanner />} />
        <Route path="inventory/lots/:lotId/traceability" element={<LotTraceability />} />

        {/* Purchases */}
        <Route path="purchases" element={<Navigate to="/purchases/list" replace />} />
        <Route path="purchases/list" element={<PurchasesList />} />
        <Route path="purchases/vendors" element={<VendorsList />} />

        {/* Customers */}
        <Route path="customers" element={<CustomersList />} />
        <Route path="customers/:id" element={<CustomerDetails />} />

        {/* Orders */}
        <Route path="orders" element={<OrdersList />} />
        <Route path="orders/create" element={<CreateOrder />} />
        <Route path="orders/:id" element={<OrderDetails />} />

        {/* Payments */}
        <Route path="payments" element={<PaymentsList />} />
        <Route path="payments/customer/:id" element={<CustomerPayments />} />

        {/* Reports */}
        <Route path="reports" element={<Navigate to="/reports/sales" replace />} />
        <Route path="reports/sales" element={<SalesDashboard />} />
        <Route path="reports/inventory" element={<InventoryReports />} />
        <Route path="reports/delivery" element={<DeliveryReports />} />

        {/* Deliveries */}
        <Route path="deliveries" element={<DeliveryManagement />} />
        <Route path="deliveries/drivers" element={<DriversManagement />} />
        <Route path="deliveries/vehicles" element={<VehicleManagement />} />
        <Route path="deliveries/routes" element={<RouteManagement />} />
        <Route path="deliveries/routes/create" element={<CreateRoute />} />
        <Route path="deliveries/tracking" element={<LiveTracking />} />

        {/* User Management */}
        <Route path="users" element={<UsersList />} />

        {/* Billing */}
        <Route path="billing" element={<Navigate to="/billing/invoices" replace />} />
        <Route path="billing/invoices" element={<InvoicesList />} />
        <Route path="billing/invoices/create" element={<CreateInvoice />} />
        <Route path="billing/invoices/:id" element={<InvoiceDetails />} />
        <Route path="billing/vendor-bills" element={<VendorBillsList />} />
        <Route path="billing/vendor-bills/:id" element={<VendorBillDetails />} />
        <Route path="billing/reports/ar-aging" element={<CustomerAgingReport />} />
        <Route path="billing/reports/ap-aging" element={<VendorAgingReport />} />

        {/* Banking / Bank Ledger */}
        <Route path="banking" element={<BankAccountsPage />} />
        <Route path="banking/:id/ledger" element={<BankLedgerPage />} />
        <Route path="banking/:id/summary" element={<BankMonthlySummaryPage />} />

        {/* Trash / Recycle Bin */}
        <Route path="trash" element={<TrashPage />} />
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
