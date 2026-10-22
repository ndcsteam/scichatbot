import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { beforeUserCreated } from "firebase-functions/v2/identity";
import { defineSecret, defineString } from "firebase-functions/params";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { emailMatchesDomain, parseEmailList } from "./domain.js";
import { extractPlainText, splitDocument } from "./extract.js";
import { buildContext, rankChunks } from "./rag.js";
import { registrationModeFrom, roleForNewAccount, type RegistrationMode } from "./registration.js";

initializeApp();

const db = getFirestore();
const auth = getAuth();

export const REGION = "asia-east1";

const allowedDomain = defineString("ALLOWED_GOOGLE_DOMAIN", { default: "" });
const bootstrapAdmins = defineString("BOOTSTRAP_ADMIN_EMAILS", { default: "" });
const poeApiKey = defineSecret("POE_API_KEY");

const callOptions = { region: REGION, invoker: "public" as const };
const ROLES = new Set(["admin", "teacher", "student"]);

type Role = "pending" | "admin" | "teacher" | "student";

export const guardSchoolDomain = beforeUserCreated((event) => {
  const email = event.data?.email ?? "";
  if (!event.data?.emailVerified || !emailMatchesDomain(email, allowedDomain.value())) {
    throw new HttpsError("permission-denied", "只允許已驗證的學校 Google 帳號登入");
  }
});

export const syncUser = onCall(callOptions, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const email = (request.auth?.token.email ?? "").toLowerCase();
  if (!emailMatchesDomain(email, allowedDomain.value())) {
    throw new HttpsError("permission-denied", "只允許學校 Google 帳號登入");
  }

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  const bootstrap = parseEmailList(bootstrapAdmins.value());
  const displayName = stringClaim(request.auth?.token.name) || email.split("@")[0] || "使用者";
  const photoURL = stringClaim(request.auth?.token.picture);

  if (!snap.exists) {
    const role: Role = roleForNewAccount(email, bootstrap, await registrationMode());
    await ref.set({
      email,
      displayName,
      photoURL,
      role,
      disabled: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    await auth.setCustomUserClaims(uid, { role });
    return { role, disabled: false, displayName, email };
  }

  const data = snap.data() ?? {};
  if (data.disabled === true) {
    throw new HttpsError("permission-denied", "此帳號已停用");
  }

  let role = asRole(data.role);
  if (role === "pending" && bootstrap.includes(email)) role = "admin";
  await ref.set(
    {
      email,
      displayName,
      photoURL,
      role,
    },
    { merge: true },
  );
  await auth.setCustomUserClaims(uid, { role });
  return { role, disabled: false, displayName, email };
});

export const setRegistrationMode = onCall(callOptions, async (request) => {
  await requireAdmin(request.auth?.uid, request.auth?.token.role);
  const mode = requireRegistrationMode(request.data?.mode);
  await db.collection("settings").doc("registration").set(
    {
      mode,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth?.uid ?? "",
    },
    { merge: true },
  );
  return { mode };
});

export const setUserRole = onCall(callOptions, async (request) => {
  await requireAdmin(request.auth?.uid, request.auth?.token.role);
  const uid = requireString(request.data?.uid, "缺少使用者");
  const role = requireString(request.data?.role, "缺少角色");
  if (!ROLES.has(role)) throw new HttpsError("invalid-argument", "角色必須是管理員、老師或學生");
  if (uid === request.auth?.uid && role !== "admin") {
    throw new HttpsError("failed-precondition", "不能移除自己的管理員角色");
  }

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "找不到這個帳號");
  await ref.update({ role });
  await auth.setCustomUserClaims(uid, { role });
  return { ok: true };
});

export const setUserDisabled = onCall(callOptions, async (request) => {
  await requireAdmin(request.auth?.uid, request.auth?.token.role);
  const uid = requireString(request.data?.uid, "缺少使用者");
  const disabled = request.data?.disabled === true;
  if (uid === request.auth?.uid) {
    throw new HttpsError("failed-precondition", "不能停用自己的帳號");
  }
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "找不到這個帳號");
  await auth.updateUser(uid, { disabled });
  await ref.update({ disabled });
  return { ok: true };
});

export const deleteStudent = onCall({ ...callOptions, timeoutSeconds: 120 }, async (request) => {
  await requireAdmin(request.auth?.uid, request.auth?.token.role);
  const uid = requireString(request.data?.uid, "缺少學生");
  if (uid === request.auth?.uid) {
    throw new HttpsError("failed-precondition", "不能刪除自己的帳號");
  }

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "找不到這個帳號");
  const role = snap.data()?.role;
  if (role !== "student" && role !== "pending") {
    throw new HttpsError("failed-precondition", "只能刪除待指派或學生帳號");
  }

  await deleteStudentRecords(uid);
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if (!isMissingAuthUser(error)) throw error;
  }
  await ref.delete();
  return { ok: true };
});

export const setBotDisabled = onCall(callOptions, async (request) => {
  await requireAdmin(request.auth?.uid, request.auth?.token.role);
  const botId = requireString(request.data?.botId, "缺少聊天機械人");
  const disabled = request.data?.disabled === true;
  const ref = db.collection("chatbots").doc(botId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "找不到聊天機械人");
  await ref.update({ disabled, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

export const inviteStudent = onCall(callOptions, async (request) => {
  const teacherUid = requireUid(request.auth?.uid);
  if (request.auth?.token.role !== "teacher") {
    throw new HttpsError("permission-denied", "只有老師可以邀請學生");
  }
  const botId = requireString(request.data?.botId, "缺少聊天機械人");
  const email = requireString(request.data?.email, "請輸入學生電郵").toLowerCase();
  await requireOwnedBot(botId, teacherUid);

  const users = await db.collection("users").where("email", "==", email).limit(1).get();
  if (users.empty) {
    throw new HttpsError("not-found", "此學生尚未用學校 Google 登入");
  }
  const student = users.docs[0];
  if (!student) throw new HttpsError("not-found", "此學生尚未用學校 Google 登入");
  const profile = student.data();
  if (profile.disabled === true) throw new HttpsError("failed-precondition", "此學生帳號已停用");
  if (profile.role !== "student") {
    throw new HttpsError("failed-precondition", "請管理員先把此帳號設為學生");
  }

  await db.collection("chatbots").doc(botId).collection("members").doc(student.id).set({
    studentUid: student.id,
    email,
    invitedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, studentUid: student.id };
});

export const removeStudent = onCall(callOptions, async (request) => {
  const teacherUid = requireUid(request.auth?.uid);
  if (request.auth?.token.role !== "teacher") {
    throw new HttpsError("permission-denied", "只有老師可以移除學生");
  }
  const botId = requireString(request.data?.botId, "缺少聊天機械人");
  const studentUid = requireString(request.data?.studentUid, "缺少學生");
  await requireOwnedBot(botId, teacherUid);
  await db.collection("chatbots").doc(botId).collection("members").doc(studentUid).delete();
  return { ok: true };
});

export const deleteDocument = onCall(callOptions, async (request) => {
  const teacherUid = requireUid(request.auth?.uid);
  if (request.auth?.token.role !== "teacher") {
    throw new HttpsError("permission-denied", "只有老師可以刪除知識文件");
  }
  const botId = requireString(request.data?.botId, "缺少聊天機械人");
  const docId = requireString(request.data?.docId, "缺少文件");
  await requireOwnedBot(botId, teacherUid);

  const docRef = db.collection("chatbots").doc(botId).collection("documents").doc(docId);
  const snap = await docRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "找不到文件");
  const storagePath = String(snap.data()?.storagePath ?? "");
  await deleteChunks(botId, docId);
  if (storagePath) {
    await getStorage().bucket().file(storagePath).delete({ ignoreNotFound: true });
  }
  await docRef.delete();
  return { ok: true };
});

export const processDocument = onObjectFinalized(
  { region: REGION, timeoutSeconds: 120, memory: "512MiB" },
  async (event) => {
    const filePath = event.data.name;
    const matched = filePath.match(/^chatbots\/([^/]+)\/docs\/([^/]+)\/([^/]+)$/);
    if (!matched) return;
    const botId = matched[1];
    const docId = matched[2];
    const fileName = matched[3];
    if (!botId || !docId || !fileName) return;

    const docRef = db.collection("chatbots").doc(botId).collection("documents").doc(docId);
    try {
      const [buffer] = await getStorage().bucket(event.data.bucket).file(filePath).download();
      const text = await extractPlainText(buffer, fileName);
      const parts = splitDocument(text);
      if (parts.length === 0) throw new Error("文件沒有可用文字");
      await deleteChunks(botId, docId);
      await writeChunks(botId, docId, parts);
      await docRef.set(
        {
          status: "ready",
          chunkCount: parts.length,
          errorMessage: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "無法讀取文件";
      await docRef.set(
        {
          status: "error",
          errorMessage: message.slice(0, 300),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

export const sendMessage = onCall(
  { ...callOptions, timeoutSeconds: 120, memory: "512MiB", secrets: [poeApiKey] },
  async (request) => {
    const studentUid = requireUid(request.auth?.uid);
    if (request.auth?.token.role !== "student") {
      throw new HttpsError("permission-denied", "只有學生可以傳送訊息");
    }
    const botId = requireString(request.data?.botId, "缺少聊天機械人");
    const content = requireString(request.data?.content, "請輸入訊息").trim();
    if (content.length > 4000) throw new HttpsError("invalid-argument", "訊息最長 4000 字");

    const botRef = db.collection("chatbots").doc(botId);
    const botSnap = await botRef.get();
    if (!botSnap.exists) throw new HttpsError("not-found", "找不到聊天機械人");
    const bot = botSnap.data() ?? {};
    if (bot.disabled === true) throw new HttpsError("failed-precondition", "此聊天機械人已停用");

    const memberSnap = await botRef.collection("members").doc(studentUid).get();
    if (!memberSnap.exists) throw new HttpsError("permission-denied", "你尚未被邀請使用此聊天機械人");

    const historySnap = await botRef
      .collection("conversations")
      .doc(studentUid)
      .collection("messages")
      .orderBy("seq", "desc")
      .limit(20)
      .get();
    const history = historySnap.docs
      .map((item) => item.data())
      .reverse()
      .filter((item) => item.role === "user" || item.role === "assistant")
      .map((item) => ({
        role: item.role as "user" | "assistant",
        content: String(item.content ?? ""),
      }));

    let systemPrompt = String(bot.systemPrompt ?? "").trim();
    if (bot.ragEnabled === true) {
      const chunks = await loadChunks(botId);
      const context = buildContext(rankChunks(content, chunks));
      const guidance = context
        ? `以下是與問題相關的參考資料。請優先依據這些資料回答；資料不足時請說明，不要捏造。\n\n${context}`
        : "目前沒有檢索到相關參考資料。若問題超出已提供的資料，請明白說明。";
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${guidance}` : guidance;
    }

    const answer = await askPoe(String(bot.model ?? ""), [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      ...history,
      { role: "user", content },
    ]);

    const conversationRef = botRef.collection("conversations").doc(studentUid);
    const messages = conversationRef.collection("messages");
    const now = FieldValue.serverTimestamp();
    const seq = Date.now();
    await messages.add({ role: "user", content, createdAt: now, seq });
    await messages.add({ role: "assistant", content: answer, createdAt: now, seq: seq + 1 });
    await conversationRef.set(
      {
        studentUid,
        email: memberSnap.data()?.email ?? request.auth?.token.email ?? "",
        updatedAt: now,
        lastMessage: answer.slice(0, 120),
      },
      { merge: true },
    );
    return { answer };
  },
);

async function askPoe(
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  const apiKey = poeApiKey.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "尚未設定 Poe API Key");
  if (!model.trim()) throw new HttpsError("failed-precondition", "尚未設定 AI 模型");
  const response = await fetch("https://api.poe.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream: false }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    const detail = body?.error?.message || `Poe API 回應 ${response.status}`;
    throw new HttpsError("internal", detail.slice(0, 300));
  }
  const answer = readContent(body?.choices?.[0]?.message?.content).trim();
  if (!answer) throw new HttpsError("internal", "模型沒有回覆內容");
  return answer;
}

function readContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("");
}

async function loadChunks(botId: string): Promise<Array<{ id: string; text: string }>> {
  const chunks: Array<{ id: string; text: string }> = [];
  let query = db.collection("chatbots").doc(botId).collection("chunks").orderBy(FieldPath.documentId()).limit(300);
  while (chunks.length < 2000) {
    const snap = await query.get();
    if (snap.empty) break;
    for (const item of snap.docs) {
      chunks.push({ id: item.id, text: String(item.data().text ?? "") });
    }
    if (snap.size < 300) break;
    const last = snap.docs[snap.docs.length - 1];
    if (!last) break;
    query = db
      .collection("chatbots")
      .doc(botId)
      .collection("chunks")
      .orderBy(FieldPath.documentId())
      .startAfter(last)
      .limit(300);
  }
  return chunks;
}

async function deleteChunks(botId: string, documentId: string): Promise<void> {
  while (true) {
    const snap = await db
      .collection("chatbots")
      .doc(botId)
      .collection("chunks")
      .where("documentId", "==", documentId)
      .limit(400)
      .get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
    if (snap.size < 400) return;
  }
}

async function writeChunks(botId: string, documentId: string, parts: string[]): Promise<void> {
  for (let index = 0; index < parts.length; index += 400) {
    const batch = db.batch();
    parts.slice(index, index + 400).forEach((text, offset) => {
      const ref = db.collection("chatbots").doc(botId).collection("chunks").doc();
      batch.set(ref, { documentId, text, index: index + offset });
    });
    await batch.commit();
  }
}

async function deleteStudentRecords(studentUid: string): Promise<void> {
  const bots = await db.collection("chatbots").get();
  for (const bot of bots.docs) {
    const memberRef = bot.ref.collection("members").doc(studentUid);
    const conversationRef = bot.ref.collection("conversations").doc(studentUid);
    const [memberSnap, conversationSnap] = await Promise.all([memberRef.get(), conversationRef.get()]);
    if (memberSnap.exists) await memberRef.delete();
    if (conversationSnap.exists) await db.recursiveDelete(conversationRef);
  }
}

function isMissingAuthUser(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "auth/user-not-found";
}

async function requireOwnedBot(botId: string, teacherUid: string): Promise<void> {
  const snap = await db.collection("chatbots").doc(botId).get();
  if (!snap.exists) throw new HttpsError("not-found", "找不到聊天機械人");
  if (snap.data()?.ownerId !== teacherUid) {
    throw new HttpsError("permission-denied", "你不是這個聊天機械人的老師");
  }
}

async function requireAdmin(uid: string | undefined, role: unknown): Promise<void> {
  requireUid(uid);
  if (role !== "admin") throw new HttpsError("permission-denied", "只有管理員可以執行這個操作");
}

function requireUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "請先登入");
  return uid;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", message);
  }
  return value.trim();
}

function stringClaim(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function registrationMode(): Promise<RegistrationMode> {
  const snap = await db.collection("settings").doc("registration").get();
  return registrationModeFrom(snap.data()?.mode);
}

function requireRegistrationMode(value: unknown): RegistrationMode {
  if (value === "manual" || value === "auto-student") return value;
  throw new HttpsError("invalid-argument", "請選擇手動批核或自動設為學生");
}

function asRole(value: unknown): Role {
  if (value === "admin" || value === "teacher" || value === "student" || value === "pending") return value;
  return "pending";
}
