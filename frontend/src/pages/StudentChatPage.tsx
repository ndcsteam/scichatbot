import { useEffect, useRef, useState, type FormEvent } from "react";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { db } from "../firebase";
import { sendMessage } from "../lib/callables";
import { errorText, formatTime } from "../lib/format";
import type { Chatbot, ChatMessage, ConversationMeta } from "../types";

export function StudentChatPage() {
  const { botId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get("c") ?? "";
  const startedNew = searchParams.get("new") === "1";
  const { user } = useAuth();
  const [bot, setBot] = useState<Chatbot | null>(null);
  const [blocked, setBlocked] = useState("");
  const [listReady, setListReady] = useState(false);
  const [conversations, setConversations] = useState<Array<ConversationMeta & { id: string }>>([]);
  const [messages, setMessages] = useState<Array<ChatMessage & { id: string }>>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!db || !botId) return;
    return onSnapshot(
      doc(db, "chatbots", botId),
      (snap) => {
        if (!snap.exists()) {
          setBlocked("找不到這個聊天機械人。");
          setBot(null);
          return;
        }
        const data = snap.data() as Chatbot;
        setBot(data);
        setBlocked(data.disabled ? "此聊天機械人已停用。" : "");
      },
      () => {
        setBot(null);
        setBlocked("你沒有使用此聊天機械人的權限。");
      },
    );
  }, [botId]);

  useEffect(() => {
    setListReady(false);
    if (!db || !botId || !user || blocked) {
      setConversations([]);
      return;
    }
    return onSnapshot(
      query(
        collection(db, "chatbots", botId, "conversations"),
        where("studentUid", "==", user.uid),
        orderBy("updatedAt", "desc"),
      ),
      (snap) => {
        setConversations(snap.docs.map((item) => ({ id: item.id, ...(item.data() as ConversationMeta) })));
        setListReady(true);
      },
      () => {
        setConversations([]);
        setListReady(true);
      },
    );
  }, [blocked, botId, user]);

  const latestId = conversations[0]?.id ?? "";
  useEffect(() => {
    if (listReady && !conversationId && !startedNew && latestId) {
      setSearchParams({ c: latestId }, { replace: true });
    }
  }, [conversationId, latestId, listReady, setSearchParams, startedNew]);

  useEffect(() => {
    if (!db || !botId || !conversationId || blocked) {
      setMessages([]);
      return;
    }
    return onSnapshot(
      query(collection(db, "chatbots", botId, "conversations", conversationId, "messages"), orderBy("seq", "asc")),
      (snap) => {
        setMessages(snap.docs.map((item) => ({ id: item.id, ...(item.data() as ChatMessage) })));
      },
      () => setMessages([]),
    );
  }, [blocked, botId, conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  function startNew() {
    if (sending) return;
    setError("");
    setDraft("");
    setSearchParams({ new: "1" }, { replace: true });
  }

  function openConversation(id: string) {
    if (sending || id === conversationId) return;
    setError("");
    setSearchParams({ c: id }, { replace: true });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || blocked) return;
    setSending(true);
    setError("");
    try {
      const result = await sendMessage(botId, content, conversationId || undefined);
      setDraft("");
      if (result.conversationId !== conversationId) {
        setSearchParams({ c: result.conversationId }, { replace: true });
      }
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSending(false);
    }
  }

  return (
    <Layout>
      <div className="chat-layout">
        <aside className="thread-list" aria-label="對話歷史">
          <button type="button" className="button" disabled={sending || Boolean(blocked)} onClick={startNew}>
            開新對話
          </button>
          <ul className="plain-list">
            {conversations.length === 0 ? <li className="muted">還沒有對話。</li> : null}
            {conversations.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.id === conversationId ? "thread-item active" : "thread-item"}
                  disabled={sending}
                  onClick={() => openConversation(item.id)}
                >
                  <strong>{item.title || "先前的對話"}</strong>
                  <span className="muted">{formatTime(item.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="chat">
          <header className="chat-head">
            <div>
              <Link to="/student" className="back-link">
                返回
              </Link>
              <h1>{bot?.name || "聊天"}</h1>
            </div>
            {bot?.ragEnabled ? <span className="pill">會參考老師上傳的資料</span> : null}
          </header>
          <div className="transcript">
            {blocked ? <p className="notice">{blocked}</p> : null}
            {!blocked && !conversationId && (startedNew || (listReady && conversations.length === 0)) && bot?.welcomeMessage ? (
              <article className="bubble assistant">
                <header>機械人</header>
                <p>{bot.welcomeMessage}</p>
              </article>
            ) : null}
            {messages.map((item) => (
              <article key={item.id} className={item.role === "user" ? "bubble user" : "bubble assistant"}>
                <header>{item.role === "user" ? "我" : "機械人"}</header>
                <p>{item.content}</p>
                <time>{formatTime(item.createdAt)}</time>
              </article>
            ))}
            {sending ? <p className="muted">正在回覆…</p> : null}
            <div ref={endRef} />
          </div>
          {error ? <p className="notice">{error}</p> : null}
          <form className="composer" onSubmit={(event) => void submit(event)}>
            <textarea
              value={draft}
              rows={3}
              maxLength={4000}
              placeholder="輸入問題"
              disabled={Boolean(blocked) || sending}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button type="submit" className="button" disabled={Boolean(blocked) || sending || !draft.trim()}>
              送出
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
