import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import NewOrder from './pages/NewOrder';
import ApiConfig from './pages/ApiConfig';
import Checkout from './pages/Checkout';
import History from './pages/History';
import Account from './pages/Account';
import Notifications from './pages/Notifications';
import Login from './pages/Login';
import Register from './pages/Register';
import HomeLanding from './pages/HomeLanding';
import AddFunds from './pages/AddFunds';
import Admin from './pages/Admin';
import AdminSupport from './pages/admin/AdminSupport';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import SupportWidget from './components/SupportWidget';
import CheckoutSuccess from './pages/CheckoutSuccess';
import AdminOrders from './pages/admin/AdminOrders';


// Loading Component
const LoadingScreen = () => (
  <div className="flex h-screen w-full items-center justify-center bg-background-dark text-white">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
  </div>
);

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};



// Admin Route Component
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAdmin(session?.user.email === 'brunomeueditor@gmail.com');
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingScreen />;

  if (!session || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background-light dark:bg-background-dark">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex-1 flex flex-col relative w-full">
        <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="flex-1 p-4 md:p-6 pb-32">
          {children}
        </main>
        <SupportWidget />
      </div>
    </div>
  );
};

const LayoutHandler: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<HomeLanding />} />
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />

      {/* Protected Routes */}
      <Route path="/checkout" element={
        <ProtectedRoute>
          <Checkout />
        </ProtectedRoute>
      } />

      <Route path="/checkout/success" element={
        <ProtectedRoute>
          <CheckoutSuccess />
        </ProtectedRoute>
      } />

      <Route path="*" element={
        <ProtectedRoute>
          <MainLayout>
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/new-order" element={<NewOrder />} />
              <Route path="/add-funds" element={<AddFunds />} />
              <Route path="/history" element={<History />} />
              <Route path="/account" element={<Account />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/admin/*" element={
                <AdminRoute>
                  <Routes>
                    <Route path="/" element={<Admin />} />
                    <Route path="/config" element={<ApiConfig />} />
                    <Route path="/support" element={<AdminSupport />} />
                    <Route path="/orders" element={<AdminOrders />} />
                  </Routes>
                </AdminRoute>
              } />
              <Route path="/services" element={<div className="p-10 text-center text-text-secondary">Página de Serviços (Em construção)</div>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </MainLayout>
        </ProtectedRoute>
      } />
    </Routes>
  );
};

export default function App() {
  return (
    <HashRouter>
      <LayoutHandler />
    </HashRouter>
  );
}