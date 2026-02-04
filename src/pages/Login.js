import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import signInGraphic from "../assets/images/new-sign-in-graphic.png";
import stashFavicon from "../assets/icons/stash-favicon.png";

export function LoginForm({ redirectTo = null, initialEmail = "" }) {
  const navigate = useNavigate();
  const { clearRememberedProfile } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("stashRememberMe") === "true";
  });

  async function handleEmailAuth() {
    setError("");
    setStatus("");
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setSending(true);
    const authCall =
      mode === "signup"
        ? supabase.auth.signUp({ email: trimmed, password })
        : supabase.auth.signInWithPassword({ email: trimmed, password });
    const { data, error: authError } = await authCall;
    setSending(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem("stashRememberMe", rememberMe ? "true" : "false");
      window.localStorage.setItem("stashShowRememberPrompt", rememberMe ? "false" : "true");
      if (!rememberMe) {
        window.localStorage.removeItem("stashRememberedProfile");
      }
    }
    if (!rememberMe) {
      clearRememberedProfile();
    }

    if (rememberMe && data?.user && typeof window !== "undefined") {
      const profile = {
        id: data.user.id,
        email: data.user.email ?? "",
        name:
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          data.user.user_metadata?.username ||
          (data.user.email ? data.user.email.split("@")[0] : "User"),
        avatar_url: data.user.user_metadata?.avatar_url || "",
      };
      window.localStorage.setItem("stashRememberedProfile", JSON.stringify(profile));
    }

    if (redirectTo) {
      navigate(redirectTo, { replace: true });
      return;
    }

    setStatus(mode === "signup" ? "Account created. You’re signed in." : "Signed in.");
  }

  async function handleOAuth(provider) {
    setError("");
    setStatus("");
    if (typeof window !== "undefined") {
      window.localStorage.setItem("stashRememberMe", rememberMe ? "true" : "false");
      window.localStorage.setItem("stashShowRememberPrompt", rememberMe ? "false" : "true");
      if (!rememberMe) {
        window.localStorage.removeItem("stashRememberedProfile");
      }
    }
    if (!rememberMe) {
      clearRememberedProfile();
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectTo
          ? `${window.location.origin}${redirectTo}`
          : window.location.href,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
    }
  }

  return (
    <form
      className="loginBox"
      onSubmit={(event) => {
        event.preventDefault();
        handleEmailAuth();
      }}
    >
      <div className="authTabs">
        <button
          className={`miniBtn ${mode === "signin" ? "activeTab" : ""}`}
          type="button"
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          className={`miniBtn ${mode === "signup" ? "activeTab" : ""}`}
          type="button"
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
      </div>

      <input
        className="input"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="input"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <label className="rememberRow">
        <input
          className="rememberCheckbox"
          type="checkbox"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
        />
        Remember me on this device
      </label>
      <button className="primary-btn" type="submit" disabled={sending}>
        {sending ? "Working..." : mode === "signup" ? "Create account" : "Sign in"}
      </button>
      <div className="authDivider">or</div>
      <div className="authProviders">
        <button className="secondary-btn" type="button" onClick={() => handleOAuth("google")}>
          Continue with Google
        </button>
        <button className="secondary-btn" type="button" onClick={() => handleOAuth("apple")}>
          Continue with Apple
        </button>
      </div>
      {status && <div className="successMsg">{status}</div>}
      {error && <p className="error">✕ {error}</p>}
    </form>
  );
}

export default function Login() {
  const { user, loading, rememberedProfile, resumeSession, clearRememberedProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const prefillEmail = location.state?.prefillEmail ?? "";

  useEffect(() => {
    if (!loading && user) {
      navigate("/", { replace: true });
    }
  }, [loading, user, navigate]);

  return (
    <div className="authScreen">
      <Link className="authBrand" to="/" aria-label="Stash home">
        <img className="authBrandLogo" src={stashFavicon} alt="Stash" />
      </Link>
      <div className="authMobileTitle" aria-hidden="true">
        Stash
      </div>

      <div className="authSplit">
        <section className="authLeft">
          <div className="authLeftInner">
            <p className="authEyebrow">No folders. No mess. Just your stash.</p>
            <h1 className="authTitle">Your internet, organised.</h1>
            <p className="authSubtitle">Save links from anywhere...</p>
            <div className="authGraphicWrap">
              <img
                className="authGraphic"
                src={signInGraphic}
                alt="Preview of shared travel collections"
              />
            </div>
          </div>
        </section>

        <section className="authRight">
          <div className="authCard">
            {rememberedProfile && (
              <div className="rememberCard">
                <div className="rememberAvatar">
                  {rememberedProfile.avatar_url ? (
                    <img src={rememberedProfile.avatar_url} alt="" />
                  ) : (
                    <span>
                      {(rememberedProfile.name || "U").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="rememberName">Continue as {rememberedProfile.name || "User"}</div>
                <button
                  className="primary-btn rememberContinue"
                  type="button"
                  onClick={() => {
                    const resumed = resumeSession();
                    if (!resumed) {
                      navigate("/login", {
                        state: { prefillEmail: rememberedProfile.email || "" },
                      });
                    }
                  }}
                >
                  Continue
                </button>
                <div className="rememberActions">
                  <button
                    className="miniBtn"
                    type="button"
                    onClick={() => {
                      clearRememberedProfile();
                      supabase.auth.signOut();
                    }}
                  >
                    Use another profile
                  </button>
                  <button
                    className="miniBtn"
                    type="button"
                    onClick={() => {
                      clearRememberedProfile();
                      supabase.auth.signOut();
                    }}
                  >
                    Forget this device
                  </button>
                </div>
                <div className="authDivider">or</div>
              </div>
            )}
            {!rememberedProfile && (
              <>
                <div className="authCardHeader">
                  <div className="authCardTitle">Sign in or create an account</div>
                  <div className="authCardSubtitle">
                    Use email or connect a provider to continue.
                  </div>
                </div>

                <LoginForm redirectTo="/" initialEmail={prefillEmail} />
              </>
            )}

            <div className="authCardFooter">
              <span>Just browsing?</span>
              <Link className="authLink" to="/">
                Back to home
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
