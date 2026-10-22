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
import { deleteChatbot, deleteDocument } from "../lib/callables";
import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT, DEFAULT_WELCOME } from "../lib/defaults";
import { errorText } from "../lib/format";
import {
  POE_LAB_LABEL,
  chatModels,
  groupPoeModels,
  loadPoeModels,
  modelOptionLabel,
  selectedModelValue,
  type PoeModelChoice,
} from "../lib/poeModels";
import type { BotDocument, Chatbot } from "../types";

export function TeacherBotPage() {
  const { botId = "" } = useParams();
  const creating = botId === "new";
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [bot, setBot] = useState<(Chatbot & { id: string }) | null>(null);
  const [missing, setMissing] = useState(false);
  const [documents, setDocuments] = useState<Array<BotDocument & { id: string }>>([]);
  const [documentsReady, setDocumentsReady] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<PoeModelChoice[]>([]);
  const [modelsNote, setModelsNote] = useState("");
  const [model, setModel] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
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
    setDocuments([]);
    setDocumentsReady(false);
    if (!db || !botId || creating) return;
    return onSnapshot(query(collection(db, "chatbots", botId, "documents"), orderBy("createdAt", "desc")), (snap) => {
      setDocuments(snap.docs.map((item) => ({ id: item.id, ...(item.data() as BotDocument) })));
      setDocumentsReady(true);
    });
  }, [botId, creating]);

  useEffect(() => {
    if (!db || creating || !bot || !documentsReady) return;
    const shouldUse = documents.length > 0;
    if (bot.ragEnabled === shouldUse) return;
    void updateDoc(doc(db, "chatbots", bot.id), { ragEnabled: shouldUse }).catch(() => undefined);
  }, [bot, creating, documents.length, documentsReady]);

  const modelGroups = useMemo(() => groupPoeModels(models), [models]);
  const modelKnown = models.some((item) => item.label === model || item.id.toLowerCase() === model.toLowerCase());

  function settingsFrom(form: HTMLFormElement) {
    const data = new FormData(form);
    return {
      name: String(data.get("name") ?? "").trim(),
      model: String(data.get("model") ?? "").trim() || DEFAULT_MODEL,
      systemPrompt: String(data.get("systemPrompt") ?? ""),
      welcomeMessage: String(data.get("welcomeMessage") ?? ""),
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
      ragEnabled: false,
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
      await updateDoc(doc(db, "chatbots", bot.id), {
        ...next,
        ragEnabled: documents.length > 0,
        updatedAt: serverTimestamp(),
      });
      navigate(`/teacher/bots/${bot.id}/students`, { state: { notice: "已儲存設定" } });
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
    if (file.size >= 32 * 1024 * 1024) {
      setMessage("檔案必須小於 32MB");
      return;
    }
    setBusy(true);
    setMessage("");
    let targetId = bot?.id ?? "";
    let uploadedDocId = "";
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
      uploadedDocId = docRef.id;
      await uploadBytes(ref(storage, storagePath), file);
      uploadedDocId = "";
      await updateDoc(doc(db, "chatbots", targetId), { ragEnabled: true, updatedAt: serverTimestamp() });
      if (creating) navigate(`/teacher/bots/${targetId}`, { replace: true });
    } catch (error) {
      if (uploadedDocId && targetId) await deleteDocument(targetId, uploadedDocId).catch(() => undefined);
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
  const organizing = documents.some((item) => item.status !== "ready" && item.status !== "error");

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
            <Link className="button secondary" to={`/teacher/bots/${shown.id}/students`}>
              學生管理
            </Link>
          )}
          {creating ? null : (
            <button type="button" className="button danger" disabled={busy} onClick={() => void removeBot()}>
              刪除機械人
            </button>
          )}
        </div>
      </div>
      {organizing ? <p className="notice">已上傳，系統正在整理參考資料</p> : null}
      {!organizing && message ? <p className="notice">{message}</p> : null}

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
        {modelsNote ? <p className="muted">{modelsNote}</p> : null}
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
          <label className="file">
            上傳 txt、md 或 pdf，每個小於 32MB
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
    </Layout>
  );
}
