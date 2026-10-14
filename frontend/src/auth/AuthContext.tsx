import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { allowedDomain, auth, db, firebaseReady } from "../firebase";
import { syncUser } from "../lib/callables";
import { emailMatchesDomain } from "../lib/domain";
import { errorText } from "../lib/format";
import type { Role, UserProfile } from "../types";

type AuthContextValue = {
  ready: boolean;
  firebaseReady: boolean;
  configured: boolean;
  user: User | null;
  profile: UserProfile | null;
  role: Role | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function asRole(value: unknown): Role {
  if (value === "admin" || value === "teacher" || value === "student" || value === "pending") return value;
  return "pending";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configured = firebaseReady && Boolean(allowedDomain);

  useEffect(() => {
    if (!auth || !configured) {
      setReady(true);
      return;
    }
    const firebaseAuth = auth;
    let ignore = false;
    const unsub = onAuthStateChanged(firebaseAuth, (next) => {
      void (async () => {
        if (!next) {
          if (ignore) return;
          setUser(null);
          setProfile(null);
          setRole(null);
          setReady(true);
          return;
        }
        if (!emailMatchesDomain(next.email ?? "", allowedDomain)) {
          await signOut(firebaseAuth);
          if (!ignore) {
            setError(`請使用學校 Google 帳號（@${allowedDomain}）`);
            setUser(null);
            setRole(null);
            setReady(true);
          }
          return;
        }
        try {
          await syncUser();
          const token = await next.getIdTokenResult(true);
          if (ignore) return;
          setUser(next);
          setRole(asRole(token.claims.role));
          setError(null);
        } catch (caught) {
          await signOut(firebaseAuth);
          if (!ignore) {
            setUser(null);
            setRole(null);
            setError(errorText(caught));
          }
        } finally {
          if (!ignore) setReady(true);
        }
      })();
    });
    return () => {
      ignore = true;
      unsub();
    };
  }, [configured]);

  useEffect(() => {
    if (!db || !auth || !user) return;
    const firebaseAuth = auth;
    let active = true;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      void (async () => {
        if (!active || !snap.exists()) return;
        const data = snap.data() as UserProfile;
        setProfile(data);
        if (data.disabled) {
          setError("此帳號已停用");
          await signOut(firebaseAuth);
          return;
        }
        const token = await user.getIdTokenResult();
        if (!active) return;
        if (asRole(token.claims.role) !== asRole(data.role)) {
          const refreshed = await user.getIdTokenResult(true);
          if (active) setRole(asRole(refreshed.claims.role));
        }
      })();
    });
    return () => {
      active = false;
      unsub();
    };
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      firebaseReady,
      configured,
      user,
      profile,
      role,
      error,
      clearError: () => setError(null),
      signIn: async () => {
        if (!auth || !configured) {
          setError("請先完成 Firebase 與學校網域設定");
          return;
        }
        setError(null);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ hd: allowedDomain, prompt: "select_account" });
        try {
          await signInWithPopup(auth, provider);
        } catch (caught) {
          if (caught instanceof FirebaseError && caught.code === "auth/popup-blocked") {
            await signInWithRedirect(auth, provider);
            return;
          }
          if (caught instanceof FirebaseError && caught.code === "auth/popup-closed-by-user") return;
          setError(errorText(caught));
        }
      },
      signOutUser: async () => {
        if (!auth) return;
        await signOut(auth);
      },
    }),
    [configured, error, profile, ready, role, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider 未掛載");
  return value;
}
