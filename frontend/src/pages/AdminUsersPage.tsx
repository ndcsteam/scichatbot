import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { db } from "../firebase";
import { setUserDisabled, setUserRole } from "../lib/callables";
import { ROLE_LABEL } from "../lib/defaults";
import { errorText, formatTime } from "../lib/format";
import type { Role, UserProfile } from "../types";

type Row = UserProfile & { id: string };

const ASSIGNABLE: Role[] = ["admin", "teacher", "student"];

export function AdminUsersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Role>>({});
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, "users"), orderBy("createdAt", "desc")), (snap) => {
      setRows(snap.docs.map((item) => ({ id: item.id, ...(item.data() as UserProfile) })));
    });
  }, []);

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
      <p className="muted">已用學校 Google 登入過的帳號會出現在這裡。指派角色後，對方重新整理頁面即可使用。</p>
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
