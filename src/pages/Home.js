import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTrips } from "../hooks/useTrips";
import { LoginForm } from "./Login";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import TrendingListCard from "../components/TrendingListCard";
import { fetchFollowingFeed, fetchTrendingLists } from "../lib/socialDiscovery";
import { getSavedListsByIds, savePublicListToStash } from "../lib/socialSave";
import stashLogo from "../assets/icons/stash-favicon.png";
import userIcon from "../assets/icons/user.png";

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

function isAirbnbItem(item) {
  const domain = String(item?.domain || "").toLowerCase();
  const url = String(item?.url || item?.originalUrl || item?.airbnbUrl || "").toLowerCase();
  return domain.includes("airbnb.") || url.includes("airbnb.");
}

function recentTitleForItem(item) {
  const rawTitle = String(item?.title || "").trim();
  if (!rawTitle) return item?.domain || "Stashed link";

  let title = rawTitle.replace(/\s*[-|]\s*airbnb\s*$/i, "").trim();

  // Airbnb pages often append metadata like rating/bedrooms using separators.
  if (isAirbnbItem(item)) {
    title = title.split(/\s[·•]\s/)[0].trim();
    title = title.split(/\s\|\s/)[0].trim();
  }

  return title || item?.domain || "Stashed link";
}

function decodeHtmlEntities(text = "") {
  if (!text) return "";
  if (typeof document === "undefined") return text;
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

async function fetchTitleWithTimeout(endpoint, url, timeoutMs = 2500) {
  async function postJsonWithTimeout(path, body, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return await response.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    const data = await postJsonWithTimeout(endpoint, { url }, timeoutMs);
    const title = String(data?.title || "").trim();
    if (title) return title;

    const previewData = await postJsonWithTimeout("/fetch-link-preview", { url }, timeoutMs + 2000);
    const previewTitle = String(previewData?.title || "").trim();
    return previewTitle || null;
  } catch {
    return null;
  }
}

const FEED_PAGE_SIZE = 12;

export default function Home() {
  const { trips, createTrip, addItemToTrip, removeItem, user, deleteTrip, reloadTripItems } = useTrips();
  const textareaRef = useRef(null);
  const navigate = useNavigate();

  const [comment, setComment] = useState("");
  const [link, setLink] = useState("");
  const [linkMeta, setLinkMeta] = useState(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [autoRedirect, setAutoRedirect] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);

  // Trips UI
  const [selectedTripId, setSelectedTripId] = useState("");
  const [newTripType, setNewTripType] = useState("travel");
  const [savedMsg, setSavedMsg] = useState("");
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [linksFound, setLinksFound] = useState(0);
  const [lastSavedTripId, setLastSavedTripId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pendingCreateRef = useRef(false);
  const [autoExtractPending, setAutoExtractPending] = useState(false);
  const [stashQuery, setStashQuery] = useState("");
  const [stashOpen, setStashOpen] = useState(false);
  const [stashFocusArmed, setStashFocusArmed] = useState(false);
  const stashWrapRef = useRef(null);
  const stashInputRef = useRef(null);
  const [feedLists, setFeedLists] = useState([]);
  const [feedMode, setFeedMode] = useState("following");
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [feedSaveStateByListId, setFeedSaveStateByListId] = useState({});
  const feedRequestRef = useRef(0);

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

  useEffect(() => {
    function handleClick(event) {
      if (!stashWrapRef.current) return;
      if (stashWrapRef.current.contains(event.target)) return;
      setStashOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!stashOpen) return;
    if (!stashWrapRef.current) return;
    const el = stashWrapRef.current;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [stashOpen]);

  useEffect(() => {
    if (!autoExtractPending) return;
    if (!comment.trim()) return;
    extractLinks();
    setAutoExtractPending(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExtractPending, comment]);

  // Bulk extraction state
  const [bulkLinks, setBulkLinks] = useState([]); // [{ id, cleaned, original, valid }]
  const [selectedIds, setSelectedIds] = useState(new Set());

  const tripsForSelect = useMemo(() => trips.slice().reverse(), [trips]);
  const categoryCounts = useMemo(
    () =>
      ["general", "travel", "fashion"].reduce((acc, category) => {
        acc[category] = trips.filter((trip) => (trip.type || "general") === category).length;
        return acc;
      }, {}),
    [trips]
  );
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
  const hasPreviewItems = !!link || bulkLinks.length > 0;
  const previewCount = link ? 1 : bulkLinks.length;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showAllPreview, setShowAllPreview] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const recentItems = useMemo(() => {
    const items = trips.flatMap((trip) =>
      (trip.items || []).map((item) => ({
        ...item,
        tripId: trip.id,
        tripName: trip.name,
      }))
    );
    return items
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
      .slice(0, 5);
  }, [trips]);

  useEffect(() => {
    if (hasPreviewItems) {
      setPreviewOpen(true);
    } else {
      setPreviewOpen(false);
    }
    setShowAllPreview(false);
  }, [hasPreviewItems]);

  async function handleShareItem(item) {
    if (!item?.url) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(item.url);
      setToastMsg("Copied link");
      setTimeout(() => setToastMsg(""), 1400);
    }
  }
  const filteredTrips = useMemo(() => {
    const query = stashQuery.trim().toLowerCase();
    if (!query) return tripsForSelect;
    return tripsForSelect.filter((trip) =>
      (trip.name || "").toLowerCase().includes(query)
    );
  }, [stashQuery, tripsForSelect]);
  const exactMatchTrip = useMemo(() => {
    const query = stashQuery.trim().toLowerCase();
    if (!query) return null;
    return tripsForSelect.find((trip) => (trip.name || "").toLowerCase() === query) || null;
  }, [stashQuery, tripsForSelect]);

  const feedTitle = feedMode === "following" ? "From people you follow" : "Trending now";
  const feedSub =
    feedMode === "following"
      ? "Newest public lists from creators you follow."
      : "No followed activity yet, so these are trending this week.";

  function mergeUniqueLists(prevRows, nextRows) {
    const seen = new Set(prevRows.map((row) => row.id));
    const merged = [...prevRows];
    for (const row of nextRows) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
    return merged;
  }

  useEffect(() => {
    let active = true;
    const viewerUserId = user?.id || "";
    const requestId = feedRequestRef.current + 1;
    feedRequestRef.current = requestId;

    if (!viewerUserId) {
      setFeedLists([]);
      setFeedMode("following");
      setFeedLoading(false);
      setFeedLoadingMore(false);
      setFeedHasMore(false);
      setFeedError("");
      return () => {
        active = false;
      };
    }

    setFeedLoading(true);
    setFeedLoadingMore(false);
    setFeedError("");

    (async () => {
      const followingResult = await fetchFollowingFeed({
        viewerUserId,
        limit: FEED_PAGE_SIZE,
        offset: 0,
      });

      if (!active || feedRequestRef.current !== requestId) return;
      const followingLists = followingResult.lists || [];
      if (followingLists.length > 0) {
        setFeedMode("following");
        setFeedLists(followingLists);
        setFeedHasMore(!!followingResult.hasMore);
        setFeedLoading(false);
        return;
      }

      const trendingResult = await fetchTrendingLists({
        section: "all",
        search: "",
        limit: FEED_PAGE_SIZE,
        offset: 0,
      });

      if (!active || feedRequestRef.current !== requestId) return;
      setFeedMode("trending");
      setFeedLists(trendingResult.lists || []);
      setFeedHasMore(!!trendingResult.hasMore);
      setFeedLoading(false);
      if (followingResult.error) {
        setFeedError("Could not load followed activity. Showing trending.");
      }
    })().catch(() => {
      if (!active || feedRequestRef.current !== requestId) return;
      setFeedLists([]);
      setFeedHasMore(false);
      setFeedLoading(false);
      setFeedError("Could not load your feed right now.");
    });

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    const viewerUserId = user?.id || "";
    const ids = [...new Set((feedLists || []).map((row) => row.id).filter(Boolean))];
    if (!viewerUserId || !ids.length) {
      if (!viewerUserId) {
        setFeedSaveStateByListId({});
      }
      return () => {
        active = false;
      };
    }

    getSavedListsByIds({ viewerUserId, listIds: ids }).then(({ map }) => {
      if (!active) return;
      setFeedSaveStateByListId((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          const existing = next[id] || {};
          if (existing.saving) continue;
          next[id] = {
            saved: map.has(id),
            savedTripId: map.get(id)?.savedTripId || "",
            saving: false,
          };
        }
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [user?.id, feedLists]);

  async function loadMoreFeed() {
    const viewerUserId = user?.id || "";
    if (!viewerUserId || !feedHasMore || feedLoading || feedLoadingMore) return;
    setFeedLoadingMore(true);
    setFeedError("");
    const offset = feedLists.length;

    try {
      const result =
        feedMode === "following"
          ? await fetchFollowingFeed({
              viewerUserId,
              limit: FEED_PAGE_SIZE,
              offset,
            })
          : await fetchTrendingLists({
              section: "all",
              search: "",
              limit: FEED_PAGE_SIZE,
              offset,
            });

      if (result.error) {
        setFeedError("Could not load more right now.");
        setFeedLoadingMore(false);
        return;
      }

      setFeedLists((prev) => mergeUniqueLists(prev, result.lists || []));
      setFeedHasMore(!!result.hasMore);
      setFeedLoadingMore(false);
    } catch {
      setFeedLoadingMore(false);
      setFeedError("Could not load more right now.");
    }
  }

  async function viewFeedSavedList(list) {
    const listId = list?.id || "";
    if (!listId) return;
    const savedTripId = feedSaveStateByListId[listId]?.savedTripId || "";
    if (savedTripId) {
      navigate(`/trips/${savedTripId}`);
      return;
    }
    if (!user?.id) {
      navigate("/login");
      return;
    }
    if (feedSaveStateByListId[listId]?.saving) return;

    setFeedSaveStateByListId((prev) => ({
      ...prev,
      [listId]: {
        saved: true,
        savedTripId: "",
        ...(prev[listId] || {}),
        saving: true,
      },
    }));

    const result = await savePublicListToStash({
      viewerUserId: user.id,
      list,
      ownerHandle: list.owner_handle || "",
      createTrip,
      deleteTrip,
      reloadTripItems,
    });

    if (result.status === "saved" || result.status === "already_saved") {
      const nextTripId = result.savedTripId || "";
      setFeedSaveStateByListId((prev) => ({
        ...prev,
        [listId]: {
          saved: true,
          savedTripId: nextTripId,
          saving: false,
        },
      }));
      if (result.status === "saved" && result.insertedSaveRow) {
        setFeedLists((prev) =>
          prev.map((row) =>
            row.id === listId
              ? { ...row, save_count: Number(row.save_count || 0) + 1 }
              : row
          )
        );
      }
      if (nextTripId) {
        navigate(`/trips/${nextTripId}`);
        return;
      }
      navigate("/trips");
      return;
    }

    setFeedSaveStateByListId((prev) => ({
      ...prev,
      [listId]: {
        ...(prev[listId] || {}),
        saving: false,
      },
    }));
    setToastMsg(result.message || "Couldn’t open saved copy.");
    setTimeout(() => setToastMsg(""), 1800);
    navigate("/trips");
  }

  async function handleSaveFeedList(list) {
    if (!list?.id) return;
    const listId = list.id;
    if (!user?.id) {
      navigate("/login");
      return;
    }

    const state = feedSaveStateByListId[listId] || {};
    if (state.saving) return;
    if (state.saved) {
      await viewFeedSavedList(list);
      return;
    }

    setFeedSaveStateByListId((prev) => ({
      ...prev,
      [listId]: {
        saved: false,
        savedTripId: "",
        ...(prev[listId] || {}),
        saving: true,
      },
    }));

    const result = await savePublicListToStash({
      viewerUserId: user.id,
      list,
      ownerHandle: list.owner_handle || "",
      createTrip,
      deleteTrip,
      reloadTripItems,
    });

    if (result.status === "saved") {
      setFeedSaveStateByListId((prev) => ({
        ...prev,
        [listId]: {
          saved: true,
          savedTripId: result.savedTripId || "",
          saving: false,
        },
      }));
      if (result.insertedSaveRow) {
        setFeedLists((prev) =>
          prev.map((row) =>
            row.id === listId
              ? { ...row, save_count: Number(row.save_count || 0) + 1 }
              : row
          )
        );
      }
      setToastMsg("Saved to your Stash");
      setTimeout(() => setToastMsg(""), 1700);
      return;
    }

    if (result.status === "already_saved") {
      setFeedSaveStateByListId((prev) => ({
        ...prev,
        [listId]: {
          saved: true,
          savedTripId: result.savedTripId || "",
          saving: false,
        },
      }));
      setToastMsg("Already saved");
      setTimeout(() => setToastMsg(""), 1600);
      return;
    }

    setFeedSaveStateByListId((prev) => ({
      ...prev,
      [listId]: {
        saved: false,
        savedTripId: "",
        ...(prev[listId] || {}),
        saving: false,
      },
    }));
    setToastMsg(result.message || "Couldn’t save right now.");
    setTimeout(() => setToastMsg(""), 1800);
  }

  function resetAll() {
    setComment("");
    setLink("");
    setLinkMeta(null);
    setError("");
    setWarning("");
    setHasAttempted(false);
    setSavedMsg("");
    setBulkLinks([]);
    setSelectedIds(new Set());
    setLinksFound(0);
    setLastSavedTripId("");
  }

  function clearSinglePreview() {
    setLink("");
    setLinkMeta(null);
    setLinksFound(0);
    setHasAttempted(false);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      setComment(text);
      setAutoExtractPending(true);
    } catch {
      setWarning("Clipboard access was blocked by your browser.");
    }
  }

  async function createTripFromName(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    if (!user) {
      sessionStorage.setItem(pendingTripKey, trimmed);
      sessionStorage.setItem(pendingTripTypeKey, newTripType);
      setShowAuthPrompt(true);
      return null;
    }
    const id = await createTrip(trimmed, newTripType);
    if (!id) return null;
    setSelectedTripId(id);
    setNewTripType("travel");
    setSavedMsg("Stash created.");
    setTimeout(() => setSavedMsg(""), 1200);
    setStashQuery(trimmed);
    return id;
  }

  function removeBulkItem(id) {
    setBulkLinks((prev) => {
      const next = prev.filter((item) => item.id !== id);
      setLinksFound(next.length);
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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

  async function extractLinks() {
    setError("");
    setWarning("");
    setSavedMsg("");
    setLink("");
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
    <div className="page tripsPage collectionsShell homeShell min-h-screen app-bg text-[rgb(var(--text))]">
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
            title={
              <>
                <img className="homeTopbarLogo" src={stashLogo} alt="Stash" />
                <span className="homeTopbarWord">Stash</span>
              </>
            }
            subtitle=""
            searchValue=""
            onSearchChange={() => {}}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            actions={
              <>
                {user ? (
                  <>
                    <Link className="topbarIconBtn" to="/profile" aria-label="Profile">
                      <img className="topbarAvatar homeAvatar" src={userIcon} alt="" aria-hidden="true" />
                    </Link>
                  </>
                ) : (
                  <>
                    <Link className="topbarPill subtle" to="/login">
                      Sign in
                    </Link>
                  </>
                )}
              </>
            }
          />
        }
        isSidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      >
        {toastMsg && <div className="toast">{toastMsg}</div>}

        <div className="homeCenter">
          <div className="homeHero">
            <h1>Ready to stash</h1>
            <p>Paste links and stash them in seconds.</p>
          </div>
          {(warning || error) && (
            <div className={`homeAlert ${error ? "error" : "warning"}`}>
              <span className="homeAlertIcon" aria-hidden="true">
                ℹ
              </span>
              <span>{error || warning}</span>
            </div>
          )}

          <section className="homeWorkspace">
            <div className="panelHeader">
              <h2 className="panelHeaderTitle">Quick stash</h2>
              <p>Paste a link, text, or anything to stash.</p>
            </div>

            <div className="homeInputCard">
              <textarea
                ref={textareaRef}
                className="input textarea dropzone homeTextarea"
                placeholder="Paste a link, text, or anything you want to stash..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onPaste={() => setAutoExtractPending(true)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    extractLinks();
                  }
                }}
              />

              <div className="homeHintRow">
                <div className="hint">Tip: paste multiple links at once.</div>
                <div className="keyHint">Ctrl/Cmd + Enter</div>
              </div>
            </div>

            {hasPreviewItems && (
              <div className="stashBar">
                <div className="stashBarRow">
                  <span className="saveLabel">Stash in</span>
                  <div ref={stashWrapRef} className="stashCombo">
                    <input
                      ref={stashInputRef}
                      className="stashComboInput"
                      type="text"
                      placeholder="Choose a stash"
                      value={stashQuery}
                      onChange={(event) => {
                        const next = event.target.value;
                        setStashQuery(next);
                        setStashOpen(true);
                        setStashFocusArmed(true);
                        if (!next.trim()) {
                          setSelectedTripId("");
                          return;
                        }
                        const match = tripsForSelect.find(
                          (trip) => (trip.name || "").toLowerCase() === next.trim().toLowerCase()
                        );
                        setSelectedTripId(match ? match.id : "");
                      }}
                      onPointerDown={(event) => {
                        if (!stashFocusArmed) {
                          event.preventDefault();
                          setStashOpen(true);
                          setStashFocusArmed(true);
                        }
                      }}
                      onFocus={() => {
                        setStashOpen(true);
                        setStashFocusArmed(true);
                      }}
                      onBlur={() => setStashFocusArmed(false)}
                    />
                    {stashOpen && (
                      <div className="stashComboMenu" role="listbox">
                        {filteredTrips.length === 0 && !stashQuery.trim() && (
                          <div className="stashComboEmpty">No stashes yet.</div>
                        )}
                        {filteredTrips.map((trip) => (
                          <button
                            key={trip.id}
                            className="stashComboItem"
                            type="button"
                            onClick={() => {
                              setSelectedTripId(trip.id);
                              setStashQuery(trip.name || "");
                              setStashOpen(false);
                            }}
                          >
                            <span>{trip.name}</span>
                            <span className="stashComboMeta">{trip.items.length} links</span>
                          </button>
                        ))}
                        {stashQuery.trim() && !exactMatchTrip && (
                          <button
                            className="stashComboItem stashComboCreate"
                            type="button"
                            onClick={async () => {
                              const createdId = await createTripFromName(stashQuery);
                              if (createdId) {
                                setSelectedTripId(createdId);
                                setStashOpen(false);
                              }
                            }}
                          >
                            Create "{stashQuery.trim()}"
                          </button>
                        )}
                        <div className="stashComboDivider" />
                        <button
                          className="stashComboItem stashComboCreate"
                          type="button"
                          onClick={() => {
                            setStashQuery("");
                            setStashOpen(true);
                            setStashFocusArmed(true);
                            setTimeout(() => stashInputRef.current?.focus(), 0);
                          }}
                        >
                          + Create new stash...
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    className="primary-btn btnCompact homePrimaryBtn"
                    onClick={async () => {
                      let targetId = selectedTripId;
                      if (!targetId && stashQuery.trim()) {
                        targetId = await createTripFromName(stashQuery.trim());
                      }
                      if (!targetId) return;
                      if (link) {
                        setLastSavedTripId(targetId);
                        await saveSingleToTrip(targetId);
                      } else {
                        saveBulkToTrip(targetId);
                      }
                    }}
                    disabled={!selectedTripId && !stashQuery.trim()}
                  >
                    Stash
                  </button>
                </div>

                {savedMsg && <div className="savedMsg">{savedMsg}</div>}
              </div>
            )}

            <div className="homeSettingsCard">
              <div className="homePrefs">
                <button
                  className="prefsToggle"
                  type="button"
                  onClick={() => setPrefsOpen((prev) => !prev)}
                  aria-expanded={prefsOpen}
                >
                  Preferences
                  <span className={`prefsChevron ${prefsOpen ? "open" : ""}`} aria-hidden="true" />
                </button>
                {prefsOpen && (
                  <div className="prefsList">
                    <button
                      type="button"
                      className="prefsRow"
                      onClick={pasteFromClipboard}
                    >
                      <span>From Clipboard</span>
                      <span className="prefsAction">Paste</span>
                    </button>
                    <label className="prefsRow">
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
                )}
              </div>

              <div className="previewSection">
                <button
                  className="previewToggle"
                  type="button"
                  onClick={() => setPreviewOpen((prev) => !prev)}
                  aria-expanded={previewOpen}
                >
                  <span className="previewToggleText">Preview ({previewCount})</span>
                  <span
                    className={`previewChevron ${previewOpen ? "open" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {previewOpen && (
                  <div className="previewBody">
                    {!hasPreviewItems ? (
                      <div className="previewEmpty">Staging area empty</div>
                    ) : (
                      <>
                        <div
                          className={`previewRibbonScroll ${
                            showAllPreview ? "showAll" : "previewLimit"
                          }`}
                        >
                          {link && (
                            <div className="previewPill">
                              <div className="previewPillIcon">
                                {linkMeta?.domain && (
                                  <img
                                    src={`https://www.google.com/s2/favicons?domain=${linkMeta.domain}&sz=64`}
                                    alt=""
                                  />
                                )}
                              </div>
                              <div className="previewPillText">
                                {linkMeta?.domain || "Listing"}
                              </div>
                              <button
                                className="previewPillRemove"
                                type="button"
                                onClick={clearSinglePreview}
                                aria-label="Remove item"
                              >
                                ×
                              </button>
                            </div>
                          )}
                          {bulkLinks.map((x) => (
                            <div
                              key={x.id}
                              className={`previewPill ${x.valid ? "" : "invalid"} ${
                                x.duplicate ? "duplicate" : ""
                              }`}
                            >
                              <div className="previewPillIcon">
                                {x.domain && (
                                  <img
                                    src={`https://www.google.com/s2/favicons?domain=${x.domain}&sz=64`}
                                    alt=""
                                  />
                                )}
                              </div>
                              <div className="previewPillText">{x.domain || "Link"}</div>
                              <button
                                className="previewPillRemove"
                                type="button"
                                onClick={() => removeBulkItem(x.id)}
                                aria-label="Remove item"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        {previewCount > 3 && (
                          <button
                            className="previewShowAll"
                            type="button"
                            onClick={() => setShowAllPreview((prev) => !prev)}
                          >
                            {showAllPreview ? "Show less" : "Show all"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {user ? (
              <div className="homeFeed">
                <div className="homeFeedHead">
                  <div className="homeRecentLabel">Your feed</div>
                  <div className="homeFeedCopy">
                    <div className="listTitle">{feedTitle}</div>
                    <div className="fieldHelp">{feedSub}</div>
                  </div>
                </div>

                {feedError ? <div className="warning">{feedError}</div> : null}

                {feedLoading ? (
                  <div className="collectionsGrid homeFeedGrid">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="trendingListSkeleton" />
                    ))}
                  </div>
                ) : feedLists.length === 0 ? (
                  <div className="collectionsEmpty">
                    <div className="collectionsEmptyIcon" aria-hidden="true">
                      ✦
                    </div>
                    <div className="collectionsEmptyTitle">No lists in your feed yet</div>
                    <div className="collectionsEmptyText">
                      Follow creators or explore trending lists.
                    </div>
                    <div className="navRow">
                      <Link className="miniBtn linkBtn" to="/explore">
                        Open Explore
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="collectionsGrid homeFeedGrid">
                      {feedLists.map((list) => (
                        <TrendingListCard
                          key={list.id}
                          list={list}
                          handle={list.owner_handle}
                          isSaved={!!feedSaveStateByListId[list.id]?.saved}
                          isSaving={!!feedSaveStateByListId[list.id]?.saving}
                          onSave={() => handleSaveFeedList(list)}
                        />
                      ))}
                    </div>
                    {feedHasMore ? (
                      <div className="exploreLoadMoreRow">
                        <button
                          className="miniBtn blue"
                          type="button"
                          onClick={loadMoreFeed}
                          disabled={feedLoadingMore}
                        >
                          {feedLoadingMore ? "Loading…" : "Load more"}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            <div className="homeRecent">
              <div className="homeRecentHead">
                <div className="homeRecentLabel">Recently stashed ({recentItems.length})</div>
                {recentItems.length > 1 ? <div className="homeRecentHint">Swipe</div> : null}
              </div>
              {recentItems.length === 0 ? (
                <div className="homeRecentEmpty">No recent items yet.</div>
              ) : (
                <div className="homeRecentCarousel" role="list" aria-label="Recently stashed links">
                  {recentItems.map((item) => (
                    <div key={item.id} className="homeRecentItem" role="listitem">
                      <div className="homeRecentIcon">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L10.5 4.43"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          <path
                            d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07L13.5 19.57"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                      <div className="homeRecentMeta">
                        <div className="homeRecentTitle">
                          {recentTitleForItem(item)}
                        </div>
                        <div className="homeRecentSub">
                          {item.url || item.originalUrl || item.domain || "—"}
                        </div>
                      </div>
                      <div className="homeRecentActions">
                        <button
                          type="button"
                          className="homeRecentAction"
                          onClick={() => handleShareItem(item)}
                          aria-label="Share"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M15 8a3 3 0 1 0-2.83-4H9.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                            <path
                              d="M15 8H9.5a3.5 3.5 0 0 0 0 7H15"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="homeRecentAction danger"
                          onClick={() => removeItem(item.tripId, item.id)}
                          aria-label="Delete"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M3 6h18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                            <path
                              d="M8 6V4h8v2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                            <path
                              d="M6 6l1 14h10l1-14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </AppShell>

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
