import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";

export default function Profile() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [sharedTrips, setSharedTrips] = useState([]);
  const [copyMsg, setCopyMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  function makeShareId(length = 12) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < length; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    let mounted = true;
    async function loadProfile() {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      if (!mounted) return;
      setDisplayName(data?.display_name || "");
    }
    async function loadSharedTrips() {
      const { data } = await supabase
        .from("trips")
        .select("id,name,share_id,is_shared,trip_items(count)")
        .eq("owner_id", user.id)
        .eq("is_shared", true)
        .order("created_at", { ascending: false });
      if (!mounted) return;
      setSharedTrips(data || []);
    }
    loadProfile();
    loadSharedTrips();
    return () => {
      mounted = false;
    };
  }, [loading, user, navigate]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setStatus("");
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: displayName || null });
    setSaving(false);
    if (error) {
      setStatus("Could not save right now.");
      return;
    }
    setStatus("Saved.");
    setTimeout(() => setStatus(""), 1500);
  }

  async function handleCopyShare(trip) {
    const rawShareBase = process.env.REACT_APP_SHARE_ORIGIN || window.location.origin;
    const shareBase = rawShareBase.replace(/\/+$/, "");
    const shareUrl = `${shareBase}/share/${trip.share_id}`;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      setCopyMsg("Copied link");
      setToastMsg("Copied");
      setTimeout(() => setCopyMsg(""), 1500);
      setTimeout(() => setToastMsg(""), 1500);
    }
  }

  async function handleRevokeShare(trip) {
    const { error } = await supabase
      .from("trips")
      .update({ is_shared: false, share_id: null })
      .eq("id", trip.id)
      .eq("owner_id", user.id);
    if (error) {
      setStatus("Could not revoke share.");
      return;
    }
    setSharedTrips((prev) => prev.filter((t) => t.id !== trip.id));
    setToastMsg("Share revoked");
    setTimeout(() => setToastMsg(""), 1500);
  }

  async function handleRegenerateShare(trip) {
    const nextShareId = makeShareId(12);
    const { error } = await supabase
      .from("trips")
      .update({ is_shared: true, share_id: nextShareId })
      .eq("id", trip.id)
      .eq("owner_id", user.id);
    if (error) {
      setStatus("Could not regenerate link.");
      return;
    }
    setSharedTrips((prev) =>
      prev.map((t) => (t.id === trip.id ? { ...t, share_id: nextShareId, is_shared: true } : t))
    );
    setToastMsg("Link regenerated");
    setTimeout(() => setToastMsg(""), 1500);
  }

  function handleOpenTrip(trip) {
    navigate(`/trips/${trip.id}`);
  }

  if (loading) {
    return (
      <div className="page">
        <div className="card glow">
          <h1>
            Profile <span>Loading</span>
          </h1>
          <div className="content">
            <p className="muted">Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="page">
      <div className="card glow">
        <h1>Profile</h1>
        <div className="content">
          {toastMsg && <div className="toast">{toastMsg}</div>}
          <div className="profileSection">
            <div className="profileLabel">Email</div>
            <div className="profileValue mutedValue">{user.email}</div>
          </div>

          <div className="profileSection">
            <div className="profileLabel">Display name</div>
            <form
              className="profileRow"
              onSubmit={(event) => {
                event.preventDefault();
                handleSave();
              }}
            >
              <input
                className="input displayInput"
                placeholder="Add a display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <button className="secondary-btn" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </form>
            {status && <div className="savedMsg">{status}</div>}
          </div>

          <div className="profileSection">
            <div className="profileLabel">Chrome extension</div>
            <div className="profileRow">
              <div className="muted">Generate and revoke tokens for the extension.</div>
              <Link className="secondary-btn" to="/settings/extension">
                Manage tokens
              </Link>
            </div>
          </div>

          <div className="profileSection">
            <div className="profileLabelRow">
              <div className="profileLabel">My shared collections</div>
              {copyMsg && <div className="profileToast">{copyMsg}</div>}
            </div>
            {sharedTrips.length === 0 ? (
              <div className="muted">No shared collections yet.</div>
            ) : (
              <div className="profileTripList">
                {sharedTrips.map((trip) => (
                  <div
                    key={trip.id}
                    className="profileTripRow clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenTrip(trip)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleOpenTrip(trip);
                      }
                    }}
                  >
                    <div className="profileTripMeta">
                      <div className="profileTripName">{trip.name}</div>
                      <div className="profileTripCount">
                        {(trip.trip_items?.[0]?.count || 0)} links
                      </div>
                    </div>
                    <div className="profileTripActions">
                      <button
                        className="miniBtn blue"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCopyShare(trip);
                        }}
                      >
                        Copy link
                      </button>
                      <button
                        className="miniBtn"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRegenerateShare(trip);
                        }}
                      >
                        Regenerate
                      </button>
                      <button
                        className="miniBtn danger"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRevokeShare(trip);
                        }}
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="profileSection">
            {confirmSignOut ? (
              <div className="signOutConfirm">
                <div>Sign out of this device?</div>
                <div className="signOutActions">
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={() => supabase.auth.signOut()}
                  >
                    Sign out
                  </button>
                  <button
                    className="miniBtn"
                    type="button"
                    onClick={() => setConfirmSignOut(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="secondary-btn" type="button" onClick={() => setConfirmSignOut(true)}>
                Sign out
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
