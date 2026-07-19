import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import LoginForm from './components/auth/LoginForm';
import Dashboard from './pages/Dashboard';
import Room from './pages/Room';
import Landing from './pages/Landing';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }
  // Save the intended destination so PublicRoute can restore it after login
  return user ? children : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  // After login, send the user back to where they were trying to go
  const dest = location.state?.from || '/dashboard';
  return user ? <Navigate to={dest} replace /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginForm />
              </PublicRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/room/:roomId"
            element={
              <ProtectedRoute>
                <Room />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
