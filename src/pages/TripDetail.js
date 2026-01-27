import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useTrips } from "../hooks/useTrips";
import shareIcon from "../assets/icons/share.png";
import whatsappIcon from "../assets/icons/whatsapp.png";
import { LoginForm } from "./Login";

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

function splitTitleParts(title, fallbackUrl) {
  const base = (title || "").trim() || fallbackTitleForUrl(fallbackUrl);
  const parts = base.split(/\s*[•·]\s*/);
  if (parts.length <= 1) {
    return { main: base, meta: [] };
  }
  return { main: parts[0], meta: parts.slice(1) };
}

function formatSharedBy(displayName) {
  if (displayName) return displayName;
  return "a TripTok user";
}

export default function TripDetail() {
  const { id } = useParams();
  const {
    tripsById,
    removeItem,
    updateItemNote,
    updateItemTitle,
    enableShare,
    user,
    loading,
  } = useTrips();
  const [sortMode, setSortMode] = useState("newest");
  const [editingId, setEditingId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelected, setCompareSelected] = useState(new Set());
  const [compareNotice, setCompareNotice] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const [shareUrlOverride, setShareUrlOverride] = useState("");
  const [itemMenuOpenId, setItemMenuOpenId] = useState("");
  const [itemShare, setItemShare] = useState(null);
  const [itemShareMsg, setItemShareMsg] = useState("");

  const trip = tripsById.get(id);
  const shareUrl = trip?.shareId ? `${window.location.origin}/share/${trip.shareId}` : "";
  const shareBase = process.env.REACT_APP_SHARE_ORIGIN || window.location.origin;
  const shareUrlFromBase = trip?.shareId ? `${shareBase}/share/${trip.shareId}` : "";
  const shareUrlFinal = shareUrlOverride || shareUrlFromBase || shareUrl;

  useEffect(() => {
    if (trip?.shareId && shareUrlOverride) {
      setShareUrlOverride("");
    }
  }, [trip?.shareId, shareUrlOverride]);

  useEffect(() => {
    function handleDocumentClick(event) {
      const target = event.target;
      if (target && target.closest(".itemMenuWrap")) return;
      setItemMenuOpenId("");
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);
  const sortedItems = useMemo(() => {
    if (!trip?.items) return [];
    const items = [...trip.items];

    if (sortMode === "oldest") {
      return items.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    }

    if (sortMode === "notes") {
      return items.sort((a, b) => {
        const aHas = (a.note || "").trim().length > 0;
        const bHas = (b.note || "").trim().length > 0;
        if (aHas !== bHas) return aHas ? -1 : 1;
        return (b.addedAt || 0) - (a.addedAt || 0);
      });
    }

    return items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }, [trip, sortMode]);

  const compareItems = useMemo(() => {
    if (!trip?.items || compareSelected.size === 0) return [];
    return trip.items.filter((item) => compareSelected.has(item.id));
  }, [trip, compareSelected]);

  function startEditTitle(item) {
    const parts = splitTitleParts(item.title, item.airbnbUrl);
    setEditingId(item.id);
    setEditingTitle(parts.main);
  }

  function cancelEditTitle() {
    setEditingId("");
    setEditingTitle("");
  }

  function saveEditTitle(item) {
    const parts = splitTitleParts(item.title, item.airbnbUrl);
    const main = (editingTitle || "").trim() || fallbackTitleForUrl(item.airbnbUrl);
    const next = parts.meta.length > 0 ? `${main} · ${parts.meta.join(" · ")}` : main;
    updateItemTitle(trip.id, item.id, next);
    setEditingId("");
    setEditingTitle("");
  }

  function toggleCompareEnabled() {
    setCompareEnabled((prev) => {
      const next = !prev;
      if (!next) {
        setCompareSelected(new Set());
        setCompareMode(false);
      }
      return next;
    });
  }

  function toggleCompareItem(itemId) {
    setCompareSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else if (next.size < 4) {
        next.add(itemId);
      } else {
        setCompareNotice("You can compare up to 4 listings.");
        setTimeout(() => setCompareNotice(""), 1600);
      }
      return next;
    });
  }

  function handleRemoveItem(itemId) {
    removeItem(trip.id, itemId);
    setCompareSelected((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }

  function clearCompareSelection() {
    setCompareSelected(new Set());
  }

  function getItemTitle(item) {
    return (item.title || "").trim() || item.airbnbUrl;
  }

  function setCopiedMessage() {
    setExportMsg("Copied!");
    setTimeout(() => setExportMsg(""), 1500);
  }

  function handleCopyLinks() {
    const text = sortedItems.map((item) => item.airbnbUrl).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedMessage();
    setExportOpen(false);
  }

  function handleCopyShortlist() {
    const text = sortedItems
      .map((item) => {
        const title = getItemTitle(item);
        const note = (item.note || "").trim();
        return note
          ? `- ${title} (${item.airbnbUrl}) — ${note}`
          : `- ${title} (${item.airbnbUrl})`;
      })
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopiedMessage();
    setExportOpen(false);
  }

  function escapeCsv(value) {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function handleDownloadCsv() {
    const header = ["title", "url", "note", "sourceText", "addedAt"].join(",");
    const rows = sortedItems.map((item) => {
      return [
        escapeCsv(getItemTitle(item)),
        escapeCsv(item.airbnbUrl),
        escapeCsv(item.note || ""),
        escapeCsv(item.sourceText || ""),
        escapeCsv(item.addedAt || ""),
      ].join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${trip.name || "trip"}-shortlist.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }

  async function handleToggleShare() {
    if (!trip?.shareId) {
      const newShareId = await enableShare(trip.id);
      if (newShareId) {
        setShareUrlOverride(`${shareBase}/share/${newShareId}`);
      }
    }
    const targetUrl = shareUrlOverride || shareUrl;
    if (targetUrl && navigator.share) {
      try {
        await navigator.share({
          title: trip.name,
          text: `${trip.name} shortlist`,
          url: targetUrl,
        });
        return;
      } catch {
        // fall back to panel if share was cancelled or failed
      }
    }
    setShareOpen((v) => !v);
    setExportOpen(false);
  }

  function setShareMessage(text) {
    setShareMsg(text);
    setTimeout(() => setShareMsg(""), 1500);
  }

  async function handleCopyShareLink() {
    if (!shareUrlFinal) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrlFinal);
      setShareMessage("Copied!");
    }
  }

  function openItemShare(item) {
    setItemShare(item);
    setItemShareMsg("");
    setItemMenuOpenId("");
  }

  async function handleCopyItemShare() {
    if (!itemShare) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(itemShare.airbnbUrl);
      setItemShareMsg("Copied!");
      setTimeout(() => setItemShareMsg(""), 1500);
    }
  }

  async function handleSystemShareItem() {
    if (!itemShare || !navigator.share) return;
    try {
      await navigator.share({
        title: itemShare.title || "Airbnb listing",
        url: itemShare.airbnbUrl,
      });
      setItemShare(null);
    } catch {
      // keep modal open if cancelled
    }
  }

  async function handleSystemShare() {
    if (!shareUrlFinal || !navigator.share) return;
    try {
      await navigator.share({
        title: trip?.name,
        text: `${trip?.name || "Trip"} shortlist`,
        url: shareUrlFinal,
      });
      setShareOpen(false);
    } catch {
      // keep modal open if cancelled
    }
  }


  if (!user && !loading) {
    return (
      <div className="page">
        <div className="card glow">
          <h1>
            Trip <span>Access</span>
          </h1>

          <div className="content">
            <p className="muted">Sign in to view and edit your trips.</p>
            <LoginForm />
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

  // If trip doesn't exist (bad URL / deleted), show a friendly message
  if (!trip) {
    return (
      <div className="page">
        <div className="card glow">
          <h1>
            Trip <span>Not found</span>
          </h1>

          <div className="content">
            <p className="muted">That trip doesn’t exist (it may have been deleted).</p>

            <div className="navRow">
              <Link className="miniBtn linkBtn" to="/trips">
                ← Back to Trips
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
        <div className="tripTitleRow">
          <h1>
            {trip.name} <span>Shortlist</span>
          </h1>
          {trip.items.length > 0 && (
            <button className="iconBtn bare" type="button" onClick={handleToggleShare}>
              <img className="iconImg" src={shareIcon} alt="Share" />
            </button>
          )}
        </div>
        {(trip.shareId || trip.isShared) && (
          <div className="sharedByLine">
            Shared by {formatSharedBy(trip.ownerDisplayName)}
          </div>
        )}

        <div className="content">
          <div className="navRow">
            <Link className="miniBtn linkBtn" to="/trips">
              ← Trips
            </Link>
            <Link className="miniBtn linkBtn" to="/">
              Extractor
            </Link>
            {trip.items.length > 0 && (
              <button className="miniBtn" type="button" onClick={toggleCompareEnabled}>
                {compareEnabled ? "Done" : "Compare"}
              </button>
            )}
            {trip.items.length > 0 && (
              <button
                className="miniBtn"
                type="button"
                onClick={() => {
                  setExportOpen((v) => !v);
                  setShareOpen(false);
                }}
              >
                {exportOpen ? "Close Export" : "Export"}
              </button>
            )}
          </div>

          {shareOpen && (trip.shareId || shareUrlOverride) && (
            <div
              className="shareOverlay"
              role="dialog"
              aria-modal="true"
              onClick={() => setShareOpen(false)}
            >
              <div className="shareModal" onClick={(e) => e.stopPropagation()}>
                <div className="shareModalHeader">
                  <div>
                    <div className="shareModalTitle">Share trip</div>
                    <div className="shareModalSubtitle">{trip.name}</div>
                  </div>
                  <button
                    className="shareModalClose"
                    type="button"
                    aria-label="Close"
                    onClick={() => setShareOpen(false)}
                  >
                    ×
                  </button>
                </div>
                {shareMsg && <div className="shareModalMsg">{shareMsg}</div>}
                <div className="shareModalActions">
                  <div className="shareLinkRow">
                    <button className="miniBtn blue" type="button" onClick={handleCopyShareLink}>
                      Copy
                    </button>
                    <div className="shareLinkValue">{shareUrlFinal}</div>
                  </div>
                  {navigator.share && (
                    <button className="secondary-btn" type="button" onClick={handleSystemShare}>
                      Share via device
                    </button>
                  )}
                  <a
                    className="secondary-btn linkBtn"
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `${shareUrlFinal}`
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

          {exportOpen && (
            <div className="exportPanel">
              <div className="exportHeader">
                <div className="exportTitle">Export</div>
                {exportMsg && <div className="exportMsg">{exportMsg}</div>}
              </div>
              <div className="exportActions">
                <button className="miniBtn" type="button" onClick={handleCopyLinks}>
                  Copy links
                </button>
                <button className="miniBtn" type="button" onClick={handleCopyShortlist}>
                  Copy shortlist
                </button>
                <button className="miniBtn" type="button" onClick={handleDownloadCsv}>
                  Download CSV
                </button>
              </div>
            </div>
          )}

          {itemShare && (
            <div
              className="shareOverlay"
              role="dialog"
              aria-modal="true"
              onClick={() => setItemShare(null)}
            >
              <div className="shareModal" onClick={(e) => e.stopPropagation()}>
                <div className="shareModalHeader">
                  <div>
                    <div className="shareModalTitle">Share listing</div>
                    <div className="shareModalSubtitle">
                      {(itemShare.title || "").trim() || "Airbnb listing"}
                    </div>
                  </div>
                  <button
                    className="shareModalClose"
                    type="button"
                    aria-label="Close"
                    onClick={() => setItemShare(null)}
                  >
                    ×
                  </button>
                </div>
                {itemShareMsg && <div className="shareModalMsg">{itemShareMsg}</div>}
                <div className="shareModalActions">
                  <div className="shareLinkRow">
                    <button className="miniBtn blue" type="button" onClick={handleCopyItemShare}>
                      Copy
                    </button>
                    <div className="shareLinkValue">{itemShare.airbnbUrl}</div>
                  </div>
                  {navigator.share && (
                    <button className="secondary-btn" type="button" onClick={handleSystemShareItem}>
                      Share via device
                    </button>
                  )}
                  <a
                    className="secondary-btn linkBtn"
                    href={`https://wa.me/?text=${encodeURIComponent(itemShare.airbnbUrl)}`}
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

          {trip.items.length === 0 ? (
            <p className="muted">
              No links saved yet. Go to the extractor and save one to this trip.
            </p>
          ) : (
            <div className="itemList">
              {compareMode ? (
                <div className="compareView">
                  <div className="compareHeader">
                    <div className="compareTitle">
                      Compare <span className="compareCount">({compareSelected.size})</span>
                    </div>
                    <div className="compareHeaderActions">
                      <button
                        className="miniBtn"
                        type="button"
                        onClick={() => setCompareMode(false)}
                      >
                        Back to list
                      </button>
                      <button className="miniBtn" type="button" onClick={clearCompareSelection}>
                        Clear selection
                      </button>
                    </div>
                  </div>

                  <div className={`compareGrid count-${compareItems.length}`}>
                    {compareItems.map((item) => {
                      const titleParts = splitTitleParts(item.title, item.airbnbUrl);
                      return (
                        <div key={item.id} className="itemCard compareCard">
                          <div className="compareCardHeader">
                            <a
                              className="itemLink compareTitle"
                              href={item.airbnbUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={titleParts.main}
                            >
                              {titleParts.main}
                            </a>

                            {titleParts.meta.length > 0 && (
                              <div className="compareMeta">
                                {titleParts.meta.map((part) => (
                                  <span key={part} className="chip">
                                    {part}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="compareActionsRow">
                            <a
                              className="miniBtn linkBtn compareBtn"
                              href={item.airbnbUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open
                            </a>
                            <div className="itemMenuWrap">
                              <button
                                className="itemMenuBtn"
                                type="button"
                                aria-label="Listing options"
                                onClick={() =>
                                  setItemMenuOpenId((prev) => (prev === item.id ? "" : item.id))
                                }
                              >
                                ⋯
                              </button>
                              {itemMenuOpenId === item.id && (
                                <div className="itemMenu" role="menu">
                                  <button
                                  className="itemMenuItem"
                                  type="button"
                                  onClick={() => openItemShare(item)}
                                >
                                  Share
                                </button>
                                  <button
                                    className="itemMenuItem danger"
                                    type="button"
                                    onClick={() => handleRemoveItem(item.id)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          <textarea
                            className="note compact"
                            placeholder="Add a note (e.g. 'near beach', 'sleeps 8', 'from @creator')..."
                            value={item.note || ""}
                            onChange={(e) => updateItemNote(trip.id, item.id, e.target.value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <>
                  <div className="sortRow">
                    <label className="sortLabel" htmlFor="sortItems">
                      Sort
                    </label>
                    <select
                      id="sortItems"
                      className="select sortSelect"
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value)}
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="notes">Notes first</option>
                    </select>
                  </div>

                  {sortedItems.map((item) => {
                    const titleParts = splitTitleParts(item.title, item.airbnbUrl);
                    const isSelected = compareSelected.has(item.id);
                    const disableSelect = compareSelected.size >= 4 && !isSelected;

                    return (
                      <div key={item.id} className="itemCard">
                        <div className="itemTop">
                          {compareEnabled && (
                            <label className="compareCheckbox">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={disableSelect}
                                onChange={() => toggleCompareItem(item.id)}
                              />
                            </label>
                          )}
                          <div className="itemTitleBlock">
                            {editingId === item.id ? (
                              <input
                                className="titleInput"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                              />
                            ) : (
                              <>
                                <a
                                  className="itemLink"
                                  href={item.airbnbUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {titleParts.main}
                                </a>
                                {titleParts.meta.length > 0 && (
                                  <div className="itemMeta">
                                    {titleParts.meta.map((part) => (
                                      <span key={part} className="metaBadge">
                                        {part}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          <div className="itemActions">
                            <a
                              className="miniBtn linkBtn"
                              href={item.airbnbUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open
                            </a>
                            {editingId === item.id ? (
                              <>
                                <button
                                  className="miniBtn"
                                  type="button"
                                  onClick={() => saveEditTitle(item)}
                                >
                                  Save
                                </button>
                                <button className="miniBtn" type="button" onClick={cancelEditTitle}>
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                className="miniBtn"
                                type="button"
                                onClick={() => startEditTitle(item)}
                              >
                                Edit
                              </button>
                            )}
                            <div className="itemMenuWrap">
                              <button
                                className="itemMenuBtn"
                                type="button"
                                aria-label="Listing options"
                                onClick={() =>
                                  setItemMenuOpenId((prev) => (prev === item.id ? "" : item.id))
                                }
                              >
                                ⋯
                              </button>
                              {itemMenuOpenId === item.id && (
                                <div className="itemMenu" role="menu">
                                  <button
                                  className="itemMenuItem"
                                  type="button"
                                  onClick={() => openItemShare(item)}
                                >
                                  Share
                                </button>
                                  <button
                                    className="itemMenuItem danger"
                                    type="button"
                                    onClick={() => handleRemoveItem(item.id)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <textarea
                          className="note compact"
                          placeholder="Add a note (e.g. 'near beach', 'sleeps 8', 'from @creator')..."
                          value={item.note || ""}
                          onChange={(e) => updateItemNote(trip.id, item.id, e.target.value)}
                        />

                        {/* Only show source text if it's useful */}
                        {item.sourceText && (
                          <div className="source">
                            <span className="sourceLabel">Source:</span> {item.sourceText}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {compareEnabled && !compareMode && compareSelected.size >= 2 && (
                <div className="compareBar">
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={() => setCompareMode(true)}
                  >
                    Compare ({compareSelected.size})
                  </button>
                  <button className="secondary-btn" type="button" onClick={clearCompareSelection}>
                    Clear
                  </button>
                  {compareNotice && <div className="compareNotice">{compareNotice}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
