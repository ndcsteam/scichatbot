import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { ArrowRightIcon, CopyIcon, LinkIcon, TrashIcon, UsersIcon } from "../components/Icons";
import { db } from "../firebase";
import { createJoinLink, revokeJoinLink } from "../lib/callables";
import { errorText, formatTime } from "../lib/format";
import { durationLabel, JOIN_DURATIONS, joinUrl, remainingText } from "../lib/joinLink";
import type { Chatbot, JoinDuration, JoinLink, Member } from "../types";

type ActiveLink = JoinLink & { token: string };

export function TeacherStudentsPage() {
  const { botId = "" } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const [bot, setBot] = useState<(Chatbot & { id: string }) | null>(null);
  const [missing, setMissing] = useState(false);
  const [members, setMembers] = useState<Array<Member & { id: string }>>([]);
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
        <h2 className="section-title">
          <LinkIcon size={20} />
          加入連結
        </h2>
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
                <CopyIcon size={16} />
                複製連結
              </button>
              <button type="button" className="button secondary" disabled={busy} onClick={() => void stopLink()}>
                <TrashIcon size={16} />
                停用連結
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel records-entry">
        <div>
          <h2 className="section-title">
            <UsersIcon size={20} />
            學生與對話紀錄
          </h2>
          <p className="muted">
            {members.length} 位學生已加入
          </p>
        </div>
        <Link className="button" to={`/teacher/bots/${bot.id}/records`}>
          打開學生與對話紀錄
          <ArrowRightIcon size={18} />
        </Link>
      </section>
    </Layout>
  );
}
