import { useEffect, useMemo, useState, type FormEvent } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { db } from "../firebase";
import { inviteStudent, removeStudent } from "../lib/callables";
import {
  classroomCancelled,
  connectClassroom,
  listCourseStudents,
  listTeachingCourses,
  type ClassroomCourse,
  type ClassroomStudent,
} from "../lib/classroom";
import { errorText, formatTime } from "../lib/format";
import type { Chatbot, ChatMessage, ConversationMeta, Member } from "../types";

type Person = {
  uid: string;
  email: string;
  member: boolean;
  lastMessage?: string;
};

export function TeacherStudentsPage() {
  const { botId = "" } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const [bot, setBot] = useState<(Chatbot & { id: string }) | null>(null);
  const [missing, setMissing] = useState(false);
  const [members, setMembers] = useState<Array<Member & { id: string }>>([]);
  const [conversations, setConversations] = useState<Array<ConversationMeta & { id: string }>>([]);
  const [selectedUid, setSelectedUid] = useState("");
  const [messages, setMessages] = useState<Array<ChatMessage & { id: string }>>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [classroomToken, setClassroomToken] = useState("");
  const [courses, setCourses] = useState<ClassroomCourse[]>([]);
  const [courseId, setCourseId] = useState("");
  const [roster, setRoster] = useState<ClassroomStudent[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    const notice = (location.state as { notice?: string } | null)?.notice;
    if (notice) setMessage(notice);
  }, [location.state]);

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
  const selected = people.find((person) => person.uid === selectedUid);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setNotes([]);
    try {
      await inviteStudent(botId, inviteEmail.trim());
      setInviteEmail("");
      setMessage("已邀請學生");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(studentUid: string) {
    setBusy(true);
    setMessage("");
    setNotes([]);
    try {
      await removeStudent(botId, studentUid);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadCourses() {
    const email = user?.email ?? "";
    if (!email) {
      setMessage("這個帳號沒有電郵，無法連接 Google Classroom");
      return;
    }
    setBusy(true);
    setMessage("");
    setNotes([]);
    try {
      const token = classroomToken || (await connectClassroom(email));
      setClassroomToken(token);
      const next = await listTeachingCourses(token);
      setCourses(next);
      setCourseId("");
      setRoster([]);
      setPicked([]);
      if (next.length === 0) setMessage("這個 Google 帳號沒有進行中的課堂");
    } catch (error) {
      if (!classroomCancelled(error)) setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function chooseCourse(nextCourseId: string) {
    setCourseId(nextCourseId);
    setRoster([]);
    setPicked([]);
    if (!nextCourseId || !classroomToken) return;
    setBusy(true);
    setMessage("");
    setNotes([]);
    try {
      const students = await listCourseStudents(classroomToken, nextCourseId);
      setRoster(students);
      setPicked(students.map((student) => student.email));
      if (students.length === 0) setMessage("這個課堂沒有可匯入的學生電郵");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function toggleStudent(email: string) {
    setPicked((current) => (current.includes(email) ? current.filter((item) => item !== email) : [...current, email]));
  }

  async function importRoster() {
    const chosen = roster.filter((student) => picked.includes(student.email));
    if (chosen.length === 0) {
      setMessage("請先選擇學生");
      return;
    }
    setBusy(true);
    setMessage("");
    setNotes([]);
    const failed: string[] = [];
    let invited = 0;
    for (const student of chosen) {
      try {
        await inviteStudent(botId, student.email);
        invited += 1;
      } catch (error) {
        failed.push(`${student.name}（${student.email}）：${errorText(error)}`);
      }
    }
    setNotes(failed);
    setMessage(failed.length === 0 ? `已邀請 ${invited} 人` : `已邀請 ${invited} 人，${failed.length} 人未能加入`);
    setBusy(false);
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
      {notes.length > 0 ? (
        <ul className="plain-list">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      <section className="panel stack">
        <h2>邀請學生</h2>
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
      </section>

      <section className="panel stack">
        <h2>從 Google Classroom 匯入</h2>
        <p className="muted">使用這位老師的 Google 帳號讀取進行中的課堂，再選擇要加入的學生。</p>
        <button type="button" className="button secondary" disabled={busy} onClick={() => void loadCourses()}>
          {classroomToken ? "重新讀取課堂" : "連接 Google Classroom"}
        </button>
        {courses.length > 0 ? (
          <label>
            課堂
            <select value={courseId} disabled={busy} onChange={(event) => void chooseCourse(event.target.value)}>
              <option value="">選擇課堂</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.section ? `${course.name}（${course.section}）` : course.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {roster.length > 0 ? (
          <>
            <div className="choice-list">
              {roster.map((student) => (
                <label key={student.email} className="choice">
                  <input
                    type="checkbox"
                    checked={picked.includes(student.email)}
                    disabled={busy}
                    onChange={() => toggleStudent(student.email)}
                  />
                  <strong>{student.name}</strong>
                  <span>{student.email}</span>
                </label>
              ))}
            </div>
            <button type="button" className="button" disabled={busy || picked.length === 0} onClick={() => void importRoster()}>
              匯入已選學生
            </button>
          </>
        ) : null}
      </section>

      <section className="panel stack">
        <h2>學生與對話紀錄</h2>
        <div className="split">
          <ul className="plain-list">
            {people.length === 0 ? <li>尚未有學生。</li> : null}
            {people.map((person) => (
              <li key={person.uid}>
                <button
                  type="button"
                  className={person.uid === selectedUid ? "text-button active" : "text-button"}
                  onClick={() => setSelectedUid(person.uid)}
                >
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
