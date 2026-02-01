import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTrips } from "../hooks/useTrips";
import { supabase } from "../lib/supabaseClient";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function Review() {
  const { trips, user } = useTrips();
  const navigate = useNavigate();

  async function trackEvent(eventName, payload = {}) {
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "";
    if (!supabaseUrl) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return;
    try {
      await fetch(`${supabaseUrl}/functions/v1/track-event`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_name: eventName, payload }),
      });
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (user) {
      trackEvent("review_page_opened");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const items = useMemo(() => {
    const all = [];
    for (const trip of trips) {
      for (const item of trip.items || []) {
        all.push({ ...item, tripId: trip.id, tripName: trip.name });
      }
    }
    return all;
  }, [trips]);

  const comparisons = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!item.decisionGroupId || item.dismissed) continue;
      if (!map.has(item.decisionGroupId)) {
        map.set(item.decisionGroupId, { id: item.decisionGroupId, items: [] });
      }
      map.get(item.decisionGroupId).items.push(item);
    }
    return Array.from(map.values()).filter((group) => group.items.length >= 2);
  }, [items]);

  const shortlisted = useMemo(
    () =>
      items.filter((item) => item.shortlisted && !item.dismissed && !item.chosen),
    [items]
  );

  const stalled = useMemo(() => {
    const now = Date.now();
    return items.filter((item) => {
      if (item.chosen || item.dismissed) return false;
      const lastOpenedAt = item.lastOpenedAt || 0;
      return (item.openCount || 0) >= 2 && lastOpenedAt && now - lastOpenedAt > 7 * DAY_MS;
    });
  }, [items]);

  function handleFocusGroup(group) {
    const tripId = group.items[0]?.tripId;
    if (!tripId) return;
    trackEvent("review_item_clicked", { decisionGroupId: group.id, collectionId: tripId });
    navigate(`/trips/${tripId}?focusGroup=${group.id}`);
  }

  function handleFocusItem(item) {
    trackEvent("review_item_clicked", { linkId: item.id, collectionId: item.tripId });
    navigate(`/trips/${item.tripId}`);
  }

  return (
    <div className="page reviewPage min-h-screen app-bg text-[rgb(var(--text))]">
      <div className="card glow">
        <h1>
          Review <span>Decisions</span>
        </h1>
        <div className="muted">Things you're still deciding on.</div>

        {comparisons.length === 0 && shortlisted.length === 0 && stalled.length === 0 ? (
          <div className="reviewEmpty">
            <div className="reviewEmptyTitle">All clear</div>
            <div className="reviewEmptyText">No comparisons or shortlists right now.</div>
            <Link className="miniBtn linkBtn" to="/trips">
              Back to collections
            </Link>
          </div>
        ) : (
          <div className="reviewSections">
            {comparisons.length > 0 && (
              <section className="reviewSection">
                <h2>Comparisons</h2>
                <div className="reviewList">
                  {comparisons.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      className="reviewCard"
                      onClick={() => handleFocusGroup(group)}
                    >
                      <div className="reviewTitle">
                        {group.items[0]?.tripName || "Collection"}
                      </div>
                      <div className="reviewMeta">
                        {group.items.length} items comparing
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {shortlisted.length > 0 && (
              <section className="reviewSection">
                <h2>Shortlisted</h2>
                <div className="reviewList">
                  {shortlisted.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="reviewCard"
                      onClick={() => handleFocusItem(item)}
                    >
                      <div className="reviewTitle">{item.title || "Saved link"}</div>
                      <div className="reviewMeta">{item.tripName}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {stalled.length > 0 && (
              <section className="reviewSection">
                <h2>Stalled</h2>
                <div className="reviewList">
                  {stalled.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="reviewCard"
                      onClick={() => handleFocusItem(item)}
                    >
                      <div className="reviewTitle">{item.title || "Saved link"}</div>
                      <div className="reviewMeta">{item.tripName}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
