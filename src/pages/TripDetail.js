import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useTrips } from "../hooks/useTrips";

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
  const { tripsById, removeItem, updateItemNote, updateItemTitle, enableShare, disableShare } =
    useTrips();
  const [sortMode, setSortMode] = useState("newest");
  const [editingId, setEditingId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelected, setCompareSelected] = useState(new Set());
  const [compareNotice, setCompareNotice] = useState("");

  const trip = tripsById.get(id);
  const shareUrl = trip?.shareId ? `${window.location.origin}/share/${trip.shareId}` : "";
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
        <h1>
          {trip.name} <span>Shortlist</span>
        </h1>

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
          </div>

          <div className="shareBox">
            {!trip.shareId ? (
              <button className="miniBtn" type="button" onClick={() => enableShare(trip.id)}>
                Enable sharing
              </button>
            ) : (
              <>
                <div className="shareUrl">{shareUrl}</div>
                <div className="shareActions">
                  <button
                    className="miniBtn"
                    type="button"
                    onClick={() => navigator.clipboard.writeText(shareUrl)}
                  >
                    Copy link
                  </button>
                  <button className="miniBtn danger" type="button" onClick={() => disableShare(trip.id)}>
                    Disable sharing
                  </button>
                </div>
              </>
            )}
          </div>

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
