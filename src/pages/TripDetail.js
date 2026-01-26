import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useTrips } from "../hooks/useTrips";
import shareIcon from "../assets/icons/share.png";

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

export default function TripDetail() {
  const { id } = useParams();
  const {
    tripsById,
    removeItem,
    updateItemNote,
    updateItemTitle,
    enableShare,
    disableShare,
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

  const trip = tripsById.get(id);
  const shareUrl = trip?.shareId ? `${window.location.origin}/share/${trip.shareId}` : "";
  const shareUrlFinal = shareUrlOverride || shareUrl;

  useEffect(() => {
    if (trip?.shareId && shareUrlOverride) {
      setShareUrlOverride("");
    }
  }, [trip?.shareId, shareUrlOverride]);
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
        setShareUrlOverride(`${window.location.origin}/share/${newShareId}`);
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
    await navigator.clipboard.writeText(shareUrlFinal);
    setShareMessage("Copied!");
    setShareOpen(false);
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
            <div className="sharePanel">
              <div className="sharePanelRow">
                <div className="shareLabel">Share</div>
                {shareMsg && <div className="shareMsg">{shareMsg}</div>}
              </div>
              <div className="shareUrl">{shareUrlFinal}</div>
              <div className="shareActions">
                <button className="miniBtn" type="button" onClick={handleCopyShareLink}>
                  Copy link
                </button>
                <a
                  className="miniBtn linkBtn"
                  href={`https://wa.me/?text=${encodeURIComponent(shareUrlFinal)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
                <a
                  className="miniBtn linkBtn"
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrlFinal)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  X
                </a>
                <button
                  className="miniBtn danger"
                  type="button"
                  onClick={() => {
                    disableShare(trip.id);
                    setShareUrlOverride("");
                    setShareOpen(false);
                  }}
                >
                  Disable
                </button>
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
                            <button
                              className="miniBtn compareBtn"
                              type="button"
                              onClick={() => navigator.clipboard.writeText(item.airbnbUrl)}
                            >
                              Copy
                            </button>
                            <button
                              className="miniBtn danger compareBtn"
                              onClick={() => handleRemoveItem(item.id)}
                            >
                              Remove
                            </button>
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
                            <button
                              className="miniBtn"
                              type="button"
                              onClick={() => navigator.clipboard.writeText(item.airbnbUrl)}
                            >
                              Copy
                            </button>
                              <button
                                className="miniBtn danger"
                                onClick={() => handleRemoveItem(item.id)}
                              >
                                Remove
                              </button>
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
