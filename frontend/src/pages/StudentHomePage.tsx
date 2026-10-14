import { useEffect, useState } from "react";
import { collectionGroup, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { db } from "../firebase";
import type { Chatbot } from "../types";

type Row = Chatbot & { id: string };

export function StudentHomePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!db || !user) return;
    return onSnapshot(query(collectionGroup(db, "members"), where("studentUid", "==", user.uid)), (snap) => {
      void (async () => {
        const bots = await Promise.all(
          snap.docs.map(async (member) => {
            const botId = member.ref.parent.parent?.id;
            if (!botId || !db) return null;
            const botSnap = await getDoc(doc(db, "chatbots", botId));
            if (!botSnap.exists()) return null;
            const data = botSnap.data() as Chatbot;
            if (data.disabled) return null;
            return { id: botSnap.id, ...data };
          }),
        );
        setRows(bots.filter((item): item is Row => item !== null));
      })();
    });
  }, [user]);

  return (
    <Layout>
      <div className="page-head">
        <div>
          <p className="eyebrow">學生</p>
          <h1>我的聊天機械人</h1>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted">老師邀請你之後，聊天機械人會出現在這裡。</p>
      ) : (
        <ul className="card-list">
          {rows.map((row) => (
            <li key={row.id}>
              <Link to={`/student/bots/${row.id}`} className="bot-card">
                <strong>{row.name}</strong>
                <span>{row.welcomeMessage}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
