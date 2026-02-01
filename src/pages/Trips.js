import { Link, useNavigate } from "react-router-dom";
import { useTrips } from "../hooks/useTrips";
import { LoginForm } from "./Login";
import pinIcon from "../assets/icons/pin (1).png";
import whatsappIcon from "../assets/icons/whatsapp.png";

import { useEffect, useState } from "react";

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

function cleanAirbnbUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function extractRoomIdFromUrl(url) {
  const cleaned = cleanAirbnbUrl(url);
  const match = cleaned.match(/\/rooms\/(\d+)/i);
  return match ? match[1] : null;
}

function decodeHtmlEntities(text = "") {
  if (!text) return "";
  if (typeof document === "undefined") return text;
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

function humanizeSlugTitle(pathname = "", hostname = "") {
  const cleanPath = (pathname || "").replace(/\/+$/, "");
  if (!cleanPath || cleanPath === "/") return hostname.replace(/^www\./, "");
  const parts = cleanPath.split("/").filter(Boolean);
  let slug = parts[parts.length - 1] || "";
  const prdIndex = parts.findIndex((p) => p.toLowerCase() === "prd");
  if (prdIndex > 0) {
    slug = parts[prdIndex - 1] || slug;
  }
  if (/^\d+$/.test(slug)) return hostname.replace(/^www\./, "");
  const words = slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return hostname.replace(/^www\./, "");
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

function fallbackTitleForUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("airbnb.")) {
      const roomId = extractRoomIdFromUrl(url);
      return roomId ? `Airbnb room ${roomId}` : "Airbnb room";
    }
    return humanizeSlugTitle(parsed.pathname, parsed.hostname);
  } catch {
    return "Saved link";
  }
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
  const [menuOpenId, setMenuOpenId] = useState("");
  const [shareTrip, setShareTrip] = useState(null);
  const [shareMsg, setShareMsg] = useState("");
  const [sortMode, setSortMode] = useState("updated");
  const [editingTripId, setEditingTripId] = useState("");
  const [editingTripName, setEditingTripName] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const rawShareBase = process.env.REACT_APP_SHARE_ORIGIN || window.location.origin;
  const shareBase = rawShareBase.replace(/\/+$/, "");

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
    <div className="page tripsPage">
      <div className="card glow tripsCard">
        <h1>
          Your <span>Collections</span>
        </h1>

        <div className="content">
          {toastMsg && <div className="toast">{toastMsg}</div>}
          {!user && (
            <>
              <div className="muted">
                Sign in to create and sync collections across devices.
              </div>
              <LoginForm />
            </>
          )}

          {user && localImportAvailable && (
            <div className="importBox">
              <div className="importText">Local collections found on this device.</div>
              <button className="miniBtn" type="button" onClick={importLocalTrips}>
                Import local collections to cloud
              </button>
            </div>
          )}

          {user && (
            <div className="tripCreate">
              <TripCreate createTrip={createTrip} />
            </div>
          )}

          {user && (
            <div className="tripHeaderRow">
              <div className="sortRow inline">
                <label className="sortLabel" htmlFor="sortTrips">
                  Sort
                </label>
                <select
                  id="sortTrips"
                  className="select sortSelect"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value)}
                >
                  <option value="updated">Last updated</option>
                  <option value="name">Name (A–Z)</option>
                  <option value="count">Link count</option>
                </select>
              </div>
            </div>
          )}

          <div className="tripList">
            {loading ? (
              <div className="tripSkeletonGrid">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="tripSkeleton" />
                ))}
              </div>
            ) : user && trips.length === 0 ? (
              <div className="tripEmpty">
                <div className="tripEmptyTitle">No collections yet</div>
                <div className="tripEmptyText">Create one to start saving your favorite links.</div>
                <Link className="miniBtn linkBtn" to="/">
                  Go to Stash
                </Link>
              </div>
            ) : (
              trips
                .slice()
                .sort((a, b) => {
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
                })
                .map((t) => (
                <div
                  key={t.id}
                  className={`tripCard ${t.pinned ? "pinned" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (editingTripId === t.id) return;
                    navigate(`/trips/${t.id}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (editingTripId === t.id) return;
                      navigate(`/trips/${t.id}`);
                    }
                  }}
                >
                  <div className="tripHeader">
                    {editingTripId === t.id ? (
                      <div className="tripRenameRow">
                        <input
                          className="input tripRenameInput"
                          value={editingTripName}
                          onChange={(e) => setEditingTripName(e.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleRenameTrip(t);
                            }
                            if (event.key === "Escape") {
                              setEditingTripId("");
                              setEditingTripName("");
                            }
                          }}
                        />
                        <div className="tripRenameActions">
                          <button
                            className="miniBtn"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRenameTrip(t);
                            }}
                          >
                            Save
                          </button>
                          <button
                            className="miniBtn"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingTripId("");
                              setEditingTripName("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="tripName">{t.name}</div>
                    )}
                    <div className="tripMetaLine">
                      {t.items.length} link{t.items.length === 1 ? "" : "s"} • last updated{" "}
                      {formatLastUpdated(t)}
                    </div>
                    {t.pinned && (
                      <button
                        className="tripPinBtn"
                        type="button"
                        aria-label="Unpin collection"
                        title="Unpin collection"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(t);
                        }}
                      >
                        <img className="tripPinIcon" src={pinIcon} alt="" aria-hidden="true" />
                      </button>
                    )}
                    <div className="tripMenuWrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="tripMenuBtn"
                        type="button"
                        aria-label="Collection options"
                        onClick={() => setMenuOpenId((prev) => (prev === t.id ? "" : t.id))}
                      >
                        ⋯
                      </button>
                      {menuOpenId === t.id && (
                        <div className="tripMenu" role="menu">
                          <button
                            className="tripMenuItem"
                            type="button"
                            onClick={() => openShare(t)}
                          >
                            Share
                          </button>
                          <button
                            className="tripMenuItem"
                            type="button"
                            onClick={() => togglePin(t)}
                          >
                            {t.pinned ? "Unpin" : "Pin"}
                          </button>
                          <button
                            className="tripMenuItem danger"
                            type="button"
                            onClick={() => {
                              setMenuOpenId("");
                              deleteTrip(t.id);
                              setToastMsg("Deleted");
                              setTimeout(() => setToastMsg(""), 1500);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="tripQuickActions" role="group" aria-label="Quick actions">
                      <button
                        className="iconBtn bare quickActionBtn"
                        type="button"
                        aria-label="Open collection"
                        title="Open"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/trips/${t.id}`);
                        }}
                      >
                        <IconExternal className="quickActionIcon" />
                      </button>
                      <button
                        className="iconBtn bare quickActionBtn"
                        type="button"
                        aria-label="Rename collection"
                        title="Rename"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingTripId(t.id);
                          setEditingTripName(t.name || "");
                        }}
                      >
                        <IconEdit className="quickActionIcon" />
                      </button>
                      <button
                        className="iconBtn bare quickActionBtn danger"
                        type="button"
                        aria-label="Delete collection"
                        title="Delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteTrip(t.id);
                          setToastMsg("Deleted");
                          setTimeout(() => setToastMsg(""), 1500);
                        }}
                      >
                        <IconTrash className="quickActionIcon" />
                      </button>
                    </div>
                  </div>

                  {t.items.length > 0 && (
                    <div className="tripItemsPreview">
                      {t.items.slice(0, 3).map((item) => (
                        <div key={item.id} className="tripItemPreview">
                          {decodeHtmlEntities((item.title || "").trim()) || fallbackTitleForUrl(item.airbnbUrl)}
                        </div>
                      ))}
                      {t.items.length > 3 && (
                        <span className="tripItemMore">+{t.items.length - 3} more</span>
                      )}
                    </div>
                  )}

                </div>
                ))
            )}
          </div>

          <div className="navRow">
            <Link className="miniBtn linkBtn" to="/">
              ← Back to Stash
            </Link>
          </div>
        </div>
      </div>
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

function TripCreate({ createTrip, disabled }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("travel");

  async function handleCreate() {
    const id = await createTrip(name, type);
    if (!id) return;
    setName("");
    setType("travel");
  }

  return (
    <form
      className="createTripRow"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        handleCreate();
      }}
    >
      <input
        className="input"
        placeholder="New collection name (e.g. Paris weekend)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={disabled}
      />
      <select
        className="select small"
        value={type}
        onChange={(e) => setType(e.target.value)}
        disabled={disabled}
        aria-label="Collection type"
      >
        <option value="travel">Travel</option>
        <option value="fashion">Fashion</option>
        <option value="general">General</option>
      </select>
      <button className="secondary-btn" type="submit" disabled={disabled}>
        Create
      </button>
    </form>
  );
}
