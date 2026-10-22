import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { db } from "../firebase";
import type { Chatbot } from "../types";

type Row = Chatbot & { id: string };

export function TeacherHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!db || !user) return;
    return onSnapshot(
      query(collection(db, "chatbots"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc")),
      (snap) => {
        setRows(snap.docs.map((item) => ({ id: item.id, ...(item.data() as Chatbot) })));
      },
    );
  }, [user]);

  return (
    <Layout>
      <div className="page-head">
        <div>
          <p className="eyebrow">老師</p>
          <h1>我的聊天機械人</h1>
        </div>
        <button type="button" className="button" onClick={() => navigate("/teacher/bots/new")}>
          建立
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="muted">尚未建立聊天機械人。</p>
      ) : (
        <ul className="card-list">
          {rows.map((row) => (
            <li key={row.id}>
              <Link to={`/teacher/bots/${row.id}`} className="bot-card">
                <strong>{row.name}</strong>
                <span>{row.disabled ? "已停用" : row.ragEnabled ? "參考資料已啟用" : "參考資料未啟用"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
