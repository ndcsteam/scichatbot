import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  addDoc,
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
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { db, storage } from "../firebase";
import { deleteChatbot, deleteDocument, inviteStudent, removeStudent } from "../lib/callables";
import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT, DEFAULT_WELCOME } from "../lib/defaults";
import { errorText, formatTime } from "../lib/format";
import {
  POE_LAB_LABEL,
  chatModels,
  groupPoeModels,
  loadPoeModels,
  modelOptionLabel,
  selectedModelValue,
  type PoeModelChoice,
} from "../lib/poeModels";
import type { BotDocument, Chatbot, ChatMessage, ConversationMeta, Member } from "../types";

type Person = {
  uid: string;
  email: string;
  member: boolean;
  lastMessage?: string;
};

export function TeacherBotPage() {
  const { botId = "" } = useParams();
  const creating = botId === "new";
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
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
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setSelectedUid("");
    setMessage("");
  }, [botId]);

  useEffect(() => {
    const notice = (location.state as { notice?: string } | null)?.notice;
    if (notice) setMessage(notice);
  }, [location.state]);

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
    const stored = creating ? DEFAULT_MODEL : bot?.model;
    if (!stored) return;
    setModel(selectedModelValue(stored, models));
  }, [creating, bot?.id, bot?.model, models]);

  useEffect(() => {
    if (!db || !botId || creating) return;
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
    if (!db || !botId || creating) return;
    return onSnapshot(query(collection(db, "chatbots", botId, "documents"), orderBy("createdAt", "desc")), (snap) => {
      setDocuments(snap.docs.map((item) => ({ id: item.id, ...(item.data() as BotDocument) })));
    });
  }, [botId]);

  useEffect(() => {
    if (!db || !botId || creating) return;
    return onSnapshot(collection(db, "chatbots", botId, "members"), (snap) => {
      setMembers(snap.docs.map((item) => ({ id: item.id, ...(item.data() as Member) })));
    });
  }, [botId]);

  useEffect(() => {
    if (!db || !botId || creating) return;
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

  function settingsFrom(form: HTMLFormElement) {
    const data = new FormData(form);
    return {
      name: String(data.get("name") ?? "").trim(),
      model: String(data.get("model") ?? "").trim() || DEFAULT_MODEL,
      systemPrompt: String(data.get("systemPrompt") ?? ""),
      welcomeMessage: String(data.get("welcomeMessage") ?? ""),
      ragEnabled: data.get("ragEnabled") === "on",
    };
  }

  async function createFromForm(form: HTMLFormElement) {
    if (!db || !user) throw new Error("尚未登入");
    const email = (user.email ?? "").toLowerCase();
    if (!email) throw new Error("這個帳號沒有電郵，無法建立機械人");
    const next = settingsFrom(form);
    if (!next.name) throw new Error("請先填寫機械人名稱");
    return addDoc(collection(db, "chatbots"), {
      ...next,
      ownerId: user.uid,
      ownerEmail: email,
      disabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !user) return;
    const next = settingsFrom(event.currentTarget);
    if (!next.name) return;
    setBusy(true);
    setMessage("");
    try {
      if (creating) {
        const created = await createFromForm(event.currentTarget);
        navigate(`/teacher/bots/${created.id}`, { replace: true });
        return;
      }
      if (!bot) return;
      await updateDoc(doc(db, "chatbots", bot.id), { ...next, updatedAt: serverTimestamp() });
      setMessage("已儲存設定");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    if (!db || !storage || !user || !formRef.current) return;
    if (!/\.(txt|md|pdf)$/i.test(file.name) || file.name.includes("/") || file.name.includes("\\")) {
      setMessage("只可上傳 txt、md 或 pdf，檔名不可包含斜線");
      return;
    }
    setBusy(true);
    setMessage("");
    let targetId = bot?.id ?? "";
    try {
      if (creating) {
        const created = await createFromForm(formRef.current);
        targetId = created.id;
      }
      if (!targetId) return;
      const docRef = doc(collection(db, "chatbots", targetId, "documents"));
      const storagePath = `chatbots/${targetId}/docs/${docRef.id}/${file.name}`;
      await setDoc(docRef, {
        fileName: file.name,
        storagePath,
        status: "processing",
        createdAt: serverTimestamp(),
      });
      await uploadBytes(ref(storage, storagePath), file);
      const notice = "已上傳，系統正在整理參考資料";
      if (creating) navigate(`/teacher/bots/${targetId}`, { replace: true, state: { notice } });
      else setMessage(notice);
    } catch (error) {
      const notice = errorText(error);
      if (creating && targetId) navigate(`/teacher/bots/${targetId}`, { replace: true, state: { notice } });
      else setMessage(notice);
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

  async function removeBot() {
    if (!bot) return;
    const confirmed = window.confirm(
      `確定刪除聊天機械人「${bot.name}」？參考資料、邀請和對話會一併刪除，而且不能復原。`,
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteChatbot(bot.id);
      navigate("/teacher");
    } catch (error) {
      setMessage(errorText(error));
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

  if (!creating && missing) {
    return (
      <Layout>
        <p className="notice">找不到這個聊天機械人。</p>
      </Layout>
    );
  }

  if (!creating && !bot) {
    return (
      <Layout>
        <p className="muted">正在載入…</p>
      </Layout>
    );
  }

  const shown = bot ?? {
    id: "new",
    ownerId: user?.uid ?? "",
    ownerEmail: (user?.email ?? "").toLowerCase(),
    name: "",
    model: DEFAULT_MODEL,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    welcomeMessage: DEFAULT_WELCOME,
    ragEnabled: false,
    disabled: false,
  };
  const selected = people.find((person) => person.uid === selectedUid);

  return (
    <Layout>
      <p className="back">
        <Link to="/teacher">返回列表</Link>
      </p>
      <div className="page-head">
        <div>
          <p className="eyebrow">聊天機械人</p>
          <h1>{creating ? "新聊天機械人" : shown.name}</h1>
        </div>
        <div className="actions">
          {shown.disabled ? <span className="pill warn">管理員已停用</span> : null}
          {creating ? null : (
            <button type="button" className="button danger" disabled={busy} onClick={() => void removeBot()}>
              刪除機械人
            </button>
          )}
        </div>
      </div>
      {message ? <p className="notice">{message}</p> : null}

      <form ref={formRef} key={shown.id} className="panel stack" onSubmit={(event) => void saveSettings(event)}>
        <h2>設定</h2>
        <label>
          機械人名稱
          <input name="name" defaultValue={shown.name} maxLength={80} required />
        </label>
        <label>
          AI模型
          <select
            name="model"
            value={model || selectedModelValue(shown.model, models)}
            onChange={(event) => setModel(event.target.value)}
            required
          >
            {!modelKnown && model ? <option value={model}>{model}</option> : null}
            {modelGroups.map(([owner, items]) => (
              <optgroup key={owner} label={POE_LAB_LABEL[owner] ?? owner}>
                {items.map((item) => (
                  <option key={item.id} value={item.label}>
                    {modelOptionLabel(item)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {modelsNote ? (
          <p className="muted">{modelsNote}</p>
        ) : (
          <p className="muted">預設是 Gemini 3.8 Flash。其他供應商各提供一個價錢相近、可以讀圖的模型。</p>
        )}
        <label>
          系統提示詞
          <textarea name="systemPrompt" defaultValue={shown.systemPrompt} maxLength={8000} rows={6} />
        </label>
        <label>
          歡迎詞
          <textarea name="welcomeMessage" defaultValue={shown.welcomeMessage} maxLength={2000} rows={3} />
        </label>
        <div className="settings-block">
          <h3>參考資料</h3>
          <label className="check">
            <input name="ragEnabled" type="checkbox" defaultChecked={shown.ragEnabled} />
            回答時使用已上傳的參考資料
          </label>
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
          {creating ? <p className="muted">選取檔案後會先建立機械人，再上傳這份參考資料。</p> : null}
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
        </div>
        <button type="submit" className="button" disabled={busy}>
          {creating ? "建立機械人" : "儲存設定"}
        </button>
      </form>

      {creating ? <p className="muted">建立後可以邀請學生。</p> : null}

      {creating ? null : <>
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
      </>}
    </Layout>
  );
}
