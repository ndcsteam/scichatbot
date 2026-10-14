import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { LoadingScreen } from "./components/Layout";
import { homePath, RequireAuth, RequireRole } from "./components/RequireAuth";
import { AdminBotsPage } from "./pages/AdminBotsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { LoginPage } from "./pages/LoginPage";
import { PendingPage } from "./pages/PendingPage";
import { StudentChatPage } from "./pages/StudentChatPage";
import { StudentHomePage } from "./pages/StudentHomePage";
import { TeacherBotPage } from "./pages/TeacherBotPage";
import { TeacherHomePage } from "./pages/TeacherHomePage";

function HomeRedirect() {
  const { ready, user, role } = useAuth();
  if (!ready) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!role) return <LoadingScreen />;
  return <Navigate to={homePath(role)} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/pending"
        element={
          <RequireAuth>
            <PendingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireRole role="admin">
            <AdminUsersPage />
          </RequireRole>
        }
      />
      <Route
        path="/admin/bots"
        element={
          <RequireRole role="admin">
            <AdminBotsPage />
          </RequireRole>
        }
      />
      <Route
        path="/teacher"
        element={
          <RequireRole role="teacher">
            <TeacherHomePage />
          </RequireRole>
        }
      />
      <Route
        path="/teacher/bots/:botId"
        element={
          <RequireRole role="teacher">
            <TeacherBotPage />
          </RequireRole>
        }
      />
      <Route
        path="/student"
        element={
          <RequireRole role="student">
            <StudentHomePage />
          </RequireRole>
        }
      />
      <Route
        path="/student/bots/:botId"
        element={
          <RequireRole role="student">
            <StudentChatPage />
          </RequireRole>
        }
      />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
