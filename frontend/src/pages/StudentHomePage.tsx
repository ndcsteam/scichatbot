import { useEffect, useState } from "react";
import { collectionGroup, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ArrowRightIcon, BotIcon, LinkIcon } from "../components/Icons";
import { Layout } from "../components/Layout";
import { db } from "../firebase";
import type { Chatbot } from "../types";

type Row = Chatbot & { id: string };

export function StudentHomePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!db || !user) return;
    return onSnapshot(
      query(collectionGroup(db, "members"), where("studentUid", "==", user.uid)),
      (snap) => {
        setError("");
        void (async () => {
          const bots = await Promise.all(
            snap.docs.map(async (member) => {
              const botId = member.ref.parent.parent?.id;
              if (!botId || !db) return null;
              const botSnap = await getDoc(doc(db, "chatbots", botId)).catch(() => null);
              if (!botSnap?.exists()) return null;
              const data = botSnap.data() as Chatbot;
              if (data.disabled) return null;
              return { id: botSnap.id, ...data };
            }),
          );
          setRows(bots.filter((item): item is Row => item !== null));
        })();
      },
      () => {
        setRows([]);
        setError("無法讀取你的聊天機械人，請重新整理頁面。若仍然失敗，請聯絡老師。");
      },
    );
  }, [user]);

  return (
    <Layout>
      <div className="page-head">
        <div>
          <p className="eyebrow">學生</p>
          <h1>我的聊天機械人</h1>
        </div>
      </div>
      {error ? <p className="notice">{error}</p> : null}
      {rows.length === 0 && !error ? (
        <section className="empty-state">
          <span className="empty-icon">
            <LinkIcon size={28} />
          </span>
          <h2>還沒有加入任何聊天機械人</h2>
          <p>打開老師給你的加入連結，用學校 Google 帳號登入後，聊天機械人就會出現在這裡。</p>
        </section>
      ) : (
        <ul className="card-list">
          {rows.map((row) => (
            <li key={row.id}>
              <Link to={`/student/bots/${row.id}`} className="bot-card">
                <span className="tile">
                  <BotIcon size={24} />
                </span>
                <strong>{row.name}</strong>
                <ArrowRightIcon size={20} className="go" />
                <span className="meta">{row.welcomeMessage}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
