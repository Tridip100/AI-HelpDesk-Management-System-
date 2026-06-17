import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";

import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";

// USER
import UserDashboard from "./pages/user/Dashboard";
import ChatView from "./pages/user/ChatView";
import EmailView from "./pages/user/EmailView";
import TicketsView from "./pages/user/TicketsView";

// HELPDESK
import HelpdeskDashboard from "./pages/helpdesk/Dashboard";
import HelpdeskAnalytics from "./pages/helpdesk/Analytics";

// ENGINEER
import EngineerDashboard from "./pages/engineer/Dashboard";

// ADMIN
import AdminDashboard from "./pages/admin/Dashboard";
import AdminAllTickets from "./pages/admin/AllTickets";
import AdminUserManagement from "./pages/admin/UserManagement";
import AdminAnalytics from "./pages/admin/Analytics";

function RoleDashboard() {
  const { user } = useAuth();

  switch (user?.role) {
    case "helpdesk":
      return <HelpdeskDashboard />;

    case "engineer":
      return <EngineerDashboard />;

    case "admin":
      return <AdminDashboard />;

    default:
      return <UserDashboard />;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>

        <Routes>

          {/* LOGIN */}
          <Route
            path="/login"
            element={<Login />}
          />

          {/* PROTECTED */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >

            {/* DASHBOARD BY ROLE */}
            <Route
              path="/"
              element={<RoleDashboard />}
            />

            {/* ========================= */}
            {/* USER ROUTES */}
            {/* ========================= */}

            <Route
              path="/user/chat"
              element={<ChatView />}
            />

            <Route
              path="/user/voice"
              element={<ChatView mode="voice" />}
            />

            <Route
              path="/user/email"
              element={<EmailView />}
            />

            <Route
              path="/user/tickets"
              element={<TicketsView />}
            />

            {/* ========================= */}
            {/* HELPDESK ROUTES */}
            {/* ========================= */}

            <Route
              path="/helpdesk/analytics"
              element={<HelpdeskAnalytics />}
            />

            {/* ========================= */}
            {/* ADMIN ROUTES */}
            {/* ========================= */}

            <Route
              path="/admin/tickets"
              element={<AdminAllTickets />}
            />

            <Route
              path="/admin/users"
              element={<AdminUserManagement />}
            />

            <Route
              path="/admin/analytics"
              element={<AdminAnalytics />}
            />

          </Route>

          {/* FALLBACK */}
          <Route
            path="*"
            element={<Navigate to="/" />}
          />

        </Routes>

      </AuthProvider>
    </BrowserRouter>
  );
}