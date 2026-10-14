import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { allowedDomain } from "../firebase";
import { LoadingScreen } from "../components/Layout";
import { homePath } from "../components/RequireAuth";

export function LoginPage() {
  const { ready, configured, user, role, error, signIn } = useAuth();
  if (!ready) return <LoadingScreen />;
  if (user && role) return <Navigate to={homePath(role)} replace />;

  return (
    <div className="login-screen">
      <section className="login-card">
        <p className="eyebrow">學校科學對話平台</p>
        <h1>SciChatbot</h1>
        <p className="lede">
          老師開設聊天機械人，設定提示詞與參考資料。學生用自己的學校 Google 帳號，各自與機械人對話。
        </p>
        {configured ? (
          <p className="domain-note">只接受 @{allowedDomain}</p>
        ) : (
          <p className="notice">請先在 frontend/.env 填入 Firebase 設定與 VITE_ALLOWED_GOOGLE_DOMAIN。</p>
        )}
        {error ? <p className="notice">{error}</p> : null}
        <button type="button" className="button" disabled={!configured} onClick={() => void signIn()}>
          使用學校 Google 帳號登入
        </button>
      </section>
    </div>
  );
}
