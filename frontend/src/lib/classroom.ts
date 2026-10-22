import { FirebaseError } from "firebase/app";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { allowedDomain, auth } from "../firebase";

const COURSE_SCOPE = "https://www.googleapis.com/auth/classroom.courses.readonly";
const ROSTER_SCOPE = "https://www.googleapis.com/auth/classroom.rosters.readonly";

export type ClassroomCourse = {
  id: string;
  name: string;
  section: string;
};

export type ClassroomStudent = {
  email: string;
  name: string;
};

export function classroomCancelled(error: unknown): boolean {
  return (
    error instanceof FirebaseError &&
    (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request")
  );
}

export async function connectClassroom(email: string): Promise<string> {
  if (!auth) throw new Error("尚未完成登入設定");
  const provider = new GoogleAuthProvider();
  provider.addScope(COURSE_SCOPE);
  provider.addScope(ROSTER_SCOPE);
  provider.setCustomParameters({
    hd: allowedDomain,
    login_hint: email,
    include_granted_scopes: "true",
  });
  const result = await signInWithPopup(auth, provider);
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error("無法取得 Google Classroom 授權");
  return token;
}

export async function listTeachingCourses(token: string): Promise<ClassroomCourse[]> {
  const courses: ClassroomCourse[] = [];
  let pageToken = "";
  do {
    const data = await classroomGet<{
      courses?: Array<{ id?: string; name?: string; section?: string }>;
      nextPageToken?: string;
    }>(token, "courses", {
      teacherId: "me",
      courseStates: "ACTIVE",
      pageSize: "50",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const course of data.courses ?? []) {
      if (!course.id || !course.name) continue;
      courses.push({ id: course.id, name: course.name, section: course.section ?? "" });
    }
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return courses;
}

export async function listCourseStudents(token: string, courseId: string): Promise<ClassroomStudent[]> {
  const students: ClassroomStudent[] = [];
  let pageToken = "";
  do {
    const data = await classroomGet<{
      students?: Array<{ profile?: { emailAddress?: string; name?: { fullName?: string } } }>;
      nextPageToken?: string;
    }>(token, `courses/${encodeURIComponent(courseId)}/students`, {
      pageSize: "100",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const student of data.students ?? []) {
      const email = student.profile?.emailAddress?.trim().toLowerCase() ?? "";
      if (!email) continue;
      students.push({ email, name: student.profile?.name?.fullName?.trim() || email });
    }
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return students;
}

async function classroomGet<T>(token: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://classroom.googleapis.com/v1/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message || "無法讀取 Google Classroom");
  return (body ?? {}) as T;
}
