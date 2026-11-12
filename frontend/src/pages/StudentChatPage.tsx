import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { CloseIcon, HistoryIcon, ImageIcon, PlusIcon, SendIcon, SparklesIcon } from "../components/Icons";
import { MessageItem, TypingIndicator } from "../components/MessageItem";
import { db } from "../firebase";
import { sendMessage } from "../lib/callables";
import { prepareImage, type PreparedImage } from "../lib/image";
import { imageBudget, resolveLimits } from "../lib/limits";
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
  const limits = resolveLimits(bot?.limits);
  const maxImages = limits.maxImages;

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
    const room = maxImages - attached.length;
    if (room <= 0) {
      setError(`一次最多可以附上 ${maxImages} 張圖片`);
      return;
    }
    setError(files.length > room ? `一次最多可以附上 ${maxImages} 張圖片，多出的已略過` : "");
    setPreparing(true);
    try {
      const prepared: PreparedImage[] = [];
      for (const file of files.slice(0, room)) {
        prepared.push(await prepareImage(file, imageBudget(maxImages)));
      }
      setAttached((current) => [...current, ...prepared].slice(0, maxImages));
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
              <PlusIcon size={18} />
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
              {bot?.ragEnabled ? (
                <span className="pill">
                  <SparklesIcon size={14} />
                  會參考老師上傳的資料
                </span>
              ) : null}
              <button
                type="button"
                className="button small new-chat-toggle"
                disabled={sending || Boolean(blocked)}
                onClick={startNew}
              >
                <PlusIcon size={16} />
                開新對話
              </button>
              <button
                type="button"
                className="button secondary small history-toggle"
                onClick={() => setHistoryOpen(true)}
              >
                <HistoryIcon size={16} />
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
              <MessageItem role="assistant" content={bot.welcomeMessage} copyable={false} />
            ) : null}
            {messages.map((item) => (
              <MessageItem
                key={item.id}
                role={item.role}
                content={item.content}
                images={item.images}
                time={formatTime(item.createdAt)}
              />
            ))}
            {sending ? <TypingIndicator /> : null}
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
                      <CloseIcon size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <form className="composer" onSubmit={(event) => void submit(event)}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => void pickImages(event)}
              />
              {maxImages > 0 ? (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={preparing ? "正在處理圖片" : "加入圖片"}
                  title={`加入圖片（最多 ${maxImages} 張）`}
                  disabled={Boolean(blocked) || sending || preparing || attached.length >= maxImages}
                  onClick={() => fileRef.current?.click()}
                >
                  {preparing ? <span className="spinner mini" aria-hidden="true" /> : <ImageIcon size={21} />}
                </button>
              ) : null}
              <textarea
                ref={draftRef}
                value={draft}
                rows={1}
                maxLength={limits.maxChars}
                placeholder="輸入問題，Enter 送出、Shift + Enter 換行"
                disabled={Boolean(blocked) || sending}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button
                type="submit"
                className="icon-button send"
                aria-label="送出"
                title="送出"
                disabled={Boolean(blocked) || sending || preparing || (!draft.trim() && attached.length === 0)}
              >
                <SendIcon size={20} />
              </button>
            </form>
            {maxImages > 0 ? (
              <p className="muted composer-note">圖片會傳送給 AI，老師也看得到。請勿上載含有個人資料的相片。</p>
            ) : null}
          </div>
        </div>
      </div>
    </Layout>
  );
}
