import { createBrowserRouter } from 'react-router';
import { RequireAuth } from '@/components/require-auth';
import { HomePage } from '@/routes/home';
import { LoginPage } from '@/routes/login';
import { ProductsPage } from '@/routes/products';
import { PurchaseOrdersPage } from '@/routes/purchase-orders';
import { RootLayout } from '@/routes/root-layout';
import { StoresPage } from '@/routes/stores';
import { SuppliersPage } from '@/routes/suppliers';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    // Everything below requires a signed-in user.
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <RootLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'master-data/stores', element: <StoresPage /> },
          { path: 'master-data/suppliers', element: <SuppliersPage /> },
          { path: 'master-data/products', element: <ProductsPage /> },
          { path: 'purchase-orders', element: <PurchaseOrdersPage /> },
        ],
      },
    ],
  },
]);
