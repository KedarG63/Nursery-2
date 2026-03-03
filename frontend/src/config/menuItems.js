import DashboardIcon from '@mui/icons-material/Dashboard';
import InventoryIcon from '@mui/icons-material/Inventory';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PeopleIcon from '@mui/icons-material/People';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PaymentIcon from '@mui/icons-material/Payment';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CategoryIcon from '@mui/icons-material/Category';
import LabelIcon from '@mui/icons-material/Label';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import DescriptionIcon from '@mui/icons-material/Description';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PaymentsIcon from '@mui/icons-material/Payments';

const menuItems = [
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
    label: 'SKUs',
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
    id: 'customers',
    label: 'Customers',
    labelKey: 'nav.customers',
    icon: PeopleIcon,
    path: '/customers',
    roles: ['Admin', 'Manager', 'Sales'],
  },
  {
    id: 'deliveries',
    label: 'Deliveries',
    labelKey: 'nav.deliveries',
    icon: LocalShippingIcon,
    path: '/deliveries',
    roles: ['Admin', 'Manager', 'Delivery'],
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
    id: 'reports',
    label: 'Reports',
    labelKey: 'nav.reports',
    icon: AssessmentIcon,
    path: '/reports',
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
];

export default menuItems;
