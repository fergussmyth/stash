import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";

const FUNCTION_PATH = "/functions/v1/token-create";

export default function ExtensionSettings() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tokens, setTokens] = useState([]);
  const [status, setStatus] = useState("");
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedToken, setGeneratedToken] = useState(null);
  const [copyMsg, setCopyMsg] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    loadTokens();
  }, [loading, user, navigate]);

  async function loadTokens() {
    setLoadingTokens(true);
    const { data, error } = await supabase
      .from("extension_tokens")
      .select("id, token_prefix, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false });
    if (error) {
      setStatus("Could not load tokens.");
      setLoadingTokens(false);
      return;
    }
    setTokens(data || []);
    setLoadingTokens(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    setStatus("");
    setGeneratedToken(null);

    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "";
    if (!supabaseUrl) {
      setStatus("Missing Supabase URL env var.");
      setGenerating(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      setStatus("You need to sign in again.");
      setGenerating(false);
      return;
    }

    const response = await fetch(`${supabaseUrl}${FUNCTION_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      setStatus("Could not create token.");
      setGenerating(false);
      return;
    }

    const payload = await response.json();
    if (!payload?.token) {
      setStatus("Token response missing.");
      setGenerating(false);
      return;
    }

    setGeneratedToken(payload);
    setGenerating(false);
    loadTokens();
  }

  async function handleCopy(token) {
    if (!navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(token);
    setCopyMsg("Copied token");
    setTimeout(() => setCopyMsg(""), 1500);
  }

  async function handleRevoke(tokenId) {
    const { error } = await supabase
      .from("extension_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", tokenId);
    if (error) {
      setStatus("Could not revoke token.");
      return;
    }
    loadTokens();
  }

  if (loading) {
    return (
      <div className="page">
        <div className="card glow">
          <h1>
            Extension Tokens <span>Loading</span>
          </h1>
          <div className="content">
            <p className="muted">Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="page">
      <div className="card glow">
        <h1>Extension Tokens</h1>
        <div className="content">
          {status && <div className="savedMsg">{status}</div>}
          {copyMsg && <div className="profileToast">{copyMsg}</div>}

          <div className="profileSection">
            <div className="profileLabel">Generate token</div>
            <p className="muted">
              Tokens are shown once. Copy it into the Chrome extension options page.
            </p>
            <div className="extensionTokenActions">
              <button className="secondary-btn" type="button" onClick={handleGenerate} disabled={generating}>
                {generating ? "Generating..." : "Generate token"}
              </button>
            </div>
            {generatedToken?.token && (
              <div className="tokenReveal">
                <div className="tokenValue">{generatedToken.token}</div>
                <button
                  className="miniBtn blue"
                  type="button"
                  onClick={() => handleCopy(generatedToken.token)}
                >
                  Copy
                </button>
              </div>
            )}
          </div>

          <div className="profileSection">
            <div className="profileLabel">Existing tokens</div>
            {loadingTokens ? (
              <div className="muted">Loading tokens...</div>
            ) : tokens.length === 0 ? (
              <div className="muted">No tokens yet.</div>
            ) : (
              <div className="tokenList">
                {tokens.map((token) => (
                  <div key={token.id} className="tokenRow">
                    <div className="tokenMeta">
                      <div className="tokenPrefix">Prefix: {token.token_prefix}</div>
                      <div className="tokenDates">
                        Created {new Date(token.created_at).toLocaleString()}
                        {token.last_used_at && (
                          <span> - Last used {new Date(token.last_used_at).toLocaleString()}</span>
                        )}
                        {token.revoked_at && <span className="tokenRevoked"> - Revoked</span>}
                      </div>
                    </div>
                    <div className="tokenActions">
                      <button
                        className="miniBtn danger"
                        type="button"
                        onClick={() => handleRevoke(token.id)}
                        disabled={!!token.revoked_at}
                      >
                        {token.revoked_at ? "Revoked" : "Revoke"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
