import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { MessageImages } from "../components/MessageImages";
import { MessageText } from "../components/MessageText";
import { db } from "../firebase";
import { sendMessage } from "../lib/callables";
import { MAX_IMAGES, prepareImage, type PreparedImage } from "../lib/image";
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
  const [attached, setAttached] = useState<PreparedImage[]>([]);
  const [preparing, setPreparing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

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

  useEffect(() => {
    const box = draftRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 144)}px`;
  }, [draft]);

  useEffect(() => {
    if (!historyOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [historyOpen]);

  function startNew() {
    if (sending) return;
    setHistoryOpen(false);
    setError("");
    setDraft("");
    clearAttached();
    setSearchParams({ new: "1" }, { replace: true });
  }

  function openConversation(id: string) {
    if (sending) return;
    setHistoryOpen(false);
    if (id === conversationId) return;
    setError("");
    setSearchParams({ c: id }, { replace: true });
  }

  function clearAttached() {
    setAttached((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }

  function removeAttached(id: string) {
    setAttached((current) => {
      current.filter((item) => item.id === id).forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return current.filter((item) => item.id !== id);
    });
  }

  async function pickImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    const room = MAX_IMAGES - attached.length;
    if (room <= 0) {
      setError(`一次最多可以附上 ${MAX_IMAGES} 張圖片`);
      return;
    }
    setError(files.length > room ? `一次最多可以附上 ${MAX_IMAGES} 張圖片，多出的已略過` : "");
    setPreparing(true);
    try {
      const prepared: PreparedImage[] = [];
      for (const file of files.slice(0, room)) {
        prepared.push(await prepareImage(file));
      }
      setAttached((current) => [...current, ...prepared].slice(0, MAX_IMAGES));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setPreparing(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if ((!content && attached.length === 0) || sending || preparing || blocked) return;
    setSending(true);
    setError("");
    try {
      const result = await sendMessage(
        botId,
        content,
        conversationId || undefined,
        attached.map((item) => item.base64),
      );
      setDraft("");
      clearAttached();
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
        {historyOpen ? (
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="關閉對話紀錄"
            onClick={() => setHistoryOpen(false)}
          />
        ) : null}
        <aside className={historyOpen ? "thread-list open" : "thread-list"} aria-label="對話歷史">
          <div className="thread-actions">
            <button type="button" className="button" disabled={sending || Boolean(blocked)} onClick={startNew}>
              開新對話
            </button>
            <button type="button" className="button secondary drawer-close" onClick={() => setHistoryOpen(false)}>
              關閉
            </button>
          </div>
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
            <div className="chat-head-side">
              {bot?.ragEnabled ? <span className="pill">會參考老師上傳的資料</span> : null}
              <button
                type="button"
                className="button secondary small history-toggle"
                onClick={() => setHistoryOpen(true)}
              >
                對話紀錄
              </button>
            </div>
          </header>
          <div className="transcript">
            {blocked ? <p className="notice">{blocked}</p> : null}
            {!blocked &&
            !conversationId &&
            (startedNew || (listReady && conversations.length === 0)) &&
            bot?.welcomeMessage ? (
              <article className="bubble assistant">
                <header>機械人</header>
                <p>{bot.welcomeMessage}</p>
              </article>
            ) : null}
            {messages.map((item) => (
              <article key={item.id} className={item.role === "user" ? "bubble user" : "bubble assistant"}>
                <header>{item.role === "user" ? "我" : "機械人"}</header>
                <MessageImages paths={item.images} />
                <MessageText role={item.role} content={item.content} />
                <time>{formatTime(item.createdAt)}</time>
              </article>
            ))}
            {sending ? <p className="muted">正在回覆…</p> : null}
            <div ref={endRef} />
          </div>
          <div className={attached.length > 0 ? "composer-dock has-images" : "composer-dock"}>
            {error ? <p className="notice">{error}</p> : null}
            {attached.length > 0 ? (
              <ul className="attach-list" aria-label="已附上的圖片">
                {attached.map((item) => (
                  <li key={item.id}>
                    <img src={item.previewUrl} alt="待送出的圖片" />
                    <button
                      type="button"
                      disabled={sending}
                      aria-label="移除圖片"
                      onClick={() => removeAttached(item.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <form className="composer" onSubmit={(event) => void submit(event)}>
              <textarea
                ref={draftRef}
                value={draft}
                rows={1}
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
              <div className="composer-actions">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(event) => void pickImages(event)}
                />
                <button
                  type="button"
                  className="button secondary attach-button"
                  aria-label="加入圖片"
                  disabled={Boolean(blocked) || sending || preparing || attached.length >= MAX_IMAGES}
                  onClick={() => fileRef.current?.click()}
                >
                  <span className="label-full">{preparing ? "處理中…" : "加入圖片"}</span>
                  <span className="label-short" aria-hidden="true">
                    {preparing ? "…" : "+"}
                  </span>
                </button>
                <button
                  type="submit"
                  className="button send-button"
                  disabled={Boolean(blocked) || sending || preparing || (!draft.trim() && attached.length === 0)}
                >
                  送出
                </button>
              </div>
            </form>
            <p className="muted composer-note">圖片會傳送給 AI，老師也看得到。請勿上載含有個人資料的相片。</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
