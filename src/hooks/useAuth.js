import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sessionUser, setSessionUser] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);
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

  const buildRememberedProfile = (currentUser = user) => {
    if (!currentUser) return null;
    return {
      id: currentUser.id,
      email: currentUser.email ?? "",
      name:
        currentUser.user_metadata?.display_name ||
        currentUser.user_metadata?.full_name ||
        currentUser.user_metadata?.name ||
        currentUser.user_metadata?.username ||
        (currentUser.email ? currentUser.email.split("@")[0] : "User"),
      avatar_url: currentUser.user_metadata?.avatar_url || "",
    };
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSessionUser(data?.session?.user ?? null);
      setSessionChecked(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSessionUser(session?.user ?? null);
      setSessionChecked(true);
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
    } else {
      setUser(sessionUser ?? null);
    }
    if (sessionChecked) {
      setLoading(false);
    }
  }, [sessionUser, softLoggedOut, sessionChecked]);

  useEffect(() => {
    if (!user) return;
    const payload = { id: user.id };
    const metadataDisplayName = user.user_metadata?.display_name;
    if (metadataDisplayName) {
      payload.display_name = metadataDisplayName;
    }
    const metadataAvatar = user.user_metadata?.avatar_url;
    if (metadataAvatar) {
      payload.avatar_url = metadataAvatar;
    }
    supabase.from("profiles").upsert(payload).then(({ error }) => {
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

    let active = true;
    const rememberWithProfile = async () => {
      const baseProfile = buildRememberedProfile(user);
      let displayName = baseProfile.name;
      let avatarUrl = baseProfile.avatar_url;

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", user.id)
          .single();
        if (!error && data) {
          if (data.display_name) displayName = data.display_name;
          if (data.avatar_url) avatarUrl = data.avatar_url;
        }
      } catch (err) {
        // ignore profile lookup failures
      }

      if (!active) return;
      const profile = { ...baseProfile, name: displayName, avatar_url: avatarUrl };
      window.localStorage.setItem("stashRememberedProfile", JSON.stringify(profile));
      setRememberedProfile(profile);
    };

    rememberWithProfile();
    return () => {
      active = false;
    };
  }, [user]);

  const rememberCurrentUser = (currentUser = user) => {
    if (!currentUser || typeof window === "undefined") return;
    const profile = buildRememberedProfile(currentUser);
    if (!profile) return;

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
