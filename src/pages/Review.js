import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTrips } from "../hooks/useTrips";
import { supabase } from "../lib/supabaseClient";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import Dropdown from "../components/Dropdown";
import stashLogo from "../assets/icons/stash-favicon.png";
import userIcon from "../assets/icons/user.png";

const DAY_MS = 24 * 60 * 60 * 1000;
const CATEGORY_OPTIONS = ["general", "travel", "fashion"];

function normalizeCategory(input = "") {
  const normalized = String(input || "").trim().toLowerCase();
  if (CATEGORY_OPTIONS.includes(normalized)) return normalized;
  return "general";
}

function formatDecisionDate(timestamp) {
  if (!timestamp) return "recently";
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Review() {
  const { trips, user } = useTrips();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState("newest");

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

  const decisions = useMemo(() => {
    const entries = [];
    for (const group of comparisons) {
      const updatedAt = Math.max(
        ...group.items.map((item) => item.lastOpenedAt || item.addedAt || 0),
        0
      );
      entries.push({
        id: `compare-${group.id}`,
        type: "compare",
        title: `${group.items.length} listings to compare`,
        tripName: group.items[0]?.tripName || "Collection",
        updatedAt,
        onOpen: () => handleFocusGroup(group),
      });
    }
    for (const item of shortlisted) {
      entries.push({
        id: `shortlist-${item.id}`,
        type: "shortlist",
        title: item.title || "Saved link",
        tripName: item.tripName || "Collection",
        updatedAt: item.lastOpenedAt || item.addedAt || 0,
        onOpen: () => handleFocusItem(item),
      });
    }
    for (const item of stalled) {
      entries.push({
        id: `stalled-${item.id}`,
        type: "stalled",
        title: item.title || "Saved link",
        tripName: item.tripName || "Collection",
        updatedAt: item.lastOpenedAt || item.addedAt || 0,
        onOpen: () => handleFocusItem(item),
      });
    }
    return entries;
  }, [comparisons, shortlisted, stalled]);

  const filteredDecisions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? decisions.filter((decision) => {
          return (
            (decision.title || "").toLowerCase().includes(query) ||
            (decision.tripName || "").toLowerCase().includes(query)
          );
        })
      : decisions;
    const sorted = [...filtered].sort((a, b) => {
      const diff = (a.updatedAt || 0) - (b.updatedAt || 0);
      return sortMode === "oldest" ? diff : -diff;
    });
    return sorted;
  }, [decisions, searchQuery, sortMode]);

  const categoryCounts = useMemo(
    () =>
      CATEGORY_OPTIONS.reduce((acc, category) => {
        acc[category] = trips.filter((trip) => normalizeCategory(trip.type) === category).length;
        return acc;
      }, {}),
    [trips]
  );

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

  const hasDecisions = decisions.length > 0;

  return (
    <div className="page reviewPage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
      <AppShell
        sidebar={
          <SidebarNav
            brandIcon={
              <img className="sidebarBrandIcon" src={stashLogo} alt="" aria-hidden="true" />
            }
            activeSection={null}
            categoryCounts={categoryCounts}
            onSelectSection={(category) => {
              navigate(`/trips?category=${category}`);
              setSidebarOpen(false);
            }}
            onNavigate={() => setSidebarOpen(false)}
          />
        }
        topbar={
          <TopBar
            title="Review"
            subtitle="Things you're still deciding on."
            searchValue=""
            onSearchChange={() => {}}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            actions={
              <>
                {user ? (
                  <Link className="topbarIconBtn" to="/profile" aria-label="Profile">
                    <img className="topbarAvatar" src={userIcon} alt="" aria-hidden="true" />
                  </Link>
                ) : null}
              </>
            }
          />
        }
        isSidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      >
        <div className="reviewGrid">
          <section className="reviewCardPanel">
            <div className="reviewCardHeader">
              {hasDecisions && <div className="reviewCardTitle">Open decisions</div>}
              {hasDecisions && (
                <div className="reviewCardControls">
                  <input
                    className="input reviewSearchInput"
                    type="search"
                    placeholder="Search decisions..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  <Dropdown
                    value={sortMode}
                    onChange={setSortMode}
                    options={[
                      { value: "newest", label: "Newest first" },
                      { value: "oldest", label: "Oldest first" },
                    ]}
                    ariaLabel="Sort decisions"
                    buttonClassName="reviewSortBtn"
                    menuClassName="reviewSortMenu"
                  />
                </div>
              )}
            </div>

            {filteredDecisions.length === 0 ? (
              <div className="reviewEmptyState">
                <svg
                  className="reviewEmptyIcon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M8 12l2.5 2.5L16 9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="reviewEmptyTitle">All clear</div>
                <div className="reviewEmptyText">
                  No comparisons or shortlists right now.
                </div>
                <Link className="reviewPrimaryBtn" to="/trips">
                  <span className="reviewBtnIcon" aria-hidden="true">‹</span>
                  Back to collections
                </Link>
              </div>
            ) : (
              <div className="decisionList">
                {filteredDecisions.map((decision) => (
                  <div key={decision.id} className="decisionRow">
                    <div className="decisionInfo">
                      <div className="decisionTitle">{decision.title}</div>
                      <div className="decisionMeta">
                        <span className="decisionTag">{decision.tripName}</span>
                        <span className={`decisionStatus ${decision.type}`}>
                          {decision.type}
                        </span>
                        <span className="decisionUpdated">
                          Updated {formatDecisionDate(decision.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <button
                      className="decisionPrimaryBtn"
                      type="button"
                      onClick={decision.onOpen}
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="reviewCardPanel tipsCard">
            <div className="reviewCardTitle">Tips</div>
            <p>Use Review to compare options and keep shortlists tidy.</p>
          </aside>
        </div>
      </AppShell>
    </div>
  );
}
