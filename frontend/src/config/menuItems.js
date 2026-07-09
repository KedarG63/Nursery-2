import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DashboardIcon from '@mui/icons-material/Dashboard';
import InventoryIcon from '@mui/icons-material/Inventory';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PeopleIcon from '@mui/icons-material/People';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PaymentIcon from '@mui/icons-material/Payment';
import CategoryIcon from '@mui/icons-material/Category';
import LabelIcon from '@mui/icons-material/Label';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import DescriptionIcon from '@mui/icons-material/Description';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PaymentsIcon from '@mui/icons-material/Payments';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import SavingsIcon from '@mui/icons-material/Savings';
import GrassIcon from '@mui/icons-material/Grass';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import MoveDownIcon from '@mui/icons-material/MoveDown';
import GroupsIcon from '@mui/icons-material/Groups';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import PaymentsIcon2 from '@mui/icons-material/Payments';
import PaidIcon from '@mui/icons-material/Paid';
import AssessmentIcon from '@mui/icons-material/Assessment';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import InsightsIcon from '@mui/icons-material/Insights';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

/**
 * Sidebar navigation.
 *
 * The pre-existing tabs stay FLAT and in their familiar order (rendered under
 * `pinned` groups, which have no header). Only the newly-added Accounting and
 * Payroll tabs are placed in collapsible groups so they don't lengthen the list.
 *
 * Every item keeps id / label / labelKey / icon / path / roles / hidden.
 * A group renders only if the user can see at least one of its items.
 */
const menuGroups = [
  {
    // Familiar tabs — flat, unchanged order.
    id: 'main',
    pinned: true,
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        labelKey: 'nav.dashboard',
        icon: DashboardIcon,
        path: '/',
        roles: ['Admin', 'Manager', 'Sales', 'Warehouse', 'Delivery'],
      },
      {
        id: 'products',
        label: 'Products',
        labelKey: 'nav.products',
        icon: CategoryIcon,
        path: '/products',
        roles: ['Admin', 'Manager', 'Warehouse'],
      },
      {
        id: 'skus',
        label: 'Product Varieties',
        labelKey: 'nav.skus',
        icon: LabelIcon,
        path: '/skus',
        roles: ['Admin', 'Manager', 'Warehouse'],
      },
      {
        id: 'inventory',
        label: 'Inventory',
        labelKey: 'nav.inventory',
        icon: InventoryIcon,
        path: '/inventory',
        roles: ['Admin', 'Manager', 'Warehouse'],
      },
      {
        id: 'purchases',
        label: 'Purchases',
        labelKey: 'nav.purchases',
        icon: ShoppingBagIcon,
        path: '/purchases',
        roles: ['Admin', 'Manager', 'Warehouse'],
      },
      {
        id: 'orders',
        label: 'Orders',
        labelKey: 'nav.orders',
        icon: ShoppingCartIcon,
        path: '/orders',
        roles: ['Admin', 'Manager', 'Sales'],
      },
      {
        id: 'service-orders',
        label: 'Service Orders',
        labelKey: 'nav.serviceOrders',
        icon: GrassIcon,
        path: '/service-orders',
        roles: ['Admin', 'Manager', 'Sales'],
      },
      {
        id: 'customers',
        label: 'Customers',
        labelKey: 'nav.customers',
        icon: PeopleIcon,
        path: '/customers',
        roles: ['Admin', 'Manager', 'Sales'],
      },
      {
        id: 'payments',
        label: 'Payments',
        labelKey: 'nav.payments',
        icon: PaymentIcon,
        path: '/payments',
        roles: ['Admin', 'Manager'],
      },
      {
        id: 'billing-invoices',
        label: 'Invoices',
        labelKey: 'nav.invoices',
        icon: RequestQuoteIcon,
        path: '/billing/invoices',
        roles: ['Admin', 'Manager', 'Sales'],
      },
      {
        id: 'billing-vendor-bills',
        label: 'Vendor Bills',
        labelKey: 'nav.vendorBills',
        icon: DescriptionIcon,
        path: '/billing/vendor-bills',
        roles: ['Admin', 'Manager'],
      },
      {
        id: 'billing-ar-aging',
        label: 'AR Aging',
        labelKey: 'nav.arAging',
        icon: AccountBalanceIcon,
        path: '/billing/reports/ar-aging',
        roles: ['Admin', 'Manager'],
      },
      {
        id: 'billing-ap-aging',
        label: 'AP Aging',
        labelKey: 'nav.apAging',
        icon: PaymentsIcon,
        path: '/billing/reports/ap-aging',
        roles: ['Admin', 'Manager'],
      },
      {
        id: 'deliveries',
        label: 'Deliveries',
        labelKey: 'nav.deliveries',
        icon: LocalShippingIcon,
        path: '/deliveries',
        roles: ['Admin', 'Manager', 'Delivery'],
        hidden: true, // Set to false to show in sidebar
      },
      {
        id: 'banking',
        label: 'Bank Ledger',
        labelKey: 'nav.banking',
        icon: SavingsIcon,
        path: '/banking',
        roles: ['Admin', 'Manager', 'Accountant'],
      },
    ],
  },
  {
    // NEW — collapsible.
    id: 'accounting',
    titleKey: 'navGroups.accounting',
    items: [
      {
        id: 'accounting-overview',
        label: 'Finance Overview',
        labelKey: 'nav.financeOverview',
        icon: InsightsIcon,
        path: '/accounting/overview',
        roles: ['Admin', 'Manager', 'Accountant'],
      },
      {
        id: 'accounting-profit-loss',
        label: 'Profit & Loss',
        labelKey: 'nav.profitLoss',
        icon: TrendingUpIcon,
        path: '/accounting/profit-loss',
        roles: ['Admin', 'Manager', 'Accountant'],
      },
      {
        id: 'accounting-expenses',
        label: 'Expenses',
        labelKey: 'nav.expenses',
        icon: ReceiptLongIcon,
        path: '/accounting/expenses',
        roles: ['Admin', 'Manager', 'Accountant'],
      },
      {
        id: 'accounting-cash-book',
        label: 'Cash Book',
        labelKey: 'nav.cashBook',
        icon: AccountBalanceWalletIcon,
        path: '/accounting/cash-book',
        roles: ['Admin', 'Manager', 'Accountant'],
      },
      {
        id: 'accounting-deposits',
        label: 'Cash Deposits',
        labelKey: 'nav.deposits',
        icon: MoveDownIcon,
        path: '/accounting/deposits',
        roles: ['Admin', 'Manager', 'Accountant'],
      },
    ],
  },
  {
    // NEW — collapsible.
    id: 'payroll',
    titleKey: 'navGroups.payroll',
    items: [
      {
        id: 'payroll-employees',
        label: 'Employees',
        labelKey: 'nav.employees',
        icon: GroupsIcon,
        path: '/payroll/employees',
        roles: ['Admin', 'Manager', 'Accountant'],
      },
      {
        id: 'payroll-attendance',
        label: 'Attendance',
        labelKey: 'nav.attendance',
        icon: EventAvailableIcon,
        path: '/payroll/attendance',
        roles: ['Admin', 'Manager', 'Accountant'],
      },
      {
        id: 'payroll-runs',
        label: 'Payroll',
        labelKey: 'nav.payroll',
        icon: PaymentsIcon2,
        path: '/payroll/runs',
        roles: ['Admin', 'Manager', 'Accountant'],
      },
      {
        id: 'payroll-advances',
        label: 'Advances',
        labelKey: 'nav.advances',
        icon: PaidIcon,
        path: '/payroll/advances',
        roles: ['Admin', 'Manager', 'Accountant'],
      },
    ],
  },
  {
    // NEW — collapsible. Routes existed but were never linked in the sidebar.
    id: 'reports',
    titleKey: 'navGroups.reports',
    items: [
      {
        id: 'reports-sales',
        label: 'Sales Dashboard',
        labelKey: 'nav.salesReports',
        icon: AssessmentIcon,
        path: '/reports/sales',
        roles: ['Admin', 'Manager', 'Sales'],
      },
      {
        id: 'reports-inventory',
        label: 'Inventory Reports',
        labelKey: 'nav.inventoryReports',
        icon: Inventory2Icon,
        path: '/reports/inventory',
        roles: ['Admin', 'Manager', 'Sales'],
      },
    ],
  },
  {
    // Familiar tabs — flat, kept at the bottom.
    id: 'admin',
    pinned: true,
    items: [
      {
        id: 'trash',
        label: 'Trash',
        labelKey: 'nav.trash',
        icon: DeleteSweepIcon,
        path: '/trash',
        roles: ['Admin', 'Manager'],
      },
      {
        id: 'users',
        label: 'Users',
        labelKey: 'nav.users',
        icon: ManageAccountsIcon,
        path: '/users',
        roles: ['Admin'],
      },
    ],
  },
];

export default menuGroups;
