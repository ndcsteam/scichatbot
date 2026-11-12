import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { Link, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { ArrowRightIcon, TrashIcon } from "../components/Icons";
import { MessageItem } from "../components/MessageItem";
import { db } from "../firebase";
import { removeStudent } from "../lib/callables";
import { errorText, formatTime } from "../lib/format";
import type { Chatbot, ChatMessage, ConversationMeta, Member } from "../types";

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

export function TeacherRecordsPage() {
  const { botId = "" } = useParams();
  const [bot, setBot] = useState<(Chatbot & { id: string }) | null>(null);
  const [missing, setMissing] = useState(false);
  const [members, setMembers] = useState<Array<Member & { id: string }>>([]);
  const [conversations, setConversations] = useState<Thread[]>([]);
  const [selectedUid, setSelectedUid] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [messages, setMessages] = useState<Array<ChatMessage & { id: string }>>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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
  // 手機一次只顯示一欄：學生 -> 對話 -> 內容。
  const step = !selected ? "students" : !selectedThread ? "threads" : "chat";

  function chooseStudent(person: Person) {
    setSelectedUid(person.uid);
    setSelectedThreadId("");
  }

  async function removeMember(person: Person) {
    if (!window.confirm(`移除 ${person.email} 後，對方不能再發言，既有紀錄仍會保留。確定移除？`)) return;
    setBusy(true);
    setMessage("");
    try {
      await removeStudent(botId, person.uid);
      setMessage(`已移除 ${person.email}`);
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
    <Layout wide>
      <div className={`records-page step-${step}`}>
        <div className="records-bar">
          <Link to={`/teacher/bots/${bot.id}/students`} className="back-link">
            返回學生管理
          </Link>
          <div className="records-title">
            <h1>{bot.name}</h1>
            <span className="muted">學生與對話紀錄</span>
          </div>
        </div>
        {message ? <p className="notice records-notice">{message}</p> : null}

        <div className="records-grid">
          <section className="records-col col-students" aria-label="學生">
            <header className="records-col-head">
              <h2>學生</h2>
              <span className="count">{people.length}</span>
            </header>
            <ul className="records-list">
              {people.length === 0 ? <li className="records-empty">尚未有學生。</li> : null}
              {people.map((person) => (
                <li key={person.uid}>
                  <button
                    type="button"
                    className={person.uid === selectedUid ? "record-item active" : "record-item"}
                    title={person.email}
                    onClick={() => chooseStudent(person)}
                  >
                    <strong>{person.email}</strong>
                    <span className="muted">
                      {person.threads.length} 個對話{person.member ? "" : "，已退出"}
                    </span>
                    <ArrowRightIcon size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="records-col col-threads" aria-label="對話">
            <header className="records-col-head">
              <button type="button" className="button secondary small records-back" onClick={() => setSelectedUid("")}>
                返回學生
              </button>
              <h2>對話</h2>
              {selected ? <span className="count">{selected.threads.length}</span> : null}
            </header>
            <ul className="records-list">
              {!selected ? <li className="records-empty">請先選擇學生</li> : null}
              {selected && selected.threads.length === 0 ? (
                <li className="records-empty">這位學生尚未開始對話。</li>
              ) : null}
              {selected?.threads.map((thread) => (
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
            {selected?.member ? (
              <div className="records-foot phone-only">
                <button
                  type="button"
                  className="button small secondary danger"
                  disabled={busy}
                  onClick={() => void removeMember(selected)}
                >
                  <TrashIcon size={16} />
                  移除這位學生
                </button>
              </div>
            ) : null}
          </section>

          <section className="records-col col-chat" aria-label="對話內容">
            <header className="records-col-head chat-head-bar">
              <button
                type="button"
                className="button secondary small records-back"
                onClick={() => setSelectedThreadId("")}
              >
                返回對話
              </button>
              <div className="records-chat-title">
                <h2>{selected ? selected.email : "對話內容"}</h2>
                {selectedThread ? <span className="muted">{selectedThread.title || "先前的對話"}</span> : null}
              </div>
              {selected?.member ? (
                <button
                  type="button"
                  className="button small secondary danger records-remove"
                  disabled={busy}
                  onClick={() => void removeMember(selected)}
                >
                  <TrashIcon size={16} />
                  移除這位學生
                </button>
              ) : null}
            </header>
            <div className="records-transcript">
              {!selected ? <p className="records-empty">選擇學生與對話後，在這裡查看內容。</p> : null}
              {selected && !selectedThread ? <p className="records-empty">請從中間選擇一個對話。</p> : null}
              {selectedThread && messages.length === 0 ? <p className="records-empty">這個對話沒有訊息。</p> : null}
              {messages.map((item) => (
                <MessageItem
                  key={item.id}
                  role={item.role}
                  content={item.content}
                  images={item.images}
                  time={formatTime(item.createdAt)}
                  userLabel="學生"
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
