import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sessionUser, setSessionUser] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rememberedProfile, setRememberedProfile] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem("stashRememberedProfile");
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  });
  const [softLoggedOut, setSoftLoggedOut] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("stashSoftLogout") === "true";
  });

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSessionUser(data?.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSessionUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessionUser && softLoggedOut) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("stashSoftLogout");
      }
      setSoftLoggedOut(false);
    }
    if (softLoggedOut) {
      setUser(null);
      return;
    }
    setUser(sessionUser ?? null);
  }, [sessionUser, softLoggedOut]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .upsert({ id: user.id, email: user.email ?? null })
      .then(({ error }) => {
        if (error) {
          // eslint-disable-next-line no-console
          console.error("Failed to upsert profile:", error.message);
        }
      });
  }, [user]);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const rememberMe = window.localStorage.getItem("stashRememberMe") === "true";
    if (!rememberMe) return;

    rememberCurrentUser(user);
  }, [user]);

  const rememberCurrentUser = (currentUser = user) => {
    if (!currentUser || typeof window === "undefined") return;
    const profile = {
      id: currentUser.id,
      email: currentUser.email ?? "",
      name:
        currentUser.user_metadata?.full_name ||
        currentUser.user_metadata?.name ||
        currentUser.user_metadata?.username ||
        (currentUser.email ? currentUser.email.split("@")[0] : "User"),
      avatar_url: currentUser.user_metadata?.avatar_url || "",
    };

    window.localStorage.setItem("stashRememberedProfile", JSON.stringify(profile));
    setRememberedProfile(profile);
  };

  const clearRememberedProfile = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("stashRememberedProfile");
      window.localStorage.setItem("stashRememberMe", "false");
      window.localStorage.removeItem("stashSoftLogout");
    }
    setRememberedProfile(null);
  };

  const softLogout = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("stashSoftLogout", "true");
    }
    setSoftLoggedOut(true);
    setUser(null);
  };

  const resumeSession = () => {
    if (!sessionUser) return false;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("stashSoftLogout");
    }
    setSoftLoggedOut(false);
    setUser(sessionUser);
    return true;
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      rememberedProfile,
      rememberCurrentUser,
      clearRememberedProfile,
      softLogout,
      resumeSession,
    }),
    [user, loading, rememberedProfile, sessionUser, softLoggedOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
