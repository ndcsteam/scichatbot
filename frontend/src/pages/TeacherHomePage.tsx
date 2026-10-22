import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { db } from "../firebase";
import { deleteChatbot } from "../lib/callables";
import { errorText } from "../lib/format";
import type { Chatbot } from "../types";

type Row = Chatbot & { id: string };

export function TeacherHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (!db || !user) return;
    return onSnapshot(
      query(collection(db, "chatbots"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc")),
      (snap) => {
        setRows(snap.docs.map((item) => ({ id: item.id, ...(item.data() as Chatbot) })));
      },
    );
  }, [user]);

  async function remove(row: Row) {
    const confirmed = window.confirm(
      `確定刪除聊天機械人「${row.name}」？參考資料、邀請和對話會一併刪除，而且不能復原。`,
    );
    if (!confirmed) return;
    setBusyId(row.id);
    setMessage("");
    try {
      await deleteChatbot(row.id);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusyId("");
    }
  }

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
      {message ? <p className="notice">{message}</p> : null}
      {rows.length === 0 ? (
        <p className="muted">尚未建立聊天機械人。</p>
      ) : (
        <ul className="card-list">
          {rows.map((row) => (
            <li key={row.id} className="bot-row">
              <Link to={`/teacher/bots/${row.id}`} className="bot-card">
                <strong>{row.name}</strong>
                <span>{row.disabled ? "已停用" : row.ragEnabled ? "已上傳參考資料" : "尚未上傳參考資料"}</span>
              </Link>
              <button type="button" className="button danger" disabled={busyId === row.id} onClick={() => void remove(row)}>
                刪除
              </button>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
