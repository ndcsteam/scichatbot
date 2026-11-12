import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { MessageImages } from "../components/MessageImages";
import { MessageText } from "../components/MessageText";
import { db } from "../firebase";
import { createJoinLink, removeStudent, revokeJoinLink } from "../lib/callables";
import { errorText, formatTime } from "../lib/format";
import { durationLabel, JOIN_DURATIONS, joinUrl, remainingText } from "../lib/joinLink";
import type { Chatbot, ChatMessage, ConversationMeta, JoinDuration, JoinLink, Member } from "../types";

type Thread = ConversationMeta & { id: string };

type Person = {
  uid: string;
  email: string;
  member: boolean;
  threads: Thread[];
};

function threadTime(thread: Thread): number {
  return thread.updatedAt && typeof thread.updatedAt.toMillis === "function" ? thread.updatedAt.toMillis() : 0;
}

type ActiveLink = JoinLink & { token: string };

export function TeacherStudentsPage() {
  const { botId = "" } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const [bot, setBot] = useState<(Chatbot & { id: string }) | null>(null);
  const [missing, setMissing] = useState(false);
  const [members, setMembers] = useState<Array<Member & { id: string }>>([]);
  const [conversations, setConversations] = useState<Thread[]>([]);
  const [selectedUid, setSelectedUid] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [messages, setMessages] = useState<Array<ChatMessage & { id: string }>>([]);
  const [link, setLink] = useState<ActiveLink | null>(null);
  const [duration, setDuration] = useState<JoinDuration>("24h");
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const notice = (location.state as { notice?: string } | null)?.notice;
    if (notice) setMessage(notice);
  }, [location.state]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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
    if (!db || !botId || !user) return;
    return onSnapshot(
      query(collection(db, "joinLinks"), where("botId", "==", botId), where("ownerId", "==", user.uid)),
      (snap) => {
        const first = snap.docs[0];
        setLink(first ? { token: first.id, ...(first.data() as JoinLink) } : null);
      },
      () => setLink(null),
    );
  }, [botId, user]);

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
    if (!db || !botId || !selectedThreadId) {
      setMessages([]);
      return;
    }
    return onSnapshot(
      query(collection(db, "chatbots", botId, "conversations", selectedThreadId, "messages"), orderBy("seq", "asc")),
      (snap) => {
        setMessages(snap.docs.map((item) => ({ id: item.id, ...(item.data() as ChatMessage) })));
      },
    );
  }, [botId, selectedThreadId]);

  const people = useMemo(() => {
    const map = new Map<string, Person>();
    for (const member of members) {
      map.set(member.studentUid, { uid: member.studentUid, email: member.email, member: true, threads: [] });
    }
    for (const conversation of conversations) {
      const current = map.get(conversation.studentUid);
      map.set(conversation.studentUid, {
        uid: conversation.studentUid,
        email: current?.email || conversation.email,
        member: current?.member ?? false,
        threads: [...(current?.threads ?? []), conversation],
      });
    }
    for (const person of map.values()) {
      person.threads.sort((a, b) => threadTime(b) - threadTime(a));
    }
    return [...map.values()].sort((a, b) => a.email.localeCompare(b.email, "zh-Hant"));
  }, [conversations, members]);
  const selected = people.find((person) => person.uid === selectedUid);
  const selectedThread = selected?.threads.find((thread) => thread.id === selectedThreadId);

  function chooseStudent(person: Person) {
    if (person.uid === selectedUid) {
      setSelectedUid("");
      setSelectedThreadId("");
      return;
    }
    setSelectedUid(person.uid);
    setSelectedThreadId(person.threads[0]?.id ?? "");
  }

  const expiresAtMs = link?.expiresAt && typeof link.expiresAt.toMillis === "function" ? link.expiresAt.toMillis() : 0;
  const linkActive = link !== null && expiresAtMs > now;
  const url = link ? joinUrl(link.token) : "";

  async function makeLink() {
    setBusy(true);
    setMessage("");
    try {
      await createJoinLink(botId, duration);
      setMessage("已產生新的加入連結，之前的連結已經失效");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function stopLink() {
    if (!window.confirm("停用後，連結立即失效；已經加入的學生不受影響。確定停用？")) return;
    setBusy(true);
    setMessage("");
    try {
      await revokeJoinLink(botId);
      setMessage("已停用加入連結");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("已複製連結");
    } catch {
      setMessage("無法自動複製，請自行選取上面的連結複製");
    }
  }

  async function removeMember(studentUid: string) {
    setBusy(true);
    setMessage("");
    try {
      await removeStudent(botId, studentUid);
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

  return (
    <Layout>
      <p className="back">
        <Link to={`/teacher/bots/${bot.id}`}>返回設定</Link>
      </p>
      <div className="page-head">
        <div>
          <p className="eyebrow">學生管理</p>
          <h1>{bot.name}</h1>
        </div>
      </div>
      {message ? <p className="notice">{message}</p> : null}

      <section className="panel stack">
        <h2>加入連結</h2>
        <p className="muted">
          把連結傳給學生。學生用學校 Google
          帳號登入後，就會自動加入這個聊天機械人。連結過期後不能再用來加入，已經加入的學生不受影響。
        </p>
        <div className="inline-form link-form">
          <label>
            連結有效期限
            <select
              value={duration}
              disabled={busy}
              onChange={(event) => setDuration(event.target.value as JoinDuration)}
            >
              {JOIN_DURATIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button" disabled={busy || bot.disabled} onClick={() => void makeLink()}>
            {link ? "重新產生連結" : "產生加入連結"}
          </button>
        </div>
        {bot.disabled ? <p className="muted">這個機械人已被管理員停用，學生暫時不能加入。</p> : null}
        {link ? (
          <div className="stack">
            <label>
              加入連結
              <input type="text" readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
            </label>
            <p className={linkActive ? "muted" : "notice"}>
              {linkActive
                ? `有效期限 ${durationLabel(link.duration)}，${remainingText(expiresAtMs, now)}（到期：${formatTime(link.expiresAt)}）`
                : `這個連結已在 ${formatTime(link.expiresAt)} 過期，請重新產生。`}
            </p>
            <div className="actions link-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy || !linkActive}
                onClick={() => void copyLink()}
              >
                複製連結
              </button>
              <button type="button" className="button secondary" disabled={busy} onClick={() => void stopLink()}>
                停用連結
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel stack">
        <h2>學生與對話紀錄</h2>
        <div className={selectedThread ? "split thread-open" : "split"}>
          <ul className="plain-list people-list">
            {people.length === 0 ? <li>尚未有學生。</li> : null}
            {people.map((person) => (
              <li key={person.uid} className="person-item">
                <div className="person-row">
                  <button
                    type="button"
                    className={person.uid === selectedUid ? "text-button active" : "text-button"}
                    onClick={() => chooseStudent(person)}
                  >
                    <strong>{person.email}</strong>
                    <span className="muted">
                      {person.member ? "已加入" : "已退出，紀錄仍保留"}，{person.threads.length} 個對話
                    </span>
                  </button>
                  {person.member ? (
                    <button
                      type="button"
                      className="button small secondary"
                      disabled={busy}
                      onClick={() => void removeMember(person.uid)}
                    >
                      移除
                    </button>
                  ) : null}
                </div>
                {person.uid === selectedUid ? (
                  <ul className="plain-list thread-sub">
                    {person.threads.length === 0 ? <li className="muted">這位學生尚未開始對話。</li> : null}
                    {person.threads.map((thread) => (
                      <li key={thread.id}>
                        <button
                          type="button"
                          className={thread.id === selectedThreadId ? "thread-item active" : "thread-item"}
                          onClick={() => setSelectedThreadId(thread.id)}
                        >
                          <strong>{thread.title || "先前的對話"}</strong>
                          <span className="muted">{formatTime(thread.updatedAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="transcript-pane">
            <button
              type="button"
              className="button secondary small back-to-list"
              onClick={() => setSelectedThreadId("")}
            >
              返回學生清單
            </button>
            <div className="transcript compact">
              {!selected ? <p className="muted">選擇學生以查看對話。</p> : null}
              {selected && !selectedThread ? <p className="muted">這位學生尚未開始對話。</p> : null}
              {selectedThread && messages.length === 0 ? <p className="muted">這個對話沒有訊息。</p> : null}
              {messages.map((item) => (
                <article key={item.id} className={item.role === "user" ? "bubble user" : "bubble assistant"}>
                  <header>{item.role === "user" ? "學生" : "機械人"}</header>
                  <MessageImages paths={item.images} />
                  <MessageText role={item.role} content={item.content} />
                  <time>{formatTime(item.createdAt)}</time>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
