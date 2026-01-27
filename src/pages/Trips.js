import { Link, useNavigate } from "react-router-dom";
import { useTrips } from "../hooks/useTrips";
import { LoginForm } from "./Login";
import pinIcon from "../assets/icons/pin (1).png";
import whatsappIcon from "../assets/icons/whatsapp.png";

import { useEffect, useState } from "react";

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

function fallbackTitleForUrl(url) {
  const roomId = extractRoomIdFromUrl(url);
  return roomId ? `Airbnb room ${roomId}` : "Airbnb room";
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
    user,
    loading,
    localImportAvailable,
    importLocalTrips,
  } = useTrips();
  const navigate = useNavigate();
  const [menuOpenId, setMenuOpenId] = useState("");
  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      const raw = localStorage.getItem("pinned_trip_ids_v1");
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });
  const [shareTrip, setShareTrip] = useState(null);
  const [shareMsg, setShareMsg] = useState("");
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
    const ids = Array.from(pinnedIds);
    localStorage.setItem("pinned_trip_ids_v1", JSON.stringify(ids));
  }, [pinnedIds]);

  function togglePin(tripId) {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tripId)) {
        next.delete(tripId);
      } else {
        next.add(tripId);
      }
      return next;
    });
    setMenuOpenId("");
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
          Your <span>Trips</span>
        </h1>

        <div className="content">
          {!user && (
            <>
              <div className="muted">
                Sign in to create and sync trips across devices.
              </div>
              <LoginForm />
            </>
          )}

          {user && localImportAvailable && (
            <div className="importBox">
              <div className="importText">Local trips found on this device.</div>
              <button className="miniBtn" type="button" onClick={importLocalTrips}>
                Import local trips to cloud
              </button>
            </div>
          )}

          {user && (
            <div className="tripCreate">
              <TripCreate createTrip={createTrip} />
            </div>
          )}

          <div className="tripList">
            {loading ? (
              <p className="muted">Loading trips...</p>
            ) : user && trips.length === 0 ? (
              <div className="tripEmpty">
                <div className="tripEmptyTitle">No trips yet</div>
                <div className="tripEmptyText">Create one to start saving your favorite stays.</div>
              </div>
            ) : (
              trips
                .slice()
                .sort((a, b) => {
                  const aPinned = pinnedIds.has(a.id);
                  const bPinned = pinnedIds.has(b.id);
                  if (aPinned !== bPinned) return aPinned ? -1 : 1;
                  return 0;
                })
                .map((t) => (
                <div
                  key={t.id}
                  className={`tripCard ${pinnedIds.has(t.id) ? "pinned" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/trips/${t.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/trips/${t.id}`);
                    }
                  }}
                >
                  <div className="tripHeader">
                    <div className="tripName">{t.name}</div>
                    <div className="tripMetaLine">
                      {t.items.length} listing{t.items.length === 1 ? "" : "s"} • last updated{" "}
                      {formatLastUpdated(t)}
                    </div>
                    {pinnedIds.has(t.id) && (
                      <button
                        className="tripPinBtn"
                        type="button"
                        aria-label="Unpin trip"
                        title="Unpin trip"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(t.id);
                        }}
                      >
                        <img className="tripPinIcon" src={pinIcon} alt="" aria-hidden="true" />
                      </button>
                    )}
                    <div className="tripMenuWrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="tripMenuBtn"
                        type="button"
                        aria-label="Trip options"
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
                            onClick={() => togglePin(t.id)}
                          >
                            {pinnedIds.has(t.id) ? "Unpin" : "Pin"}
                          </button>
                          <button
                            className="tripMenuItem danger"
                            type="button"
                            onClick={() => {
                              setMenuOpenId("");
                              deleteTrip(t.id);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {t.items.length > 0 && (
                    <div className="tripItemsPreview">
                      {t.items.slice(0, 3).map((item) => (
                        <div key={item.id} className="tripItemPreview">
                          {(item.title || "").trim() || fallbackTitleForUrl(item.airbnbUrl)}
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
              ← Back to Extractor
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
                <div className="shareModalTitle">Share trip</div>
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

  async function handleCreate() {
    const id = await createTrip(name);
    if (!id) return;
    setName("");
  }

  return (
    <div className="createTripRow">
      <input
        className="input"
        placeholder="New trip name (e.g. Paris weekend)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={disabled}
      />
      <button className="secondary-btn" onClick={handleCreate} disabled={disabled}>
        Create
      </button>
    </div>
  );
}
