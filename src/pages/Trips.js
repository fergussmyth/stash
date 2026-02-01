import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTrips } from "../hooks/useTrips";
import { LoginForm } from "./Login";
import Dropdown from "../components/Dropdown";
import pinIcon from "../assets/icons/pin (1).png";
import whatsappIcon from "../assets/icons/whatsapp.png";
import stashLogo from "../assets/icons/stash-favicon.png";
import userIcon from "../assets/icons/user.png";

import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import CollectionCard from "../components/CollectionCard";

const CATEGORY_OPTIONS = ["general", "travel", "fashion"];
const CATEGORY_LABELS = {
  general: "General",
  travel: "Travel",
  fashion: "Fashion",
};

function normalizeCategory(input = "") {
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

function formatLastUpdated(trip) {
  const itemTimes = (trip.items || [])
    .map((item) => item.addedAt || 0)
    .filter(Boolean);
  const latest = itemTimes.length > 0 ? Math.max(...itemTimes) : Date.parse(trip.createdAt || "");
  if (!latest) return "recently";
  return new Date(latest).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Trips() {
  const {
    trips,
    createTrip,
    deleteTrip,
    enableShare,
    toggleTripPinned,
    renameTrip,
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
  const rawShareBase = process.env.REACT_APP_SHARE_ORIGIN || window.location.origin;
  const shareBase = rawShareBase.replace(/\/+$/, "");
  const rawCategory = searchParams.get("category");
  const activeCategory = normalizeCategory(rawCategory);
  const activeCategoryLabel = CATEGORY_LABELS[activeCategory];
  const categoryTrips = useMemo(
    () => trips.filter((trip) => normalizeCategory(trip.type) === activeCategory),
    [trips, activeCategory]
  );
  const filteredTrips = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return categoryTrips;
    return categoryTrips.filter((trip) => (trip.name || "").toLowerCase().includes(query));
  }, [categoryTrips, searchQuery]);
  const categoryCounts = useMemo(
    () =>
      CATEGORY_OPTIONS.reduce((acc, category) => {
        acc[category] = trips.filter((trip) => normalizeCategory(trip.type) === category).length;
        return acc;
      }, {}),
    [trips]
  );
  const collectionsCount = user ? categoryTrips.length : 0;
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
        const aTime = getLastUpdatedTime(a);
        const bTime = getLastUpdatedTime(b);
        return bTime - aTime;
      }),
    [filteredTrips, sortMode]
  );
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (rawCategory !== activeCategory) {
      setSearchParams({ category: activeCategory }, { replace: true });
    }
  }, [rawCategory, activeCategory, setSearchParams]);

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

  function togglePin(trip) {
    toggleTripPinned(trip.id, !trip.pinned);
    setMenuOpenId("");
  }

  function getLastUpdatedTime(trip) {
    const itemTimes = (trip.items || []).map((item) => item.addedAt || 0).filter(Boolean);
    const latest = itemTimes.length > 0 ? Math.max(...itemTimes) : Date.parse(trip.createdAt || "");
    return latest || 0;
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

  async function handleSystemShare() {
    if (!shareTrip || !navigator.share) return;
    if (!shareTrip.shareId) return;
    const shareUrl = `${shareBase}/share/${shareTrip.shareId}`;
    try {
      await navigator.share({ title: shareTrip.name, url: shareUrl });
      setShareTrip(null);
    } catch {
      // keep modal open if cancelled
    }
  }

  return (
    <div className="page tripsPage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
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
              <>
                <Link className="topbarPill" to="/trips">
                  Stashes
                </Link>
                <Link className="topbarPill" to="/review">
                  Review
                </Link>
                {user ? (
                  <Link className="topbarIconBtn" to="/profile" aria-label="Profile">
                    <img className="topbarAvatar" src={userIcon} alt="" aria-hidden="true" />
                  </Link>
                ) : (
                  <Link className="topbarPill subtle" to="/login">
                    Sign in
                  </Link>
                )}
              </>
            }
          />
        }
        isSidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      >
        {toastMsg && <div className="toast">{toastMsg}</div>}

        <div className="collectionsSplit">
          <section className="panel p-5 collectionsPanel createPanel">
            <div className="panelContent">
              <div className="panelHeader">
                <h2>Create collection</h2>
                <p>Start a new list for saved links.</p>
              </div>

              {!user && (
                <>
                  <div className="muted">
                    Sign in to create and sync collections across devices.
                  </div>
                  <LoginForm />
                </>
              )}

              {user && (
                <TripCreate
                  createTrip={createTrip}
                  inputRef={nameInputRef}
                  activeCategory={activeCategory}
                />
              )}

              {user && localImportAvailable && (
                <div className="importBox">
                  <div className="importText">Local collections found on this device.</div>
                  <button className="miniBtn" type="button" onClick={importLocalTrips}>
                    Import local collections to cloud
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="panel p-5 collectionsPanel listPanel">
            <div className="panelContent">
              <div className="listHeaderRow">
                <div className="listTitleRow">
                  <div className="listTitle">Your collections</div>
                  {user && (
                    <span
                      className="listCountBadge"
                      aria-label={`${collectionsCount} collections`}
                    >
                      {collectionsCount}
                    </span>
                  )}
                </div>
                {user && filteredTrips.length > 0 && (
                  <div className="sortRow inline">
                    <label className="sortLabel" htmlFor="sortTrips">
                      Sort
                    </label>
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

              <div
                className={`tripList ${user && categoryTrips.length === 0 ? "isEmpty" : ""}`}
              >
                {loading ? (
                  <div className="tripSkeletonGrid">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="tripSkeleton" />
                    ))}
                  </div>
                ) : user && categoryTrips.length === 0 ? (
                  <div className="collectionsEmpty">
                    <div className="collectionsEmptyIcon" aria-hidden="true">
                      +
                    </div>
                    <div className="collectionsEmptyTitle">
                      No {activeCategoryLabel} collections yet
                    </div>
                    <div className="collectionsEmptyText">
                      Create one to start saving links.
                    </div>
                    <button
                      className="primary-btn collectionsEmptyBtn"
                      type="button"
                      onClick={() => {
                        nameInputRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                        nameInputRef.current?.focus();
                      }}
                    >
                      Create a {activeCategoryLabel} collection
                    </button>
                  </div>
                ) : user && filteredTrips.length === 0 ? (
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
                  <div className="collectionsGrid">
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
                        onTogglePin={() => togglePin(trip)}
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
                )}
              </div>
            </div>
          </section>
        </div>
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

function TripCreate({ createTrip, disabled, inputRef, activeCategory }) {
  const [name, setName] = useState("");
  const [type, setType] = useState(activeCategory);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const trimmed = name.trim();
  const canCreate = trimmed.length > 0;
  const showError = touched && !canCreate;

  useEffect(() => {
    setType(activeCategory);
  }, [activeCategory]);

  async function handleCreate() {
    if (!canCreate || disabled || isSubmitting) {
      setTouched(true);
      return;
    }
    setIsSubmitting(true);
    const id = await createTrip(trimmed, type);
    setIsSubmitting(false);
    if (!id) return;
    setName("");
    setType(activeCategory);
    setTouched(false);
  }

  return (
    <form
      className="createTripForm"
      onSubmit={(event) => {
        event.preventDefault();
        handleCreate();
      }}
    >
      <div className="fieldGroup">
        <label className="fieldLabel" htmlFor="collectionName">
          Collection name
        </label>
        <input
          id="collectionName"
          className="input"
          placeholder="Name your collection"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={showError}
          disabled={disabled || isSubmitting}
          ref={inputRef}
        />
        <div className="fieldHelp">
          e.g. Gym prep, React refs, Trip ideas
        </div>
        {showError && <div className="fieldError">Name is required.</div>}
      </div>
      <div className="createTripRow">
        <div className="fieldGroup">
          <label className="fieldLabel" htmlFor="collectionCategory">
            Category
          </label>
          <select
            id="collectionCategory"
            className="select"
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={disabled || isSubmitting}
          >
            <option value="general">General</option>
            <option value="travel">Travel</option>
            <option value="fashion">Fashion</option>
          </select>
        </div>
        <button
          className="primary-btn createTripBtn"
          type="submit"
          disabled={!canCreate || disabled || isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create collection"}
        </button>
      </div>
    </form>
  );
}
