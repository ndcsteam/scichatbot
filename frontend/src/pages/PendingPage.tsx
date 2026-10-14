import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { homePath } from "../components/RequireAuth";

export function PendingPage() {
  const { role, profile, signOutUser } = useAuth();
  if (role && role !== "pending") return <Navigate to={homePath(role)} replace />;

  return (
    <Layout>
      <section className="panel narrow">
        <p className="eyebrow">帳號已建立</p>
        <h1>等待管理員指派角色</h1>
        <p>
          {profile?.displayName || "你"}（{profile?.email}）已用學校 Google 帳號登入。管理員把你設為老師或學生後，重新整理此頁即可進入。
        </p>
        <button type="button" className="button secondary" onClick={() => void signOutUser()}>
          登出
        </button>
      </section>
    </Layout>
  );
}
