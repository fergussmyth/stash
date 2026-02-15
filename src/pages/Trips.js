import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTrips } from "../hooks/useTrips";
import Dropdown from "../components/Dropdown";
import pinIcon from "../assets/icons/pin (1).png";
import whatsappIcon from "../assets/icons/whatsapp.png";
import stashLogo from "../assets/icons/stash-favicon.png";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import CollectionCard from "../components/CollectionCard";
import CollectionsIntroModal from "../components/CollectionsIntroModal";
import PublishCollectionModal from "../components/PublishCollectionModal";
import { getViewerProfile } from "../lib/publishedCollections";

const CATEGORY_OPTIONS = ["general", "travel", "fashion"];
const CATEGORY_PILLS = [
  { value: "all", label: "All" },
  { value: "travel", label: "Travel" },
  { value: "fashion", label: "Fashion" },
  { value: "general", label: "Ideas" },
];
const EMPTY_STATES = {
  all: {
    title: "No collections yet",
    text: "Create your first collection to start organizing your links.",
  },
  travel: {
    title: "No travel collections yet",
    text: "Start a travel collection for itineraries, stays, and hotspots.",
  },
  fashion: {
    title: "No fashion collections yet",
    text: "Build a fashion collection for looks, shops, and inspo.",
  },
  general: {
    title: "No ideas collections yet",
    text: "Capture your ideas, reads, and general inspiration here.",
  },
};
const EMPTY_TIPS = {
  all: ["Save anything with a link", "Pin your favorites", "Share collections in one tap"],
  travel: ["Save stays, spots, and itineraries", "Pin your shortlist", "Share with your group"],
  fashion: ["Save looks, shops, and inspo", "Keep outfits in one place", "Share a moodboard fast"],
  general: ["Save reads and ideas", "Keep everything searchable", "Share a list with friends"],
};

function normalizeCategory(input = "") {
  const normalized = String(input || "").trim().toLowerCase();
  if (normalized === "all") return "all";
  if (CATEGORY_OPTIONS.includes(normalized)) return normalized;
  return "all";
}

function normalizeTripCategory(input = "") {
  const normalized = String(input || "").trim().toLowerCase();
  if (CATEGORY_OPTIONS.includes(normalized)) return normalized;
  return "general";
}

function IconExternal(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M14 4h6v6M10 14l10-10M5 9v10h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconEdit(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M4 20h4l11-11-4-4L4 16v4zM14 5l4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const LAST_UPDATED_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatLastUpdatedFromMs(latest) {
  if (!latest) return "recently";
  return LAST_UPDATED_FORMATTER.format(latest);
}

export default function Trips() {
  const {
    trips,
    createTrip,
    deleteTrip,
    enableShare,
    toggleTripPinned,
    updateTripCategory,
    renameTrip,
    updateTripState,
    user,
    loading,
    localImportAvailable,
    importLocalTrips,
  } = useTrips();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [menuOpenId, setMenuOpenId] = useState("");
  const [shareTrip, setShareTrip] = useState(null);
  const [shareMsg, setShareMsg] = useState("");
  const [sortMode, setSortMode] = useState("updated");
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingTripId, setEditingTripId] = useState("");
  const [editingTripName, setEditingTripName] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [inlineName, setInlineName] = useState("");
  const [inlineTouched, setInlineTouched] = useState(false);
  const [inlineSaving, setInlineSaving] = useState(false);
  const [inlinePulse, setInlinePulse] = useState(false);
  const [showCollectionsIntro, setShowCollectionsIntro] = useState(false);
  const [publishTripId, setPublishTripId] = useState("");
  const [profileHandle, setProfileHandle] = useState("");
  const ghostCardRef = useRef(null);
  const inlineCreateRef = useRef(null);
  const rawShareBase = process.env.REACT_APP_SHARE_ORIGIN || window.location.origin;
  const shareBase = rawShareBase.replace(/\/+$/, "");
  const rawCategory = searchParams.get("category");
  const activeCategory = normalizeCategory(rawCategory);
  const categoryTrips = useMemo(
    () =>
      activeCategory === "all"
        ? trips
        : trips.filter((trip) => normalizeTripCategory(trip.type) === activeCategory),
    [trips, activeCategory]
  );
  const filteredTrips = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return categoryTrips;
    return categoryTrips.filter((trip) => (trip.name || "").toLowerCase().includes(query));
  }, [categoryTrips, searchQuery]);
  const categoryCounts = useMemo(
    () => {
      const counts = CATEGORY_OPTIONS.reduce((acc, category) => {
        acc[category] = trips.filter((trip) => normalizeTripCategory(trip.type) === category).length;
        return acc;
      }, {});
      counts.all = trips.length;
      return counts;
    },
    [trips]
  );
  const lastUpdatedByTripId = useMemo(() => {
    const map = new Map();
    for (const trip of trips) {
      let latest = Date.parse(trip.createdAt || "") || 0;
      for (const item of trip.items || []) {
        const addedAt = Number(item?.addedAt || 0);
        if (addedAt > latest) latest = addedAt;
      }
      map.set(trip.id, latest);
    }
    return map;
  }, [trips]);
  const formatLastUpdated = useCallback(
    (trip) => formatLastUpdatedFromMs(lastUpdatedByTripId.get(trip.id) || 0),
    [lastUpdatedByTripId]
  );
  const sortedTrips = useMemo(
    () =>
      filteredTrips.slice().sort((a, b) => {
        const aPinned = !!a.pinned;
        const bPinned = !!b.pinned;
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        if (sortMode === "name") {
          return (a.name || "").localeCompare(b.name || "");
        }
        if (sortMode === "count") {
          return (b.items?.length || 0) - (a.items?.length || 0);
        }
        const aTime = lastUpdatedByTripId.get(a.id) || 0;
        const bTime = lastUpdatedByTripId.get(b.id) || 0;
        return bTime - aTime;
      }),
    [filteredTrips, sortMode, lastUpdatedByTripId]
  );
  const publishTrip = useMemo(
    () => trips.find((trip) => trip.id === publishTripId) || null,
    [trips, publishTripId]
  );
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (rawCategory !== activeCategory) {
      setSearchParams({ category: activeCategory }, { replace: true });
    }
  }, [rawCategory, activeCategory, setSearchParams]);

  useEffect(() => {
    if (typeof window === "undefined" || loading) return;
    if (!user?.id) {
      setShowCollectionsIntro(false);
      return;
    }

    const introKey = `collectionsIntroDismissed:${user.id}`;
    const legacyDismissed = window.localStorage.getItem("collectionsIntroDismissed") === "true";
    if (legacyDismissed && window.localStorage.getItem(introKey) !== "true") {
      window.localStorage.setItem(introKey, "true");
    }

    const dismissed = window.localStorage.getItem(introKey) === "true";
    if (trips.length > 0) {
      if (!dismissed) {
        window.localStorage.setItem(introKey, "true");
      }
      setShowCollectionsIntro(false);
      return;
    }

    setShowCollectionsIntro(!dismissed);
  }, [trips.length, loading, user?.id]);

  useEffect(() => {
    function handleDocumentClick(event) {
      const target = event.target;
      if (target && target.closest(".tripMenuWrap")) return;
      setMenuOpenId("");
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  useEffect(() => {
    function handleOutsideRename(event) {
      const target = event.target;
      if (target && target.closest(".tripRenameRow")) return;
      if (editingTripId) {
        setEditingTripId("");
        setEditingTripName("");
      }
    }

    document.addEventListener("mousedown", handleOutsideRename);
    return () => document.removeEventListener("mousedown", handleOutsideRename);
  }, [editingTripId]);

  useEffect(() => {
    function handleInlineClick(event) {
      if (!showInlineCreate) return;
      if (!inlineCreateRef.current) return;
      if (inlineCreateRef.current.contains(event.target)) return;
      cancelInlineCreate();
    }

    function handleInlineKey(event) {
      if (!showInlineCreate) return;
      if (event.key === "Escape") {
        cancelInlineCreate();
      }
    }

    document.addEventListener("mousedown", handleInlineClick);
    document.addEventListener("keydown", handleInlineKey);
    return () => {
      document.removeEventListener("mousedown", handleInlineClick);
      document.removeEventListener("keydown", handleInlineKey);
    };
  }, [showInlineCreate]);

  useEffect(() => {
    let active = true;
    async function loadProfileHandle() {
      if (!user?.id) {
        if (active) setProfileHandle("");
        return;
      }
      const { profile } = await getViewerProfile(user.id);
      if (!active) return;
      setProfileHandle(profile?.handle || "");
    }
    loadProfileHandle();
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function handleInlineCreate() {
    const trimmed = inlineName.trim();
    if (!trimmed || inlineSaving) {
      setInlineTouched(true);
      setInlinePulse(true);
      setTimeout(() => setInlinePulse(false), 180);
      return;
    }
    if (!user) {
      navigate("/login");
      return;
    }
    setInlineSaving(true);
    const targetCategory = activeCategory === "all" ? "general" : activeCategory;
    const id = await createTrip(trimmed, targetCategory);
    setInlineSaving(false);
    if (!id) return;
    setInlineName("");
    setInlineTouched(false);
    setShowInlineCreate(false);
  }

  function cancelInlineCreate() {
    setInlineName("");
    setInlineTouched(false);
    setShowInlineCreate(false);
  }

  function togglePin(trip) {
    toggleTripPinned(trip.id, !trip.pinned);
    setMenuOpenId("");
  }

  async function handleRenameTrip(trip) {
    const trimmed = editingTripName.trim();
    if (!trimmed) return;
    await renameTrip(trip.id, trimmed);
    setEditingTripId("");
    setEditingTripName("");
    setToastMsg("Renamed");
    setTimeout(() => setToastMsg(""), 1500);
  }

  async function openShare(trip) {
    setShareMsg("");
    let shareId = trip.shareId || trip.share_id || "";
    if (!shareId) {
      const newShareId = await enableShare(trip.id);
      if (newShareId) shareId = newShareId;
    }
    const shareUrl = shareId ? `${shareBase}/share/${shareId}` : "";
    if (shareUrl && navigator.share) {
      try {
        await navigator.share({ title: trip.name, url: shareUrl });
        setMenuOpenId("");
        return;
      } catch {
        setMenuOpenId("");
        return;
      }
    }
    setShareTrip({ ...trip, shareId });
    setMenuOpenId("");
  }

  async function handleCopyShare() {
    if (!shareTrip) return;
    if (!shareTrip.shareId) return;
    const shareUrl = `${shareBase}/share/${shareTrip.shareId}`;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      setShareMsg("Copied!");
      setTimeout(() => setShareMsg(""), 1500);
    }
  }

  return (
    <div className="page tripsPage collectionsShell collectionsIndexPage min-h-screen app-bg text-[rgb(var(--text))]">
      <PublishCollectionModal
        open={!!publishTrip}
        trip={
          publishTrip
            ? {
                id: publishTrip.id,
                name: publishTrip.name,
                subtitle: publishTrip.subtitle || "",
                visibility: publishTrip.visibility || "private",
                publicSlug: publishTrip.publicSlug || "",
                isRanked: !!publishTrip.isRanked,
                rankedSize: publishTrip.rankedSize ?? null,
                coverImageUrl: publishTrip.coverImageUrl || "",
                items: Array.isArray(publishTrip.items) ? publishTrip.items : [],
              }
            : null
        }
        viewerUserId={user?.id || ""}
        initialHandle={profileHandle}
        onHandleUpdated={(nextHandle) => setProfileHandle(nextHandle)}
        onPublished={(collection, nextHandle, rankedItems = []) => {
          const existingItems = Array.isArray(publishTrip?.items) ? publishTrip.items : [];
          let nextItems = existingItems;

          if (Array.isArray(rankedItems) && rankedItems.length > 0 && existingItems.length > 0) {
            const byId = new Map(existingItems.map((item) => [item.id, item]));
            const seen = new Set();
            const reordered = rankedItems
              .map((item) => {
                const existing = byId.get(item.id);
                if (!existing) return null;
                seen.add(item.id);
                return {
                  ...existing,
                  title: item.title || existing.title,
                  note: item.note || "",
                };
              })
              .filter(Boolean);
            const remainder = existingItems.filter((item) => !seen.has(item.id));
            nextItems = [...reordered, ...remainder];
          }

          if (nextHandle) {
            setProfileHandle(nextHandle);
          }
          updateTripState(collection.id, {
            name: collection.title,
            subtitle: collection.subtitle || "",
            visibility: collection.visibility,
            publicSlug: collection.slug || "",
            isRanked: !!collection.is_ranked,
            rankedSize: collection.ranked_size ?? null,
            coverImageUrl: collection.cover_image_url || "",
            coverImageSource: collection.cover_image_source || "",
            coverUpdatedAt: collection.cover_updated_at || null,
            items: nextItems,
          });
          const publishToast =
            collection.visibility === "public"
              ? "Published to Explore"
              : collection.visibility === "unlisted"
              ? "Published as unlisted"
              : "Publish settings saved";
          setToastMsg(publishToast);
          setTimeout(() => setToastMsg(""), 1700);
          setPublishTripId("");
        }}
        onClose={() => setPublishTripId("")}
      />
      <CollectionsIntroModal
        open={showCollectionsIntro}
        isEmpty={trips.length === 0}
        onClose={() => {
          if (typeof window !== "undefined" && user?.id) {
            window.localStorage.setItem(`collectionsIntroDismissed:${user.id}`, "true");
          }
          setShowCollectionsIntro(false);
        }}
      />
      <AppShell
        sidebar={
          <SidebarNav
            brandIcon={
              <img className="sidebarBrandIcon" src={stashLogo} alt="" aria-hidden="true" />
            }
            activeSection={activeCategory}
            categoryCounts={categoryCounts}
            onSelectSection={(category) => {
              setSearchParams({ category });
              setSidebarOpen(false);
            }}
            onNavigate={() => setSidebarOpen(false)}
          />
        }
        topbar={
          <TopBar
            title="Collections"
            subtitle="Organize links into themed lists."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            actions={
              !user ? (
                <Link className="topbarPill subtle" to="/login">
                  Sign in
                </Link>
              ) : null
            }
          />
        }
        isSidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      >
        {toastMsg && <div className="toast">{toastMsg}</div>}

        <section className="panel p-5 collectionsPanel listPanel fullWidth">
            <div className="panelContent">
              <div className="collectionsPillRow" role="tablist" aria-label="Collection sections">
                {CATEGORY_PILLS.map((pill) => (
                  <button
                    key={pill.value}
                    className={`collectionsPill ${
                      activeCategory === pill.value ? "isActive" : ""
                    }`}
                    type="button"
                    role="tab"
                    aria-selected={activeCategory === pill.value}
                    onClick={() => setSearchParams({ category: pill.value })}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              <div className="listHeaderRow">
                <div className="listTitleRow">
                  <div className="listTitle">Your collections</div>
                </div>
                <div className="listHeaderActions">
                  {user && filteredTrips.length > 0 && (
                    <div className="sortRow inline">
                      <Dropdown
                        id="sortTrips"
                        className="sortDropdown"
                        value={sortMode}
                        onChange={setSortMode}
                        options={[
                          { value: "updated", label: "Last updated" },
                          { value: "name", label: "Name (A–Z)" },
                          { value: "count", label: "Link count" },
                        ]}
                        ariaLabel="Sort collections"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div
                className={`tripList ${user && categoryTrips.length === 0 ? "isEmpty" : ""}`}
              >
                {loading ? (
                  <div className="tripSkeletonGrid">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="tripSkeleton" />
                    ))}
                  </div>
                ) : user && filteredTrips.length === 0 && categoryTrips.length > 0 ? (
                  <div className="tripEmptyState">
                    <div className="tripEmptyCallout">
                      <div className="tripEmptyIcon static" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false">
                          <circle
                            cx="11"
                            cy="11"
                            r="7"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                          <path
                            d="M20 20l-3.5-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                      <div className="tripEmptyCopy">
                        <div className="tripEmptyTitle">No matches</div>
                        <div className="tripEmptyText">
                          Try a shorter keyword or clear the search.
                        </div>
                        <button
                          className="tripEmptyLink"
                          type="button"
                          onClick={() => setSearchQuery("")}
                        >
                          Clear search
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="collectionsGrid">
                      {user && categoryTrips.length === 0 && (
                        <div className="collectionsEmptyHero" role="status" aria-live="polite">
                          <div className="collectionsEmptyHeroHeader">
                            <div className="collectionsEmptyHeroIcon" aria-hidden="true">
                              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                <path
                                  d="M4 6h16v12H4zM4 10h16"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>
                            <div className="collectionsEmptyHeroCopy">
                              <div className="collectionsEmptyHeroTitle">
                                {EMPTY_STATES[activeCategory]?.title || "No collections yet"}
                              </div>
                              <div className="collectionsEmptyHeroText">
                                {EMPTY_STATES[activeCategory]?.text ||
                                  "Create your first collection to get started."}
                              </div>
                            </div>
                          </div>

                          <div className="collectionsEmptyHeroTips" aria-label="What you can do">
                            {(EMPTY_TIPS[activeCategory] || EMPTY_TIPS.all).map((tip) => (
                              <div key={tip} className="collectionsEmptyHeroTip">
                                {tip}
                              </div>
                            ))}
                          </div>

                          <div className="collectionsEmptyActions">
                            <button
                              className="primary-btn primary-btn--dominant"
                              type="button"
                              onClick={() => {
                                if (!user) {
                                  navigate("/login");
                                  return;
                                }
                                setShowInlineCreate(true);
                                setTimeout(() => nameInputRef.current?.focus(), 0);
                              }}
                            >
                              Create collection
                            </button>
                            {localImportAvailable ? (
                              <button
                                className="secondary-btn"
                                type="button"
                                onClick={() => {
                                  if (!user) {
                                    navigate("/login");
                                    return;
                                  }
                                  importLocalTrips();
                                }}
                              >
                                Import links
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )}
                      <div
                        ref={ghostCardRef}
                        className={`collectionCard ghostCreateCard ${
                          showInlineCreate ? "isOpen" : ""
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (!user) {
                            navigate("/login");
                            return;
                          }
                          setShowInlineCreate(true);
                          setTimeout(() => nameInputRef.current?.focus(), 0);
                        }}
                        onKeyDown={(event) => {
                          if (event.target?.tagName === "INPUT") return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            if (!user) {
                              navigate("/login");
                              return;
                            }
                            setShowInlineCreate(true);
                            setTimeout(() => nameInputRef.current?.focus(), 0);
                          }
                        }}
                      >
                        {showInlineCreate && user ? (
                          <div className="ghostCreateBody inlineCreate" ref={inlineCreateRef}>
                            <div className="ghostCreateInputRow">
                              <input
                                ref={nameInputRef}
                                className={`input ghostCreateInput ${
                                  inlineTouched && !inlineName.trim() ? "isInvalid" : ""
                                } ${inlinePulse ? "isPulse" : ""}`}
                                placeholder="Name your collection"
                                value={inlineName}
                                onChange={(event) => setInlineName(event.target.value)}
                                onBlur={() => setInlineTouched(true)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    handleInlineCreate();
                                  }
                                  if (event.key === " ") {
                                    event.stopPropagation();
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelInlineCreate();
                                  }
                                }}
                                aria-invalid={inlineTouched && !inlineName.trim()}
                              />
                              <div className="ghostCreateActions">
                                <button
                                  className="ghostCreateIconBtn save"
                                  type="button"
                                  onClick={handleInlineCreate}
                                  title="Create collection"
                                  aria-label="Create collection"
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path
                                      d="M5 12l4 4 10-10"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </button>
                                <button
                                  className="ghostCreateIconBtn cancel"
                                  type="button"
                                  onClick={cancelInlineCreate}
                                  title="Cancel"
                                  aria-label="Cancel"
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path
                                      d="M6 6l12 12M18 6l-12 12"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="ghostCreateBody">
                            <div className="ghostCreateIcon" aria-hidden="true">
                              +
                            </div>
                            <div className="ghostCreateText">New collection</div>
                          </div>
                        )}
                      </div>

                      {sortedTrips.map((trip) => (
                        <CollectionCard
                          key={trip.id}
                          trip={trip}
                          coverImageUrl={trip.coverImageUrl}
                          coverImageSource={trip.coverImageSource}
                          isEditing={editingTripId === trip.id}
                          editingName={editingTripName}
                          onEditingNameChange={setEditingTripName}
                          onRenameSave={() => handleRenameTrip(trip)}
                          onRenameCancel={() => {
                            setEditingTripId("");
                            setEditingTripName("");
                          }}
                          menuOpen={menuOpenId === trip.id}
                          onToggleMenu={() =>
                            setMenuOpenId((prev) => (prev === trip.id ? "" : trip.id))
                          }
                          onShare={() => openShare(trip)}
                          onPublish={() => {
                            setMenuOpenId("");
                            setPublishTripId(trip.id);
                          }}
                          onTogglePin={() => togglePin(trip)}
                          onChangeSection={async (nextSection) => {
                            setMenuOpenId("");
                            const ok = await updateTripCategory(trip.id, nextSection);
                            if (!ok) {
                              setToastMsg("Could not move collection right now");
                              setTimeout(() => setToastMsg(""), 1700);
                              return;
                            }
                            setToastMsg(`Moved to ${nextSection.charAt(0).toUpperCase()}${nextSection.slice(1)}`);
                            setTimeout(() => setToastMsg(""), 1700);
                          }}
                          onDelete={() => {
                            setMenuOpenId("");
                            deleteTrip(trip.id);
                            setToastMsg("Deleted");
                            setTimeout(() => setToastMsg(""), 1500);
                          }}
                          onOpen={() => navigate(`/trips/${trip.id}`)}
                          onStartRename={() => {
                            setEditingTripId(trip.id);
                            setEditingTripName(trip.name || "");
                          }}
                          formatLastUpdated={formatLastUpdated}
                          IconExternal={IconExternal}
                          IconEdit={IconEdit}
                          IconTrash={IconTrash}
                          pinIcon={pinIcon}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
        </section>
      </AppShell>
      {shareTrip && (
        <div
          className="shareOverlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setShareTrip(null)}
        >
          <div className="shareModal" onClick={(e) => e.stopPropagation()}>
            <div className="shareModalHeader">
              <div>
                <div className="shareModalTitle">Share collection</div>
                <div className="shareModalSubtitle">{shareTrip.name}</div>
              </div>
              <button
                className="shareModalClose"
                type="button"
                aria-label="Close"
                onClick={() => setShareTrip(null)}
              >
                ×
              </button>
            </div>
            {shareMsg && <div className="shareModalMsg">{shareMsg}</div>}
            <div className="shareModalActions">
              <div className="shareLinkRow">
                <button className="miniBtn blue" type="button" onClick={handleCopyShare}>
                  Copy
                </button>
                <div className="shareLinkValue">
                  {shareTrip.shareId
                    ? `${shareBase}/share/${shareTrip.shareId}`
                    : "Share link unavailable"}
                </div>
              </div>
              <a
                className="secondary-btn linkBtn"
                href={`https://wa.me/?text=${encodeURIComponent(
                  shareTrip.shareId
                    ? `${shareBase}/share/${shareTrip.shareId}`
                    : ""
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                <img className="shareIconSmall" src={whatsappIcon} alt="" aria-hidden="true" />
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
