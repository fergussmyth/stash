import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
        .select("id,name,share_id,is_shared")
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
    const shareBase = process.env.REACT_APP_SHARE_ORIGIN || window.location.origin;
    const shareUrl = `${shareBase}/share/${trip.share_id}`;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      setCopyMsg("Copied link");
      setTimeout(() => setCopyMsg(""), 1500);
    }
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
          <div className="profileSection">
            <div className="profileLabel">Email</div>
            <div className="profileValue">{user.email}</div>
          </div>

          <div className="profileSection">
            <div className="profileLabel">Display name</div>
            <div className="profileRow">
              <input
                className="input"
                placeholder="Add a display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <button className="secondary-btn" type="button" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
            {status && <div className="savedMsg">{status}</div>}
          </div>

          <div className="profileSection">
            <div className="profileLabelRow">
              <div className="profileLabel">My shared trips</div>
              {copyMsg && <div className="profileToast">{copyMsg}</div>}
            </div>
            {sharedTrips.length === 0 ? (
              <div className="muted">No shared trips yet.</div>
            ) : (
              <div className="profileTripList">
                {sharedTrips.map((trip) => (
                  <div key={trip.id} className="profileTripRow">
                    <div className="profileTripName">{trip.name}</div>
                    <button
                      className="miniBtn blue"
                      type="button"
                      onClick={() => handleCopyShare(trip)}
                    >
                      Copy share link
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="profileSection">
            <button className="secondary-btn" type="button" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
