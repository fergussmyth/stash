import { useMemo, useState } from "react";
import { useTrips } from "../hooks/useTrips";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function cleanAirbnbUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function stripUrls(text = "") {
  return text.replace(/https?:\/\/\S+/gi, "").trim();
}

function extractAirbnbLinks(text = "") {
  const regex =
    /https?:\/\/(?:www\.)?airbnb\.[^\s]*?(?=https?:\/\/(?:www\.)?airbnb\.|$|\s)/gi;
  const matches = text.match(regex);
  return matches ? matches.map((m) => m.trim()).filter(Boolean) : [];
}

function extractRoomIdFromUrl(url) {
  const m = url.match(/\/rooms\/(\d+)/i);
  return m ? m[1] : null;
}

function isObviouslyInvalidRoomId(roomId) {
  if (!roomId) return true;
  if (roomId.length < 5) return true;
  if (roomId.length > 24) return true;
  return false;
}

async function resolveAirbnbUrl(url) {
  if (!url || !url.includes("airbnb.")) return url;
  if (/\/rooms\/\d+/i.test(url)) return url;

  try {
    const res = await fetch("http://localhost:5000/resolve-airbnb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (data?.resolvedUrl) return cleanAirbnbUrl(data.resolvedUrl);
  } catch {
    // fall back to original
  }

  return url;
}

function fallbackTitleForUrl(cleanedUrl) {
  const roomId = extractRoomIdFromUrl(cleanedUrl);
  return roomId ? `Airbnb room ${roomId}` : "Airbnb room";
}

export default function Home() {
  const { trips, createTrip, addItemToTrip } = useTrips();

  const [comment, setComment] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [copied, setCopied] = useState(false);
  const [autoRedirect, setAutoRedirect] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);

  // Trips UI
  const [selectedTripId, setSelectedTripId] = useState("");
  const [newTripName, setNewTripName] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  // Bulk extraction state
  const [bulkLinks, setBulkLinks] = useState([]); // [{ id, cleaned, original, valid }]
  const [selectedIds, setSelectedIds] = useState(new Set());

  const tripsForSelect = useMemo(() => trips.slice().reverse(), [trips]);
  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId),
    [trips, selectedTripId]
  );
  const savedLinks = useMemo(() => {
    if (!selectedTrip) return new Set();
    return new Set(
      (selectedTrip.items || []).map((item) => cleanAirbnbUrl(item.airbnbUrl))
    );
  }, [selectedTrip]);

  function resetAll() {
    setComment("");
    setLink("");
    setError("");
    setWarning("");
    setCopied(false);
    setHasAttempted(false);
    setSavedMsg("");
    setBulkLinks([]);
    setSelectedIds(new Set());
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      setComment(text);
    } catch {
      setWarning("Clipboard access was blocked by your browser.");
    }
  }

  async function handleCreateTrip() {
    const id = await createTrip(newTripName);
    if (!id) return;
    setSelectedTripId(id);
    setNewTripName("");
    setSavedMsg("Trip created.");
    setTimeout(() => setSavedMsg(""), 1200);
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const all = new Set(
      bulkLinks
        .filter((x) => x.valid && !x.duplicate)
        .map((x) => x.id)
    );
    setSelectedIds(all);
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function saveBulkToTrip() {
    setError("");
    setSavedMsg("");

    if (!selectedTripId) {
      setError("Choose a trip (or create one) before saving.");
      return;
    }

    const chosen = bulkLinks.filter(
      (x) => selectedIds.has(x.id) && x.valid && !x.duplicate
    );

    if (chosen.length === 0) {
      setError("Select at least one new Airbnb link to save.");
      return;
    }

    const sourceText = stripUrls(comment).slice(0, 300);

    const fetchTitleForUrl = async (cleanedUrl) => {
      try {
        const res = await fetch("http://localhost:5000/fetch-airbnb-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: cleanedUrl }),
        });
        const data = await res.json();
        if (data?.title) return data.title;
      } catch {
        // ignore and fall back
      }
      return fallbackTitleForUrl(cleanedUrl);
    };

    Promise.all(
      chosen.map(async (item) => ({
        id: uid(),
        airbnbUrl: item.cleaned,
        sourceText,
        note: "",
        status: "unknown",
        addedAt: Date.now(),
        title: await fetchTitleForUrl(item.cleaned),
      }))
    ).then((items) => {
      for (const item of items) {
        addItemToTrip(selectedTripId, item);
      }
      setSavedMsg(`Saved ${items.length} link${items.length === 1 ? "" : "s"} ✅`);
      setTimeout(() => setSavedMsg(""), 1800);
    });
  }

  // This keeps your single-link verification (Airbnb often blocks it),
  // but bulk mode will NOT verify each link.
  async function verifyAndMaybeRedirectSingle(cleaned) {
    try {
      const res = await fetch("http://localhost:5000/check-airbnb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleaned }),
      });

      const data = await res.json();
      console.log("check-airbnb response:", data);

      if (data.exists === false) {
        setError("No listing was found for this Airbnb link.");
        return false;
      }

      if (data.exists === null) {
        setWarning("Airbnb blocked verification — opened anyway if enabled.");
      }

      return true;
    } catch {
      setWarning("Couldn’t verify right now — opened anyway if enabled.");
      return true; // allow opening anyway if enabled
    }
  }

  async function extractLinks() {
    setError("");
    setWarning("");
    setSavedMsg("");
    setLink("");
    setCopied(false);
    setHasAttempted(true);
    setBulkLinks([]);
    setSelectedIds(new Set());

    // Find ALL airbnb links in the pasted text
    const matches = extractAirbnbLinks(comment);

    if (!matches || matches.length === 0) {
      setError("No Airbnb link found in the text.");
      return;
    }

    // Clean + dedupe
    const cleanedUnique = [];
    const seen = new Set();

    for (const raw of matches) {
      const cleaned = cleanAirbnbUrl(raw);
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);
      cleanedUnique.push({ original: raw, cleaned });
    }

    // Resolve short links (e.g. /slink/) and validate shape (room id exists)
    const resolved = await Promise.all(
      cleanedUnique.map(async (x) => {
        const cleaned = await resolveAirbnbUrl(x.cleaned);
        return { ...x, cleaned };
      })
    );

    const built = resolved.map((x) => {
      const roomId = extractRoomIdFromUrl(x.cleaned);
      const valid = roomId && !isObviouslyInvalidRoomId(roomId);
      const duplicate = savedLinks.has(x.cleaned);
      return { id: uid(), ...x, valid: !!valid, duplicate };
    });

    // If only ONE link found → keep your “single result” UI
    if (built.length === 1) {
      const single = built[0];

      if (!single.valid) {
        setError("No Airbnb listing link found (must include /rooms/<id>).");
        return;
      }

      setLink(single.cleaned);

      // verify single (best effort)
      const ok = await verifyAndMaybeRedirectSingle(single.cleaned);
      if (!ok) return;

      if (autoRedirect) {
        window.open(single.cleaned, "_blank");
      }
      return;
    }

    // Bulk mode
    setBulkLinks(built);

    // Auto-select valid ones by default
    const defaultSelected = new Set(
      built.filter((x) => x.valid && !x.duplicate).map((x) => x.id)
    );
    setSelectedIds(defaultSelected);

    // In bulk mode, don’t auto-open a bunch of tabs.
    if (autoRedirect) {
      setWarning("Bulk mode: auto-open is disabled (to avoid opening lots of tabs).");
    }
  }

  return (
    <div className="page">
      <div className="card glow">
        <h1>
          Airbnb <span>Link Extractor</span>
        </h1>

        <div className="content">
          <textarea
            className="input textarea"
            placeholder="Paste one or multiple TikTok comments containing Airbnb links..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />

          <button className="primary-btn" onClick={extractLinks}>
            Extract Link{comment.match(/airbnb\./i) ? "s" : ""}
          </button>

          <div className="miniControls">
            <button type="button" className="miniBtn" onClick={pasteFromClipboard}>
              From Clipboard
            </button>

            <label className="miniToggle">
              <span>Auto-open</span>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={autoRedirect}
                  onChange={() => setAutoRedirect(!autoRedirect)}
                />
                <span className="slider" />
              </span>
            </label>
          </div>

          {/* SINGLE RESULT (existing UI) */}
          {link && (
            <div className="result">
              <p>Clean Airbnb link</p>
              <a href={link} target="_blank" rel="noreferrer">
                {link}
              </a>

              <div className="actions">
                <button className="secondary-btn" onClick={copyToClipboard}>
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button className="secondary-btn" onClick={resetAll}>
                  Clear
                </button>
              </div>

              <div className="saveRow">
                <select
                  className="select"
                  value={selectedTripId}
                  onChange={(e) => setSelectedTripId(e.target.value)}
                >
                  <option value="">Save to… (choose trip)</option>
                  {tripsForSelect.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.items.length})
                    </option>
                  ))}
                </select>

                <button className="secondary-btn" onClick={async () => {
                  setError("");
                  setSavedMsg("");
                  if (!selectedTripId) {
                    setError("Choose a trip (or create one) before saving.");
                    return;
                  }
                  let title = fallbackTitleForUrl(link);
                  try {
                    const res = await fetch("http://localhost:5000/fetch-airbnb-title", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ url: cleanAirbnbUrl(link) }),
                    });
                    const data = await res.json();
                    if (data?.title) title = data.title;
                  } catch {
                    // ignore and keep fallback
                  }
                  addItemToTrip(selectedTripId, {
                    id: uid(),
                    airbnbUrl: link,
                    sourceText: stripUrls(comment).slice(0, 300),
                    note: "",
                    status: warning ? "unknown" : "live",
                    addedAt: Date.now(),
                    title,
                  });
                  setSavedMsg("Saved to trip ✅");
                  setTimeout(() => setSavedMsg(""), 1500);
                }}>
                  Save
                </button>
              </div>

              <div className="createTripRow">
                <input
                  className="input small"
                  placeholder="New trip name (e.g. Barcelona July)"
                  value={newTripName}
                  onChange={(e) => setNewTripName(e.target.value)}
                />
                <button className="secondary-btn" onClick={handleCreateTrip}>
                  Create
                </button>
              </div>

              {savedMsg && <div className="savedMsg">{savedMsg}</div>}
            </div>
          )}

          {/* BULK RESULTS */}
          {bulkLinks.length > 1 && (
            <div className="result">
              <p>Found {bulkLinks.length} links</p>

              <div className="bulkActions">
                <button className="miniBtn" onClick={selectAll}>
                  Select all
                </button>
                <button className="miniBtn" onClick={clearSelection}>
                  Clear selection
                </button>
                <button className="miniBtn danger" onClick={resetAll}>
                  Clear all
                </button>
              </div>

              <div className="bulkList">
                {bulkLinks.map((x) => (
                  <div
                    key={x.id}
                    className={`bulkItem ${x.valid ? "" : "invalid"} ${
                      x.duplicate ? "duplicate" : ""
                    }`}
                  >
                    <label className="bulkLeft">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(x.id)}
                        disabled={!x.valid || x.duplicate}
                        onChange={() => toggleSelected(x.id)}
                      />
                      <span className="bulkText">
                        {x.cleaned}
                        {!x.valid && <span className="bulkBadge">Invalid</span>}
                        {x.duplicate && (
                          <span className="bulkBadge duplicate">Already saved</span>
                        )}
                      </span>
                    </label>

                    <a className="miniBtn linkBtn" href={x.cleaned} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </div>
                ))}
              </div>

              <div className="saveRow">
                <select
                  className="select"
                  value={selectedTripId}
                  onChange={(e) => setSelectedTripId(e.target.value)}
                >
                  <option value="">Save to… (choose trip)</option>
                  {tripsForSelect.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.items.length})
                    </option>
                  ))}
                </select>

                <button className="secondary-btn" onClick={saveBulkToTrip}>
                  Save
                </button>
              </div>

              <div className="createTripRow">
                <input
                  className="input small"
                  placeholder="New trip name (e.g. Barcelona July)"
                  value={newTripName}
                  onChange={(e) => setNewTripName(e.target.value)}
                />
                <button className="secondary-btn" onClick={handleCreateTrip}>
                  Create
                </button>
              </div>

              {savedMsg && <div className="savedMsg">{savedMsg}</div>}
            </div>
          )}

          {hasAttempted && !link && bulkLinks.length === 0 && (
            <div className="actions single">
              <button className="secondary-btn" onClick={resetAll}>
                Clear
              </button>
            </div>
          )}

          {error && <p className="error">✕ {error}</p>}
          {warning && !error && <p className="warning">{warning}</p>}
        </div>
      </div>
    </div>
  );
}
