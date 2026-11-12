import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Link, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { CloseIcon, ImageIcon, PlusIcon, SendIcon, SparklesIcon } from "../components/Icons";
import { MessageItem, TypingIndicator } from "../components/MessageItem";
import { db } from "../firebase";
import { testChat, type TestTurn } from "../lib/callables";
import { errorText } from "../lib/format";
import { prepareImage, type PreparedImage } from "../lib/image";
import { imageBudget, resolveLimits } from "../lib/limits";
import type { Chatbot } from "../types";

type TestMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  previews?: string[];
};

export function TeacherTestPage() {
  const { botId = "" } = useParams();
  const [bot, setBot] = useState<Chatbot | null>(null);
  const [missing, setMissing] = useState(false);
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attached, setAttached] = useState<PreparedImage[]>([]);
  const [preparing, setPreparing] = useState(false);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const limits = resolveLimits(bot?.limits);
  const maxImages = limits.maxImages;

  useEffect(() => {
    if (!db || !botId) return;
    return onSnapshot(
      doc(db, "chatbots", botId),
      (snap) => {
        if (!snap.exists()) {
          setMissing(true);
          setBot(null);
          return;
        }
        setMissing(false);
        setBot(snap.data() as Chatbot);
      },
      () => {
        setMissing(true);
        setBot(null);
      },
    );
  }, [botId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    const box = draftRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 144)}px`;
  }, [draft]);

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

  function restart() {
    if (sending) return;
    setMessages([]);
    setDraft("");
    setError("");
    clearAttached();
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
    if ((!content && attached.length === 0) || sending || preparing) return;
    const images = attached.map((item) => item.base64);
    const history: TestTurn[] = messages.map((item) => ({
      role: item.role,
      content: item.content,
      ...(item.previews && item.previews.length > 0 ? { imageCount: item.previews.length } : {}),
    }));
    const userMessage: TestMessage = {
      id: nextId.current++,
      role: "user",
      content,
      previews: images.map((value) => `data:image/jpeg;base64,${value}`),
    };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    clearAttached();
    setSending(true);
    setError("");
    try {
      const result = await testChat(botId, content, history, images);
      setMessages((current) => [...current, { id: nextId.current++, role: "assistant", content: result.answer }]);
    } catch (caught) {
      // 送出失敗：把訊息放回輸入框，讓老師可以直接重送（圖片需要重新選擇）。
      setMessages((current) => current.filter((item) => item.id !== userMessage.id));
      setDraft(content);
      setError(errorText(caught));
    } finally {
      setSending(false);
    }
  }

  if (missing) {
    return (
      <Layout>
        <p className="notice">找不到這個聊天機械人。</p>
      </Layout>
    );
  }

  if (!bot) {
    return (
      <Layout>
        <p className="muted">正在載入…</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="chat test-chat">
        <header className="chat-head">
          <div>
            <Link to={`/teacher/bots/${botId}`} className="back-link">
              返回設定
            </Link>
            <h1>測試：{bot.name || "聊天機械人"}</h1>
          </div>
          <div className="chat-head-side">
            {bot.ragEnabled ? (
              <span className="pill">
                <SparklesIcon size={14} />
                會參考上傳的資料
              </span>
            ) : null}
            <button type="button" className="button secondary small" disabled={sending} onClick={restart}>
              <PlusIcon size={16} />
              重新開始
            </button>
          </div>
        </header>
        <p className="notice test-note">
          測試模式：對話不會儲存，學生也看不到。這裡使用已儲存的設定，修改後請先按「儲存設定」再測試。
        </p>
        <div className="transcript">
          {messages.length === 0 && bot.welcomeMessage ? (
            <MessageItem role="assistant" content={bot.welcomeMessage} copyable={false} />
          ) : null}
          {messages.map((item) => (
            <MessageItem key={item.id} role={item.role} content={item.content} previews={item.previews} userLabel="我" />
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
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => void pickImages(event)} />
            {maxImages > 0 ? (
              <button
                type="button"
                className="icon-button"
                aria-label={preparing ? "正在處理圖片" : "加入圖片"}
                title={`加入圖片（最多 ${maxImages} 張）`}
                disabled={sending || preparing || attached.length >= maxImages}
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
              placeholder="像學生一樣輸入問題，Enter 送出、Shift + Enter 換行"
              disabled={sending}
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
              disabled={sending || preparing || (!draft.trim() && attached.length === 0)}
            >
              <SendIcon size={20} />
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
