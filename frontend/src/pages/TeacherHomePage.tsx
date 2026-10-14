import { useEffect, useState, type FormEvent } from "react";
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { db } from "../firebase";
import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT, DEFAULT_WELCOME } from "../lib/defaults";
import { errorText } from "../lib/format";
import type { Chatbot } from "../types";

type Row = Chatbot & { id: string };

export function TeacherHomePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!db || !user) return;
    return onSnapshot(
      query(collection(db, "chatbots"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc")),
      (snap) => {
        setRows(snap.docs.map((item) => ({ id: item.id, ...(item.data() as Chatbot) })));
      },
    );
  }, [user]);

  async function createBot(event: FormEvent) {
    event.preventDefault();
    if (!db || !user || !name.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      await addDoc(collection(db, "chatbots"), {
        ownerId: user.uid,
        ownerEmail: (user.email ?? "").toLowerCase(),
        name: name.trim(),
        model: DEFAULT_MODEL,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        welcomeMessage: DEFAULT_WELCOME,
        ragEnabled: false,
        disabled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setName("");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <div className="page-head">
        <div>
          <p className="eyebrow">老師</p>
          <h1>我的聊天機械人</h1>
        </div>
      </div>
      <form className="inline-form" onSubmit={(event) => void createBot(event)}>
        <label>
          新機械人名稱
          <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required />
        </label>
        <button type="submit" className="button" disabled={busy || !name.trim()}>
          建立
        </button>
      </form>
      {message ? <p className="notice">{message}</p> : null}
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
