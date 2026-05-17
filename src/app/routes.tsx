import { createBrowserRouter } from 'react-router';
import { Landing } from './pages/Landing';
import { Auth } from './pages/Auth';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { AssetDetailWrapper } from './pages/AssetDetailWrapper';
import { Profile } from './pages/Profile';
import { Desk } from './pages/Desk';
import { EnterpriseLogin } from './pages/EnterpriseLogin';
import { EnterpriseDashboard } from './pages/EnterpriseDashboard';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Landing />,
  },
  {
    path: '/auth',
    element: <Auth />,
  },
  {
    path: '/enterprise-login',
    element: <EnterpriseLogin />,
  },
  {
    path: '/enterprise-dashboard',
    element: <EnterpriseDashboard />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: 'home',
        element: <Home />,
      },
      {
        path: 'library',
        element: <Library />,
      },
      {
        path: 'asset/:id',
        element: <AssetDetailWrapper />,
      },
      {
        path: 'profile',
        element: <Profile />,
      },
      {
        path: 'desk',
        element: <Desk />,
      },
    ],
  },
]);