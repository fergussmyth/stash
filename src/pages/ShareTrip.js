import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function fallbackTitleForUrl(url) {
  const match = url?.match(/\/rooms\/(\d+)/i);
  return match ? `Airbnb room ${match[1]}` : "Airbnb room";
}

export default function ShareTrip() {
  const { shareId } = useParams();
  const [trip, setTrip] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadSharedTrip() {
      setLoading(true);
      const { data: tripData, error } = await supabase
        .from("trips")
        .select("*")
        .eq("share_id", shareId)
        .eq("is_shared", true)
        .single();

      if (!mounted) return;

      if (error || !tripData) {
        setTrip(null);
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: itemsData } = await supabase
        .from("trip_items")
        .select("*")
        .eq("trip_id", tripData.id)
        .order("added_at", { ascending: false });

      if (!mounted) return;

      setTrip({
        id: tripData.id,
        name: tripData.name,
      });
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
            <div className="navRow">
              <Link className="miniBtn linkBtn" to="/login">
                Sign in
              </Link>
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

        <div className="content">
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
