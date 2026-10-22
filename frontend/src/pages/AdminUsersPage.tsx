import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { db } from "../firebase";
import { deleteStudent, setRegistrationMode, setUserDisabled, setUserRole } from "../lib/callables";
import { ROLE_LABEL } from "../lib/defaults";
import { errorText, formatTime } from "../lib/format";
import type { RegistrationMode, Role, UserProfile } from "../types";

type Row = UserProfile & { id: string };

const ASSIGNABLE: Role[] = ["admin", "teacher", "student"];

export function AdminUsersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Role>>({});
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [mode, setMode] = useState<RegistrationMode>("manual");
  const [modeReady, setModeReady] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);
  const modeBusyRef = useRef(false);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, "users"), orderBy("createdAt", "desc")), (snap) => {
      setRows(snap.docs.map((item) => ({ id: item.id, ...(item.data() as UserProfile) })));
    });
  }, []);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      doc(db, "settings", "registration"),
      (snap) => {
        if (modeBusyRef.current) return;
        setMode(snap.data()?.mode === "auto-student" ? "auto-student" : "manual");
        setModeReady(true);
      },
      () => {
        setModeReady(true);
      },
    );
  }, []);

  async function chooseMode(next: RegistrationMode) {
    if (!modeReady || modeBusy || next === mode) return;
    const previous = mode;
    modeBusyRef.current = true;
    setMode(next);
    setModeBusy(true);
    setMessage("");
    try {
      await setRegistrationMode(next);
    } catch (error) {
      setMode(previous);
      setMessage(errorText(error));
    } finally {
      modeBusyRef.current = false;
      setModeBusy(false);
    }
  }

  async function saveRole(row: Row) {
    const role = drafts[row.id] ?? row.role;
    if (role === "pending") return;
    setBusyId(row.id);
    setMessage("");
    try {
      await setUserRole(row.id, role);
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusyId("");
    }
  }

  async function removeStudentAccount(row: Row) {
    if (row.role !== "student" && row.role !== "pending") return;
    const confirmed = window.confirm(
      `確定刪除 ${row.displayName}（${row.email}）？帳號、邀請紀錄和對話會一併刪除，而且不能復原。`,
    );
    if (!confirmed) return;
    setBusyId(row.id);
    setMessage("");
    try {
      await deleteStudent(row.id);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusyId("");
    }
  }

  async function toggleDisabled(row: Row) {
    setBusyId(row.id);
    setMessage("");
    try {
      await setUserDisabled(row.id, !row.disabled);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusyId("");
    }
  }

  return (
    <Layout>
      <div className="page-head">
        <div>
          <p className="eyebrow">管理員</p>
          <h1>帳號</h1>
        </div>
      </div>
      <p className="muted">
        已用學校 Google 登入過的帳號會出現在這裡。更改角色後，對方重新整理頁面即可使用。待指派和學生帳號右側有刪除按鈕，刪除會一併移除邀請紀錄和對話。
      </p>
      <section className="panel">
        <h2>新帳號登記</h2>
        <p className="muted">
          任何管理員都可以更改。只影響之後第一次登入的帳號，清單裡現有帳號的角色維持不變。事先指定的管理員電郵仍然會在首次登入時成為管理員。
        </p>
        <fieldset className="choice-list" disabled={!modeReady || modeBusy}>
          <label className="choice">
            <input
              type="radio"
              name="registration-mode"
              value="manual"
              checked={mode === "manual"}
              onChange={() => void chooseMode("manual")}
            />
            <strong>手動批核</strong>
            <span>新帳號停在待指派，要由管理員指定老師或學生。</span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name="registration-mode"
              value="auto-student"
              checked={mode === "auto-student"}
              onChange={() => void chooseMode("auto-student")}
            />
            <strong>自動設為學生</strong>
            <span>新帳號第一次登入就成為學生，可以立即使用。</span>
          </label>
        </fieldset>
      </section>
      {message ? <p className="notice">{message}</p> : null}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>電郵</th>
              <th>角色</th>
              <th>狀態</th>
              <th>首次登入</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>尚未有人登入。</td>
              </tr>
            ) : (
              rows.map((row) => {
                const self = row.id === user?.uid;
                const selected = drafts[row.id] ?? row.role;
                return (
                  <tr key={row.id}>
                    <td>{row.displayName}</td>
                    <td>{row.email}</td>
                    <td>
                      <select
                        value={selected === "pending" ? "pending" : selected}
                        disabled={self || busyId === row.id}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [row.id]: event.target.value as Role }))
                        }
                      >
                        {selected === "pending" ? <option value="pending">待指派</option> : null}
                        {ASSIGNABLE.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{row.disabled ? "已停用" : "使用中"}</td>
                    <td>{formatTime(row.createdAt)}</td>
                    <td className="actions">
                      <button
                        type="button"
                        className="button small"
                        disabled={self || busyId === row.id || selected === "pending" || selected === row.role}
                        onClick={() => void saveRole(row)}
                      >
                        儲存角色
                      </button>
                      <button
                        type="button"
                        className="button small secondary"
                        disabled={self || busyId === row.id}
                        onClick={() => void toggleDisabled(row)}
                      >
                        {row.disabled ? "啟用" : "停用"}
                      </button>
                      {row.role === "student" || row.role === "pending" ? (
                        <button
                          type="button"
                          className="button small danger"
                          disabled={busyId === row.id}
                          onClick={() => void removeStudentAccount(row)}
                        >
                          刪除
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
