import { useEffect, useMemo, useRef, useState } from "react";
import { useTrips } from "../hooks/useTrips";
import { LoginForm } from "./Login";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function cleanUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("airbnb.")) {
      return `${parsed.origin}${parsed.pathname}`;
    }
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function stripUrls(text = "") {
  return text.replace(/https?:\/\/\S+/gi, "").trim();
}

function normalizeRawUrl(raw) {
  return raw.replace(/^[("'`[{]+/, "").replace(/[),.]+$/g, "");
}

function ensureScheme(url) {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("www.")) return `https://${url}`;
  return `https://${url}`;
}

function extractLinksFromText(text = "") {
  const regex = /(?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<]*)?/gi;
  const matches = text.match(regex) || [];
  return matches
    .map((m) => normalizeRawUrl(m.trim()))
    .filter((m) => m && !m.includes("@"))
    .map((m) => ensureScheme(m));
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
    const res = await fetch("/resolve-airbnb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (data?.resolvedUrl) return cleanUrl(data.resolvedUrl);
  } catch {
    // fall back to original
  }

  return url;
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

function fallbackTitleForUrl(cleanedUrl) {
  try {
    const parsed = new URL(cleanedUrl);
    if (parsed.hostname.includes("airbnb.")) {
      const roomId = extractRoomIdFromUrl(cleanedUrl);
      return roomId ? `Airbnb room ${roomId}` : "Airbnb room";
    }
    return humanizeSlugTitle(parsed.pathname, parsed.hostname);
  } catch {
    return "Stashed link";
  }
}

function getDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getPlatform(domain) {
  if (!domain) return "";
  if (domain.includes("airbnb.")) return "airbnb";
  return "";
}

function decodeHtmlEntities(text = "") {
  if (!text) return "";
  if (typeof document === "undefined") return text;
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

async function fetchTitleWithTimeout(endpoint, url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    const data = await res.json();
    return data?.title || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default function Home() {
  const { trips, createTrip, addItemToTrip, user } = useTrips();
  const textareaRef = useRef(null);

  const [comment, setComment] = useState("");
  const [link, setLink] = useState("");
  const [linkMeta, setLinkMeta] = useState(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [copied, setCopied] = useState(false);
  const [autoRedirect, setAutoRedirect] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);

  // Trips UI
  const [selectedTripId, setSelectedTripId] = useState("");
  const [newTripName, setNewTripName] = useState("");
  const [newTripType, setNewTripType] = useState("travel");
  const [savedMsg, setSavedMsg] = useState("");
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [linksFound, setLinksFound] = useState(0);
  const [lastSavedTripId, setLastSavedTripId] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showNewStash, setShowNewStash] = useState(false);
  const pendingCreateRef = useRef(false);

  const pendingTripKey = "pending_trip_create_name";
  const pendingTripTypeKey = "pending_trip_create_type";

  useEffect(() => {
    if (!user || pendingCreateRef.current) return;
    const pendingName = sessionStorage.getItem(pendingTripKey);
    const pendingType = sessionStorage.getItem(pendingTripTypeKey) || "travel";
    if (!pendingName) return;

    let cancelled = false;
    pendingCreateRef.current = true;
    (async () => {
      const id = await createTrip(pendingName, pendingType);
      if (!id || cancelled) {
        pendingCreateRef.current = false;
        return;
      }
      setSelectedTripId(id);
      setNewTripName("");
      setNewTripType("travel");
      setSavedMsg("Stash created.");
      setTimeout(() => setSavedMsg(""), 1200);
      setShowAuthPrompt(false);
      sessionStorage.removeItem(pendingTripKey);
      sessionStorage.removeItem(pendingTripTypeKey);
      pendingCreateRef.current = false;
    })();

    return () => {
      cancelled = true;
    };
  }, [user, createTrip]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.focus();
  }, []);

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
      (selectedTrip.items || []).map((item) => cleanUrl(item.url || item.airbnbUrl))
    );
  }, [selectedTrip]);

  function resetAll() {
    setComment("");
    setLink("");
    setLinkMeta(null);
    setError("");
    setWarning("");
    setCopied(false);
    setHasAttempted(false);
    setSavedMsg("");
    setBulkLinks([]);
    setSelectedIds(new Set());
    setLinksFound(0);
    setLastSavedTripId("");
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
    const trimmed = (newTripName || "").trim();
    if (!trimmed) {
      setError("Enter a stash name.");
      return;
    }
    if (!user) {
      sessionStorage.setItem(pendingTripKey, trimmed);
      sessionStorage.setItem(pendingTripTypeKey, newTripType);
      setShowAuthPrompt(true);
      return;
    }
    const id = await createTrip(newTripName, newTripType);
    if (!id) return;
    setSelectedTripId(id);
    setNewTripName("");
    setNewTripType("travel");
    setSavedMsg("Stash created.");
    setTimeout(() => setSavedMsg(""), 1200);
    setShowNewStash(false);

    if (link) {
      await saveSingleToTrip(id);
    } else if (bulkLinks.length > 1) {
      saveBulkToTrip(id);
    }
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

  function saveBulkToTrip(tripIdOverride = "") {
    setError("");
    setSavedMsg("");

    const targetTripId = tripIdOverride || selectedTripId;
    if (!targetTripId) {
      setError("Choose a stash (or create one) before stashing.");
      return;
    }

    const chosen = bulkLinks.filter(
      (x) => selectedIds.has(x.id) && x.valid && !x.duplicate
    );

    if (chosen.length === 0) {
      setError("Select at least one new link to stash.");
      return;
    }

    const sourceText = stripUrls(comment).slice(0, 300);

    const fetchTitleForUrl = async (cleanedUrl) => {
      if (cleanedUrl.includes("airbnb.")) {
        const title = await fetchTitleWithTimeout("/fetch-airbnb-title", cleanedUrl);
        if (title) return decodeHtmlEntities(title);
      } else {
        const title = await fetchTitleWithTimeout("/fetch-title", cleanedUrl);
        if (title) return decodeHtmlEntities(title);
      }
      return fallbackTitleForUrl(cleanedUrl);
    };

    Promise.all(
      chosen.map(async (item) => ({
        id: uid(),
        url: item.cleaned,
        airbnbUrl: item.cleaned,
        originalUrl: item.original,
        domain: item.domain,
        platform: item.platform,
        itemType: "link",
        imageUrl: null,
        faviconUrl: null,
        metadata: {},
        sourceText,
        note: "",
        status: "unknown",
        addedAt: Date.now(),
        title: await fetchTitleForUrl(item.cleaned),
      }))
    ).then((items) => {
      for (const item of items) {
        addItemToTrip(targetTripId, item);
      }
      const tripName =
        trips.find((trip) => trip.id === targetTripId)?.name || "stash";
      setSavedMsg(`Stashed in ${tripName}`);
      setToastMsg(`Stashed ${items.length} link${items.length === 1 ? "" : "s"}`);
      setTimeout(() => setSavedMsg(""), 1800);
      setTimeout(() => setToastMsg(""), 2000);
    });
  }

  // This keeps your single-link verification (Airbnb often blocks it),
  // but bulk mode will NOT verify each link.
  async function verifyAndMaybeRedirectSingle(cleaned) {
    if (!cleaned.includes("airbnb.")) return true;
    try {
      const res = await fetch("/check-airbnb", {
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
    setLinkMeta(null);
    setLinksFound(0);
    setLastSavedTripId("");

    // Find ALL links in the pasted text
    const matches = extractLinksFromText(comment);

    if (!matches || matches.length === 0) {
      setError("No link found in the text.");
      return;
    }

    // Clean + dedupe
    const cleanedUnique = [];
    const seen = new Set();

    for (const raw of matches) {
      const cleaned = cleanUrl(raw);
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);
      const domain = getDomain(cleaned);
      const platform = getPlatform(domain);
      cleanedUnique.push({ original: raw, cleaned, domain, platform });
    }
    setLinksFound(cleanedUnique.length);

    // Resolve short links (e.g. /slink/) and validate shape (room id exists)
    const resolved = await Promise.all(
      cleanedUnique.map(async (x) => {
        const cleaned = await resolveAirbnbUrl(x.cleaned);
        const domain = getDomain(cleaned);
        const platform = getPlatform(domain);
        return { ...x, cleaned, domain, platform };
      })
    );

    const built = resolved.map((x) => {
      const isAirbnb = x.cleaned.includes("airbnb.");
      const roomId = isAirbnb ? extractRoomIdFromUrl(x.cleaned) : null;
      const valid = isAirbnb ? roomId && !isObviouslyInvalidRoomId(roomId) : true;
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
      setLinkMeta(single);

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

  async function saveSingleToTrip(tripIdOverride = "") {
    setError("");
    setSavedMsg("");
    const targetTripId = tripIdOverride || selectedTripId;
    if (!targetTripId) {
      setError("Choose a stash (or create one) before stashing.");
      return;
    }
    if (!link) return;

    let title = fallbackTitleForUrl(link);
    const endpoint = link.includes("airbnb.") ? "/fetch-airbnb-title" : "/fetch-title";
    const fetched = await fetchTitleWithTimeout(endpoint, cleanUrl(link));
    if (fetched) title = decodeHtmlEntities(fetched);
    addItemToTrip(targetTripId, {
      id: uid(),
      url: link,
      airbnbUrl: link,
      originalUrl: linkMeta?.original || link,
      domain: linkMeta?.domain || getDomain(link),
      platform: linkMeta?.platform || getPlatform(linkMeta?.domain || getDomain(link)),
      itemType: "link",
      imageUrl: null,
      faviconUrl: null,
      metadata: {},
      sourceText: stripUrls(comment).slice(0, 300),
      note: "",
      status: warning ? "unknown" : "live",
      addedAt: Date.now(),
      title,
    });
    const tripName =
      trips.find((trip) => trip.id === targetTripId)?.name || "stash";
    setSavedMsg(`Stashed in ${tripName}`);
    setToastMsg("Stashed");
    setTimeout(() => setSavedMsg(""), 1500);
    setTimeout(() => setToastMsg(""), 2000);
  }

  return (
    <div className="page page--home">
      <div className="card glow">
        <h1>
          Ready to <span>stash</span>
        </h1>
        <p className="heroSubtitle">Stash links, notes, and things you'll want later.</p>

        <div className="content">
          {toastMsg && <div className="toast">{toastMsg}</div>}

          <textarea
            ref={textareaRef}
            className="input textarea dropzone"
            placeholder="Paste a link, text, or anything you want to stash..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                extractLinks();
              }
            }}
          />
          <div className="hint">Tip: paste multiple links at once.</div>
          {!comment && !link && bulkLinks.length === 0 && !isInputFocused && (
            <div className="emptyPrompt">Your stash starts here.</div>
          )}

          {!link && bulkLinks.length === 0 && (
            <div className="primaryRow">
              <button className="primary-btn primary-btn--dominant" onClick={extractLinks}>
                Stash
              </button>
            </div>
          )}
          <div className="keyHint">Ctrl/Cmd + Enter to stash</div>
          {linksFound > 0 && (
            <div className="extractCount">
              {linksFound} link{linksFound === 1 ? "" : "s"} ready to stash
            </div>
          )}

          <div className="optionsRow">
            <div className="optionsLabel">Preferences</div>
            <div className="optionsActions">
              <button type="button" className="miniBtn subtle" onClick={pasteFromClipboard}>
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
          </div>

          {/* SINGLE RESULT (existing UI) */}
          {link && (
            <div className="result result--stack">
              <div className="previewPanel">
                <div className="previewHeader">
                  <div className="previewTitleRow">
                    <p className="previewTitle">Ready to stash</p>
                    <span className="previewStatus">Cleaned</span>
                  </div>
                  <button className="tertiary-btn" onClick={resetAll}>
                    Clear
                  </button>
                </div>
                {linkMeta?.domain && <span className="domainPill">{linkMeta.domain}</span>}
                <div className="urlPreview">{link}</div>
                <div className="previewActions">
                  <button className="primary-btn btnCompact" onClick={copyToClipboard}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
                    className="secondary-btn btnCompact"
                    onClick={() => window.open(link, "_blank")}
                  >
                    Open
                  </button>
                </div>
              </div>

              <div className="savePanel">
                <div className="saveRowInline">
                  <span className="saveLabel">Stash in</span>
                  <select
                    className="select"
                    value={selectedTripId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedTripId(nextId);
                    }}
                  >
                    <option value="">Choose a stash</option>
                    {tripsForSelect.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.items.length})
                      </option>
                    ))}
                  </select>
                  <button
                    className="primary-btn btnCompact"
                    onClick={() => {
                      setLastSavedTripId(selectedTripId);
                      saveSingleToTrip();
                    }}
                    disabled={!selectedTripId}
                  >
                    Stash
                  </button>
                </div>

                <button
                  type="button"
                  className="miniBtn subtle newStashToggle"
                  onClick={() => setShowNewStash((prev) => !prev)}
                >
                  {showNewStash ? "Hide new stash" : "+ New stash"}
                </button>

                {showNewStash && (
                  <form
                    className="newStashForm"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleCreateTrip();
                    }}
                  >
                    <input
                      className="input small"
                      placeholder="New stash name (e.g. Barcelona July)"
                      value={newTripName}
                      onChange={(e) => setNewTripName(e.target.value)}
                    />
                    <select
                      className="select small"
                      value={newTripType}
                      onChange={(e) => setNewTripType(e.target.value)}
                      aria-label="Stash type"
                    >
                      <option value="travel">Travel</option>
                      <option value="fashion">Fashion</option>
                      <option value="general">General</option>
                    </select>
                    <button className="secondary-btn btnCompact" type="submit">
                      Create & stash
                    </button>
                  </form>
                )}

                {savedMsg && <div className="savedMsg">{savedMsg}</div>}
              </div>
            </div>
          )}

          {/* BULK RESULTS */}
          {bulkLinks.length > 1 && (
            <div className="result result--stack">
              <div className="previewPanel">
                <div className="previewHeader">
                  <div>
                    <p className="previewTitle">Links ready</p>
                    <span className="previewStatus">{bulkLinks.length} ready</span>
                  </div>
                </div>

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
                          <span className="bulkCleaned">{x.cleaned}</span>
                          {x.original !== x.cleaned && (
                            <span className="bulkOriginal">Original: {x.original}</span>
                          )}
                          {!x.valid && <span className="bulkBadge">Invalid</span>}
                          {x.duplicate && (
                            <span className="bulkBadge duplicate">Already stashed</span>
                          )}
                        </span>
                      </label>

                      <a className="miniBtn linkBtn" href={x.cleaned} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </div>
                  ))}
                </div>
              </div>

              <div className="savePanel">
                <div className="saveRowInline">
                  <span className="saveLabel">Stash in</span>
                  <select
                    className="select"
                    value={selectedTripId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedTripId(nextId);
                    }}
                  >
                    <option value="">Choose a stash</option>
                    {tripsForSelect.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.items.length})
                      </option>
                    ))}
                  </select>

                  <button
                    className="primary-btn btnCompact"
                    onClick={() => saveBulkToTrip()}
                    disabled={!selectedTripId}
                  >
                    Stash
                  </button>
                </div>
                <button
                  type="button"
                  className="miniBtn subtle newStashToggle"
                  onClick={() => setShowNewStash((prev) => !prev)}
                >
                  {showNewStash ? "Hide new stash" : "+ New stash"}
                </button>

                {showNewStash && (
                  <form
                    className="newStashForm"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleCreateTrip();
                    }}
                  >
                    <input
                      className="input small"
                      placeholder="New stash name (e.g. Barcelona July)"
                      value={newTripName}
                      onChange={(e) => setNewTripName(e.target.value)}
                    />
                    <select
                      className="select small"
                      value={newTripType}
                      onChange={(e) => setNewTripType(e.target.value)}
                      aria-label="Stash type"
                    >
                      <option value="travel">Travel</option>
                      <option value="fashion">Fashion</option>
                      <option value="general">General</option>
                    </select>
                    <button className="secondary-btn btnCompact" type="submit">
                      Create & stash
                    </button>
                  </form>
                )}

                {savedMsg && <div className="savedMsg">{savedMsg}</div>}
              </div>
            </div>
          )}

          {hasAttempted && !link && bulkLinks.length === 0 && (
            <div className="actions single">
              <div className="emptyNote">Nothing to stash yet.</div>
              <button className="secondary-btn" onClick={resetAll}>
                Clear
              </button>
            </div>
          )}

          {error && <p className="error">✕ {error}</p>}
          {warning && !error && <p className="warning">{warning}</p>}
        </div>
      </div>
      {showAuthPrompt && !user && (
        <div
          className="authOverlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowAuthPrompt(false)}
        >
          <div className="authModal" onClick={(e) => e.stopPropagation()}>
            <div className="authModalHeader">
              <div className="authModalTitle">Sign in to create a collection</div>
              <button
                className="miniBtn"
                type="button"
                onClick={() => setShowAuthPrompt(false)}
              >
                Close
              </button>
            </div>
            <LoginForm />
          </div>
        </div>
      )}
    </div>
  );
}
