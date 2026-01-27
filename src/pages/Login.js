import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";

export function LoginForm({ redirectTo = null }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

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
    const { error: authError } = await authCall;
    setSending(false);

    if (authError) {
      setError(authError.message);
      return;
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
    <div className="loginBox">
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
      <button className="primary-btn" type="button" onClick={handleEmailAuth} disabled={sending}>
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
    </div>
  );
}

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/trips", { replace: true });
    }
  }, [loading, user, navigate]);

  return (
    <div className="page">
      <div className="card glow">
        <h1>
          TripTok <span>Login</span>
        </h1>

        <div className="content">
          <p className="muted">Sign in to save trips and share across devices.</p>

          <LoginForm redirectTo="/trips" />

          <div className="navRow">
            <Link className="miniBtn linkBtn" to="/">
              ← Back
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
