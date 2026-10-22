import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Layout } from "../components/Layout";
import { db } from "../firebase";
import { deleteChatbot, setBotDisabled } from "../lib/callables";
import { errorText } from "../lib/format";
import type { Chatbot } from "../types";

type Row = Chatbot & { id: string };

export function AdminBotsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, "chatbots"), orderBy("createdAt", "desc")), (snap) => {
      setRows(snap.docs.map((item) => ({ id: item.id, ...(item.data() as Chatbot) })));
    });
  }, []);

  async function remove(row: Row) {
    const confirmed = window.confirm(
      `確定刪除聊天機械人「${row.name}」？參考資料、邀請和對話會一併刪除，而且不能復原。`,
    );
    if (!confirmed) return;
    setBusyId(row.id);
    setMessage("");
    try {
      await deleteChatbot(row.id);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusyId("");
    }
  }

  async function toggle(row: Row) {
    setBusyId(row.id);
    setMessage("");
    try {
      await setBotDisabled(row.id, !row.disabled);
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
          <h1>聊天機械人</h1>
        </div>
      </div>
      {message ? <p className="notice">{message}</p> : null}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>名稱</th>
              <th>老師</th>
              <th>模型</th>
              <th>參考資料</th>
              <th>狀態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>尚未有聊天機械人。</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.ownerEmail}</td>
                  <td>{row.model}</td>
                  <td>{row.ragEnabled ? "啟用" : "關閉"}</td>
                  <td>{row.disabled ? "已停用" : "使用中"}</td>
                  <td className="actions">
                    <button
                      type="button"
                      className="button small secondary"
                      disabled={busyId === row.id}
                      onClick={() => void toggle(row)}
                    >
                      {row.disabled ? "啟用" : "停用"}
                    </button>
                    <button
                      type="button"
                      className="button small danger"
                      disabled={busyId === row.id}
                      onClick={() => void remove(row)}
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
