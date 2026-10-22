import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { Link, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { db, storage } from "../firebase";
import { deleteDocument, inviteStudent, removeStudent } from "../lib/callables";
import { errorText, formatTime } from "../lib/format";
import { POE_LAB_LABEL, chatModels, groupPoeModels, loadPoeModels, type PoeModelChoice } from "../lib/poeModels";
import type { BotDocument, Chatbot, ChatMessage, ConversationMeta, Member } from "../types";

type Person = {
  uid: string;
  email: string;
  member: boolean;
  lastMessage?: string;
};

export function TeacherBotPage() {
  const { botId = "" } = useParams();
  const [bot, setBot] = useState<(Chatbot & { id: string }) | null>(null);
  const [missing, setMissing] = useState(false);
  const [documents, setDocuments] = useState<Array<BotDocument & { id: string }>>([]);
  const [members, setMembers] = useState<Array<Member & { id: string }>>([]);
  const [conversations, setConversations] = useState<Array<ConversationMeta & { id: string }>>([]);
  const [selectedUid, setSelectedUid] = useState("");
  const [messages, setMessages] = useState<Array<ChatMessage & { id: string }>>([]);
  const [message, setMessage] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<PoeModelChoice[]>([]);
  const [modelsNote, setModelsNote] = useState("");
  const [model, setModel] = useState("");

  useEffect(() => {
    setSelectedUid("");
    setMessage("");
  }, [botId]);

  useEffect(() => {
    let active = true;
    void loadPoeModels()
      .then((items) => {
        if (!active) return;
        setModels(items);
        setModelsNote("");
      })
      .catch(() => {
        if (!active) return;
        setModels(chatModels(null));
        setModelsNote("暫時無法讀取完整模型清單，先顯示常用模型。");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!bot) return;
    const stored = bot.model;
    setModel((current) => {
      const source = current && current.toLowerCase() !== stored.toLowerCase() ? current : stored;
      const match = models.find(
        (item) => item.label.toLowerCase() === source.toLowerCase() || item.id.toLowerCase() === source.toLowerCase(),
      );
      return match?.label || source;
    });
  }, [bot, models]);

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
        setBot({ id: snap.id, ...(snap.data() as Chatbot) });
      },
      () => {
        setMissing(true);
        setBot(null);
      },
    );
  }, [botId]);

  useEffect(() => {
    if (!db || !botId) return;
    return onSnapshot(query(collection(db, "chatbots", botId, "documents"), orderBy("createdAt", "desc")), (snap) => {
      setDocuments(snap.docs.map((item) => ({ id: item.id, ...(item.data() as BotDocument) })));
    });
  }, [botId]);

  useEffect(() => {
    if (!db || !botId) return;
    return onSnapshot(collection(db, "chatbots", botId, "members"), (snap) => {
      setMembers(snap.docs.map((item) => ({ id: item.id, ...(item.data() as Member) })));
    });
  }, [botId]);

  useEffect(() => {
    if (!db || !botId) return;
    return onSnapshot(collection(db, "chatbots", botId, "conversations"), (snap) => {
      setConversations(snap.docs.map((item) => ({ id: item.id, ...(item.data() as ConversationMeta) })));
    });
  }, [botId]);

  useEffect(() => {
    if (!db || !botId || !selectedUid) {
      setMessages([]);
      return;
    }
    return onSnapshot(
      query(collection(db, "chatbots", botId, "conversations", selectedUid, "messages"), orderBy("seq", "asc")),
      (snap) => {
        setMessages(snap.docs.map((item) => ({ id: item.id, ...(item.data() as ChatMessage) })));
      },
    );
  }, [botId, selectedUid]);

  const people = useMemo(() => {
    const map = new Map<string, Person>();
    for (const member of members) {
      map.set(member.studentUid, { uid: member.studentUid, email: member.email, member: true });
    }
    for (const conversation of conversations) {
      const current = map.get(conversation.studentUid);
      map.set(conversation.studentUid, {
        uid: conversation.studentUid,
        email: current?.email || conversation.email,
        member: current?.member ?? false,
        lastMessage: conversation.lastMessage,
      });
    }
    return [...map.values()].sort((a, b) => a.email.localeCompare(b.email, "zh-Hant"));
  }, [conversations, members]);
  const modelGroups = useMemo(() => groupPoeModels(models), [models]);
  const modelKnown = models.some((item) => item.label === model || item.id.toLowerCase() === model.toLowerCase());

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !bot) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      await updateDoc(doc(db, "chatbots", bot.id), {
        name: String(form.get("name") ?? "").trim(),
        model: String(form.get("model") ?? "").trim(),
        systemPrompt: String(form.get("systemPrompt") ?? ""),
        welcomeMessage: String(form.get("welcomeMessage") ?? ""),
        ragEnabled: form.get("ragEnabled") === "on",
        updatedAt: serverTimestamp(),
      });
      setMessage("已儲存設定");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    if (!db || !storage || !bot) return;
    if (!/\.(txt|md|pdf)$/i.test(file.name) || file.name.includes("/") || file.name.includes("\\")) {
      setMessage("只可上傳 txt、md 或 pdf，檔名不可包含斜線");
      return;
    }
    setBusy(true);
    setMessage("");
    const docRef = doc(collection(db, "chatbots", bot.id, "documents"));
    const storagePath = `chatbots/${bot.id}/docs/${docRef.id}/${file.name}`;
    try {
      await setDoc(docRef, {
        fileName: file.name,
        storagePath,
        status: "processing",
        createdAt: serverTimestamp(),
      });
      await uploadBytes(ref(storage, storagePath), file);
      setMessage("已上傳，系統正在整理參考資料");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(docId: string) {
    if (!bot) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteDocument(bot.id, docId);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!bot) return;
    setBusy(true);
    setMessage("");
    try {
      await inviteStudent(bot.id, inviteEmail.trim());
      setInviteEmail("");
      setMessage("已邀請學生");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(studentUid: string) {
    if (!bot) return;
    setBusy(true);
    setMessage("");
    try {
      await removeStudent(bot.id, studentUid);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
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

  const selected = people.find((person) => person.uid === selectedUid);

  return (
    <Layout>
      <p className="back">
        <Link to="/teacher">返回列表</Link>
      </p>
      <div className="page-head">
        <div>
          <p className="eyebrow">聊天機械人</p>
          <h1>{bot.name}</h1>
        </div>
        {bot.disabled ? <span className="pill warn">管理員已停用</span> : null}
      </div>
      {message ? <p className="notice">{message}</p> : null}

      <form key={bot.id} className="panel stack" onSubmit={(event) => void saveSettings(event)}>
        <h2>設定</h2>
        <label>
          名稱
          <input name="name" defaultValue={bot.name} maxLength={80} required />
        </label>
        <label>
          Poe 模型
          <select name="model" value={model} onChange={(event) => setModel(event.target.value)} required>
            {!modelKnown && model ? <option value={model}>{model}</option> : null}
            {modelGroups.map(([owner, items]) => (
              <optgroup key={owner} label={POE_LAB_LABEL[owner] ?? owner}>
                {items.map((item) => (
                  <option key={item.id} value={item.label}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {modelsNote ? <p className="muted">{modelsNote}</p> : <p className="muted">選擇這個機械人回答時使用的 Poe 模型。</p>}
        <label>
          系統提示詞
          <textarea name="systemPrompt" defaultValue={bot.systemPrompt} maxLength={8000} rows={6} />
        </label>
        <label>
          歡迎詞
          <textarea name="welcomeMessage" defaultValue={bot.welcomeMessage} maxLength={2000} rows={3} />
        </label>
        <label className="check">
          <input name="ragEnabled" type="checkbox" defaultChecked={bot.ragEnabled} />
          回答時使用已上傳的參考資料
        </label>
        <button type="submit" className="button" disabled={busy}>
          儲存設定
        </button>
      </form>

      <section className="panel stack">
        <h2>參考資料</h2>
        <label className="file">
          上傳 txt、md 或 pdf
          <input
            type="file"
            accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadFile(file);
            }}
          />
        </label>
        {documents.length === 0 ? (
          <p className="muted">尚未上傳文件。</p>
        ) : (
          <ul className="plain-list">
            {documents.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.fileName}</strong>
                  <span className="muted">
                    {item.status === "ready"
                      ? `可用，${item.chunkCount ?? 0} 段`
                      : item.status === "error"
                        ? `失敗：${item.errorMessage || "無法讀取"}`
                        : "處理中"}
                  </span>
                </div>
                <button type="button" className="button small secondary" disabled={busy} onClick={() => void removeDoc(item.id)}>
                  刪除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel stack">
        <h2>學生與對話紀錄</h2>
        <form className="inline-form" onSubmit={(event) => void invite(event)}>
          <label>
            學生學校電郵
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="student@school.edu.hk"
              required
            />
          </label>
          <button type="submit" className="button" disabled={busy}>
            邀請
          </button>
        </form>
        <div className="split">
          <ul className="plain-list">
            {people.length === 0 ? <li>尚未有學生。</li> : null}
            {people.map((person) => (
              <li key={person.uid}>
                <button type="button" className={person.uid === selectedUid ? "text-button active" : "text-button"} onClick={() => setSelectedUid(person.uid)}>
                  <strong>{person.email}</strong>
                  <span className="muted">{person.member ? "已加入" : "已退出，紀錄仍保留"}</span>
                </button>
                {person.member ? (
                  <button type="button" className="button small secondary" disabled={busy} onClick={() => void removeMember(person.uid)}>
                    移除
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="transcript compact">
            {!selected ? <p className="muted">選擇學生以查看對話。</p> : null}
            {selected && messages.length === 0 ? <p className="muted">這位學生尚未開始對話。</p> : null}
            {messages.map((item) => (
              <article key={item.id} className={item.role === "user" ? "bubble user" : "bubble assistant"}>
                <header>{item.role === "user" ? "學生" : "機械人"}</header>
                <p>{item.content}</p>
                <time>{formatTime(item.createdAt)}</time>
              </article>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
