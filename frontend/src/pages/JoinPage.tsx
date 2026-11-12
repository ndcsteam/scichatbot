import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout, LoadingScreen } from "../components/Layout";
import { homePath } from "../components/RequireAuth";
import { clearAfterLogin, rememberAfterLogin } from "../lib/afterLogin";
import { joinWithLink } from "../lib/callables";
import { errorText } from "../lib/format";

export function JoinPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { ready, user, role, refreshRole } = useAuth();
  const [error, setError] = useState("");
  const startedFor = useRef("");

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      rememberAfterLogin(`/join/${token}`);
      navigate("/login", { replace: true });
      return;
    }
    if (!role) return;
    if (role === "teacher" || role === "admin") {
      clearAfterLogin();
      setError("老師和管理員帳號不能以學生身分加入聊天機械人。請用學生的學校 Google 帳號開啟這個連結。");
      return;
    }
    if (startedFor.current === token) return;
    startedFor.current = token;
    void (async () => {
      try {
        const result = await joinWithLink(token);
        clearAfterLogin();
        if (result.promoted) await refreshRole();
        navigate(`/student/bots/${result.botId}`, { replace: true });
      } catch (caught) {
        clearAfterLogin();
        setError(errorText(caught));
      }
    })();
  }, [navigate, ready, refreshRole, role, token, user]);

  if (!ready || !user) return <LoadingScreen />;

  return (
    <Layout>
      <section className="panel narrow stack">
        <p className="eyebrow">加入聊天機械人</p>
        {error ? (
          <>
            <h1>無法加入</h1>
            <p className="notice">{error}</p>
            <p>
              <Link to={homePath(role)}>回到首頁</Link>
            </p>
          </>
        ) : (
          <>
            <h1>正在加入…</h1>
            <p className="muted">加入完成後會自動打開聊天機械人。</p>
          </>
        )}
      </section>
    </Layout>
  );
}
