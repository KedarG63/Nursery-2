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
];

export default menuItems;
