import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function fallbackTitleForUrl(url) {
  const match = url?.match(/\/rooms\/(\d+)/i);
  return match ? `Airbnb room ${match[1]}` : "Airbnb room";
}

function formatSharedBy(displayName) {
  if (displayName) return displayName;
  return "a TripTok user";
}

function titleCase(input = "") {
  return input
    .trim()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ""))
    .join(" ");
}

export default function ShareTrip() {
  const { shareId } = useParams();
  const [trip, setTrip] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ownerDisplayName, setOwnerDisplayName] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadSharedTrip() {
      setLoading(true);
      setLoadError("");
      const { data: tripData, error } = await supabase
        .from("trips")
        .select("id,name,owner_id,share_id,is_shared")
        .eq("share_id", shareId)
        .eq("is_shared", true)
        .single();

      if (!mounted) return;

      if (error || !tripData) {
        if (error) {
          setLoadError(error.message || "Shared trip unavailable.");
        }
        setTrip(null);
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from("trip_items")
        .select("*")
        .eq("trip_id", tripData.id)
        .order("added_at", { ascending: false });

      if (!mounted) return;
      if (itemsError) {
        setLoadError(itemsError.message || "Shared items unavailable.");
      }

      setTrip({
        id: tripData.id,
        name: tripData.name,
      });
      if (tripData.owner_id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", tripData.owner_id)
          .single();
        if (!mounted) return;
        setOwnerDisplayName(profileData?.display_name || "");
      }
      setItems(
        (itemsData || []).map((item) => ({
          id: item.id,
          airbnbUrl: item.url,
          title: item.title,
          note: item.note,
        }))
      );
      setLoading(false);
    }

    loadSharedTrip();
    return () => {
      mounted = false;
    };
  }, [shareId]);

  if (!trip && !loading) {
    return (
      <div className="page">
        <div className="card glow">
          <h1>
            Share <span>Link</span>
          </h1>

          <div className="content">
            <p className="muted">That share link doesn’t exist (or was disabled).</p>
            {loadError && <p className="warning">{loadError}</p>}
            <div className="navRow">
              <Link className="miniBtn linkBtn" to="/">
                Extractor
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card glow">
        <h1>
          {trip?.name || "Trip"} <span>Shared</span>
        </h1>
        {!loading && trip && (
          <div className="sharedByLine">
            Shared by {titleCase(formatSharedBy(ownerDisplayName))}
          </div>
        )}

        <div className="content">
          {!loading && trip && <div className="readOnlyBadge">Read-only</div>}
          {loading ? (
            <p className="muted">Loading shared trip...</p>
          ) : items.length === 0 ? (
            <p className="muted">No links saved yet.</p>
          ) : (
            <div className="itemList">
              {items.map((item) => (
                <div key={item.id} className="itemCard">
                  <div className="itemTop">
                    <a
                      className="itemLink"
                      href={item.airbnbUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {(item.title || "").trim() || fallbackTitleForUrl(item.airbnbUrl)}
                    </a>

                    <div className="itemActions">
                      <a
                        className="miniBtn linkBtn"
                        href={item.airbnbUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                      <button
                        className="miniBtn"
                        type="button"
                        onClick={() => navigator.clipboard.writeText(item.airbnbUrl)}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
