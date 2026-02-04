import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTrips } from "../hooks/useTrips";
import { supabase } from "../lib/supabaseClient";
import shareIcon from "../assets/icons/share.png";
import pinIcon from "../assets/icons/pin (1).png";
import whatsappIcon from "../assets/icons/whatsapp.png";
import { LoginForm } from "./Login";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import Dropdown from "../components/Dropdown";
import stashLogo from "../assets/icons/stash-favicon.png";
import userIcon from "../assets/icons/user.png";

function IconList(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCompare(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <rect x="3" y="5" width="8" height="14" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="5" width="8" height="14" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
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

function IconCopy(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <rect x="9" y="9" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="4" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" />
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

function IconNote(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M6 4h8l4 4v12H6zM14 4v4h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 12h8M8 16h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
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

function splitTitleParts(title, fallbackUrl) {
  const base = decodeHtmlEntities((title || "").trim()) || fallbackTitleForUrl(fallbackUrl);
  const parts = base.split(/\s*[•·]\s*/);
  if (parts.length <= 1) {
    return { main: base, meta: [] };
  }
  return { main: parts[0], meta: parts.slice(1) };
}

function splitMetaParts(parts = []) {
  let rating = "";
  const chips = [];
  for (const part of parts) {
    const trimmed = (part || "").trim();
    if (!trimmed) continue;
    if (!rating && /^[⭐★]\s*\d/.test(trimmed)) {
      rating = trimmed.replace(/^[⭐★]\s*/, "");
      continue;
    }
    chips.push(trimmed);
  }
  return { rating, chips };
}

function formatSharedBy(displayName) {
  if (displayName) return displayName;
  return "a Stash user";
}

function decodeHtmlEntities(text = "") {
  if (!text) return "";
  if (typeof document === "undefined") return text;
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

function getCollectionLabel(type) {
  if (type === "fashion") return "Fashion list";
  if (type === "travel") return "Shortlist";
  return "Collection";
}

function getCollectionShareLabel(type) {
  if (type === "fashion") return "fashion list";
  if (type === "travel") return "shortlist";
  return "collection";
}

function getDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function parseDomainList(value = "") {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim().replace(/^www\./, ""))
    .filter(Boolean);
}

function extractTags(text = "") {
  const matches = [];
  const pattern = /#([a-z0-9_-]+)/gi;
  let match = pattern.exec(text);
  while (match) {
    matches.push(match[1].toLowerCase());
    match = pattern.exec(text);
  }
  return Array.from(new Set(matches));
}

function extractMentions(text = "") {
  const matches = [];
  const pattern = /@([a-z0-9_-]+)/gi;
  let match = pattern.exec(text);
  while (match) {
    matches.push(match[1].toLowerCase());
    match = pattern.exec(text);
  }
  return Array.from(new Set(matches));
}

function getFileTypeFromUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split(".");
    if (parts.length <= 1) return "other";
    const ext = parts[parts.length - 1].toLowerCase();
    if (ext === "pdf") return "pdf";
    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ext)) return "image";
    if (["mp4", "mov", "webm", "mkv", "m4v"].includes(ext)) return "video";
    if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext)) return "audio";
    if (
      ["doc", "docx", "ppt", "pptx", "xls", "xlsx", "key", "pages", "numbers"].includes(ext)
    ) {
      return "doc";
    }
    return "other";
  } catch {
    return "other";
  }
}

function buildMetadataChips(metadata = {}) {
  const chips = [];
  if (metadata.rating != null) chips.push(`⭐ ${metadata.rating}`);
  if (metadata.beds != null) chips.push(`${metadata.beds} beds`);
  if (metadata.bedrooms != null) chips.push(`${metadata.bedrooms} bedrooms`);
  if (metadata.bathrooms != null) chips.push(`${metadata.bathrooms} bathrooms`);
  if (metadata.guests != null) chips.push(`${metadata.guests} guests`);
  return chips;
}

function normalizeChipKey(text = "") {
  const cleaned = String(text || "").trim().toLowerCase();
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*(bedrooms?|beds?|bathrooms?|guests?)/i);
  if (!match) return cleaned;
  const label = match[2]
    .replace(/bedrooms?/, "bedroom")
    .replace(/beds?/, "bed")
    .replace(/bathrooms?/, "bathroom")
    .replace(/guests?/, "guest");
  return label;
}

function mergeMetaChips(...groups) {
  const seen = new Set();
  const out = [];
  for (const group of groups) {
    for (const chip of group || []) {
      const key = normalizeChipKey(chip);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(chip);
    }
  }
  return out;
}

function extractAirbnbMetaFromTitle(title = "") {
  const text = String(title || "");
  const chips = [];
  const addChip = (value) => {
    if (!value) return;
    if (!chips.includes(value)) chips.push(value);
  };
  let rating = "";
  const ratingMatch =
    text.match(/[⭐★]\s*([0-9]+(?:\.[0-9]+)?)/) ||
    text.match(/([0-9]+(?:\.[0-9]+)?)\s*stars?/i) ||
    text.match(/([0-9]+(?:\.[0-9]+)?)\s*rating/i);
  if (ratingMatch) {
    rating = ratingMatch[1];
  }
  const bedsMatch = text.match(/(\d+)\s+bed(s)?/i);
  if (bedsMatch) addChip(`${bedsMatch[1]} beds`);
  const bedroomsMatch = text.match(/(\d+)\s+bedroom(s)?/i);
  if (bedroomsMatch) addChip(`${bedroomsMatch[1]} bedrooms`);
  const bathsMatch = text.match(/(\d+)\s+bath(room)?s?/i);
  if (bathsMatch) addChip(`${bathsMatch[1]} bathrooms`);
  const guestsMatch = text.match(/(\d+)\s+guest(s)?/i);
  if (guestsMatch) addChip(`${guestsMatch[1]} guests`);
  return { rating, chips };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_MS = 30 * DAY_MS;

function normalizePrimaryAction(value) {
  const action = (value || "").toLowerCase();
  if (action === "buy" || action === "watch" || action === "reference" || action === "book")
    return action;
  return "read";
}

function primaryActionLabel(action) {
  if (action === "buy") return "Buy";
  if (action === "book") return "Book";
  if (action === "watch") return "Watch";
  if (action === "reference") return "Open";
  return "Read";
}

function makeCoverGradient(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const colors = ["#0f172a", "#1e293b", "#0b3b5e", "#1f2a44", "#2b3655", "#0f3d3e"];
  const pick = (offset) => colors[Math.abs(hash + offset) % colors.length];
  return `linear-gradient(135deg, ${pick(0)} 0%, ${pick(2)} 50%, ${pick(4)} 100%)`;
}

function formatCollectionUpdatedAt(trip) {
  const itemTimes = (trip?.items || [])
    .map((item) => item.addedAt || 0)
    .filter(Boolean);
  const latest = itemTimes.length > 0 ? Math.max(...itemTimes) : Date.parse(trip?.createdAt || "");
  if (!latest) return "recently";
  return new Date(latest).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function CollectionCoverHeader({ trip, onShare, showShare }) {
  const [coverLoaded, setCoverLoaded] = useState(false);
  const coverSeed = useMemo(() => `${trip?.id || ""}-${trip?.name || ""}`, [trip?.id, trip?.name]);
  const fallbackGradient = useMemo(() => makeCoverGradient(coverSeed), [coverSeed]);
  const coverImageUrl = trip?.coverImageUrl || "";
  const isGradientCover =
    (trip?.coverImageSource || "") === "gradient" ||
    coverImageUrl.startsWith("linear-gradient") ||
    coverImageUrl.startsWith("radial-gradient");
  const isImageCover = !!coverImageUrl && !isGradientCover;
  const coverBackground = isGradientCover && coverImageUrl ? coverImageUrl : fallbackGradient;

  return (
    <div
      className={`detailCoverMedia ${coverLoaded ? "isLoaded" : ""}`}
      style={{ backgroundImage: coverBackground }}
    >
      {isImageCover && (
        <img
          className="detailCoverImage"
          src={coverImageUrl}
          alt=""
          loading="lazy"
          onLoad={() => setCoverLoaded(true)}
          onError={() => setCoverLoaded(true)}
        />
      )}
      <div className="detailCoverOverlay" aria-hidden="true" />
      <div className="detailCoverActions">
        {showShare && (
          <button
            className="coverActionBtn"
            type="button"
            onClick={onShare}
            aria-label="Share collection"
          >
            <img className="iconImg" src={shareIcon} alt="" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function TripDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    trips,
    tripsById,
    removeItem,
    updateItemNote,
    updateItemTitle,
    updateItemEngagement,
    enableShare,
    toggleItemPinned,
    user,
    loading,
  } = useTrips();
  const [sortMode, setSortMode] = useState("newest");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelected, setCompareSelected] = useState(new Set());
  const [compareNotice, setCompareNotice] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const [shareUrlOverride, setShareUrlOverride] = useState("");
  const [itemMenuOpenId, setItemMenuOpenId] = useState("");
  const [itemShare, setItemShare] = useState(null);
  const [itemShareMsg, setItemShareMsg] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [domainInclude, setDomainInclude] = useState("");
  const [domainExclude, setDomainExclude] = useState("");
  const [fileType, setFileType] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [mentionFilter, setMentionFilter] = useState("");
  const [groupByDomain, setGroupByDomain] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState(new Set());
  const [collapsedDomains, setCollapsedDomains] = useState({});
  const [inlineError, setInlineError] = useState("");
  const [inlineToast, setInlineToast] = useState("");
  const [showAllComparisons, setShowAllComparisons] = useState(false);
  const [highlightGroupId, setHighlightGroupId] = useState("");
  const [reviewOnlyGroupIds, setReviewOnlyGroupIds] = useState(new Set());
  const [candidateByGroup, setCandidateByGroup] = useState({});
  const [bannerDismissedGroupIds, setBannerDismissedGroupIds] = useState(new Set());
  const [showComparisonExplainer, setShowComparisonExplainer] = useState(false);
  const [focusGroupId, setFocusGroupId] = useState("");
  const comparisonTrackedRef = useRef({ shown: false, explainer: false });

  const trip = tripsById.get(id);
  const collectionLabel = getCollectionLabel(trip?.type);
  const collectionSubtitle =
    collectionLabel === "Shortlist"
      ? "Travel shortlist"
      : collectionLabel === "Fashion list"
        ? "Fashion list"
        : "Collection";
  const updatedAt = formatCollectionUpdatedAt(trip);
  const linkCount = trip?.items?.length || 0;
  const collectionShareLabel = getCollectionShareLabel(trip?.type);
  const hasItems = trip?.items?.length > 0;
  const shareUrl = trip?.shareId ? `${window.location.origin}/share/${trip.shareId}` : "";
  const rawShareBase = process.env.REACT_APP_SHARE_ORIGIN || window.location.origin;
  const shareBase = rawShareBase.replace(/\/+$/, "");
  const shareUrlFromBase = trip?.shareId ? `${shareBase}/share/${trip.shareId}` : "";
  const shareUrlFinal = shareUrlOverride || shareUrlFromBase || shareUrl;
  const categoryCounts = useMemo(
    () =>
      ["general", "travel", "fashion"].reduce((acc, category) => {
        acc[category] = trips.filter((t) => (t.type || "general") === category).length;
        return acc;
      }, {}),
    [trips]
  );

  useEffect(() => {
    if (trip?.shareId && shareUrlOverride) {
      setShareUrlOverride("");
    }
  }, [trip?.shareId, shareUrlOverride]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setSearchText(params.get("q") || "");
    setTagFilter(params.get("tag") || "");
    setMentionFilter(params.get("mention") || "");
    setDomainInclude(params.get("include") || "");
    setDomainExclude(params.get("exclude") || "");
    setFileType(params.get("type") || "all");
    setGroupByDomain(params.get("group") === "1");
    setShowDuplicates(params.get("dupes") === "1");
    const storedView = window.localStorage.getItem("collectionViewMode");
    if (storedView === "list" || storedView === "compare") {
      setViewMode(storedView);
    }
    const storedCompact = window.localStorage.getItem("collectionCompactMode");
    setCompactMode(storedCompact === "1");
  }, [id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(location.search);
    const focusGroup = params.get("focusGroup");
    if (!focusGroup) return;
    setFocusGroupId(focusGroup);
    const target = document.getElementById(`decision-group-${focusGroup}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightGroupId(focusGroup);
    setTimeout(() => setHighlightGroupId(""), 1500);
  }, [location.search]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("collectionViewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("collectionCompactMode", compactMode ? "1" : "0");
  }, [compactMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (searchText.trim()) params.set("q", searchText.trim());
    if (tagFilter.trim()) params.set("tag", tagFilter.trim());
    if (mentionFilter.trim()) params.set("mention", mentionFilter.trim());
    if (domainInclude.trim()) params.set("include", domainInclude.trim());
    if (domainExclude.trim()) params.set("exclude", domainExclude.trim());
    if (fileType !== "all") params.set("type", fileType);
    if (groupByDomain) params.set("group", "1");
    if (showDuplicates) params.set("dupes", "1");
    const next = params.toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ""}`;
    window.history.replaceState({}, "", url);
  }, [
    searchText,
    tagFilter,
    mentionFilter,
    domainInclude,
    domainExclude,
    fileType,
    groupByDomain,
    showDuplicates,
  ]);

  useEffect(() => {
    function handleDocumentClick(event) {
      const target = event.target;
      if (target && target.closest(".itemMenuWrap")) return;
      setItemMenuOpenId("");
      if (target && (target.closest(".note") || target.closest(".noteToggle"))) return;
      if (expandedNotes.size > 0) {
        setExpandedNotes(new Set());
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [expandedNotes.size]);

  useEffect(() => {
    const enableCompare = viewMode === "compare";
    setCompareEnabled(enableCompare);
    if (!enableCompare) {
      setCompareSelected(new Set());
      setCompareMode(false);
    }
  }, [viewMode]);
  const sortedItems = useMemo(() => {
    if (!trip?.items) return [];
    const items = [...trip.items];

    return items.sort((a, b) => {
      const aPinned = !!a.pinned;
      const bPinned = !!b.pinned;
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      if (sortMode === "oldest") {
        return (a.addedAt || 0) - (b.addedAt || 0);
      }

      if (sortMode === "notes") {
        const aHas = (a.note || "").trim().length > 0;
        const bHas = (b.note || "").trim().length > 0;
        if (aHas !== bHas) return aHas ? -1 : 1;
        return (b.addedAt || 0) - (a.addedAt || 0);
      }

      return (b.addedAt || 0) - (a.addedAt || 0);
    });
  }, [trip, sortMode]);

  const filteredState = useMemo(() => {
    const query = normalizeText(searchText);
    const includeList = parseDomainList(domainInclude).map((item) => item.toLowerCase());
    const excludeList = parseDomainList(domainExclude).map((item) => item.toLowerCase());
    const tagQuery = normalizeText(tagFilter);
    const mentionQuery = normalizeText(mentionFilter);

    let filtered = sortedItems.filter((item) => {
      const title = normalizeText(item.title || "");
      const url = normalizeText(item.airbnbUrl || "");
      const domain = normalizeText(item.domain || getDomain(item.airbnbUrl));
      const note = normalizeText(item.note || "");
      const matchesQuery =
        !query ||
        title.includes(query) ||
        url.includes(query) ||
        domain.includes(query) ||
        note.includes(query);
      if (!matchesQuery) return false;
      if (includeList.length > 0 && !includeList.includes(domain)) return false;
      if (excludeList.length > 0 && excludeList.includes(domain)) return false;
      if (fileType !== "all" && getFileTypeFromUrl(item.airbnbUrl) !== fileType) return false;
      if (tagQuery) {
        const tags = extractTags(item.note || "");
        if (!tags.includes(tagQuery)) return false;
      }
      if (mentionQuery) {
        const mentions = extractMentions(item.note || "");
        if (!mentions.includes(mentionQuery)) return false;
      }
      return true;
    });

    let duplicateCount = 0;
    const seen = new Set();
    const deduped = [];
    for (const item of filtered) {
      const key = item.airbnbUrl || item.id;
      if (seen.has(key)) {
        duplicateCount += 1;
        if (showDuplicates) {
          deduped.push(item);
        }
      } else {
        seen.add(key);
        deduped.push(item);
      }
    }

    return { items: deduped, duplicateCount, total: filtered.length };
  }, [
    sortedItems,
    searchText,
    domainInclude,
    domainExclude,
    fileType,
    tagFilter,
    mentionFilter,
    showDuplicates,
  ]);

  const filteredItems = filteredState.items;
  const duplicateCount = filteredState.duplicateCount;
  const focusItems = useMemo(() => {
    if (!focusGroupId || !trip?.items) return [];
    return trip.items.filter(
      (item) => item.decisionGroupId === focusGroupId && !item.dismissed
    );
  }, [focusGroupId, trip]);

  const compareItems = useMemo(() => {
    if (!filteredItems.length || compareSelected.size === 0) return [];
    return filteredItems.filter((item) => compareSelected.has(item.id));
  }, [filteredItems, compareSelected]);

  const groupedItems = useMemo(() => {
    if (!groupByDomain) return [];
    const groups = [];
    const map = new Map();
    filteredItems.forEach((item) => {
      const domain = item.domain || getDomain(item.airbnbUrl) || "Unknown domain";
      if (!map.has(domain)) {
        const group = { domain, items: [] };
        map.set(domain, group);
        groups.push(group);
      }
      map.get(domain).items.push(item);
    });
    return groups;
  }, [filteredItems, groupByDomain]);

  const decisionGroups = useMemo(() => {
    if (!trip?.items?.length) return [];
    const map = new Map();
    for (const item of trip.items) {
      if (!item.decisionGroupId) continue;
      if (!map.has(item.decisionGroupId)) {
        map.set(item.decisionGroupId, { id: item.decisionGroupId, items: [] });
      }
      map.get(item.decisionGroupId).items.push(item);
    }
    const groups = Array.from(map.values()).filter((group) => {
      const activeCount = group.items.filter((item) => !item.dismissed).length;
      return activeCount >= 2 && activeCount <= 5;
    });
    groups.sort((a, b) => {
      const aTime = Math.max(
        ...a.items.map((item) => item.lastOpenedAt || item.addedAt || 0),
        0
      );
      const bTime = Math.max(
        ...b.items.map((item) => item.lastOpenedAt || item.addedAt || 0),
        0
      );
      return bTime - aTime;
    });
    return groups;
  }, [trip]);

  const momentumGroups = useMemo(() => {
    return decisionGroups.filter((group) => {
      const activeItems = group.items.filter((item) => !item.dismissed);
      if (activeItems.length < 2) return false;
      return activeItems.some((item) => (item.openCount || 0) >= 2 || item.shortlisted);
    });
  }, [decisionGroups]);

  const orderedDecisionGroups = useMemo(() => {
    if (!decisionGroups.length) return [];
    const momentumIds = new Set(momentumGroups.map((group) => group.id));
    const nonMomentum = decisionGroups.filter((group) => !momentumIds.has(group.id));
    return [...momentumGroups, ...nonMomentum];
  }, [decisionGroups, momentumGroups]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (momentumGroups.length === 0) return;
    if (!comparisonTrackedRef.current.shown) {
      comparisonTrackedRef.current.shown = true;
      trackEvent("comparison_group_shown");
    }
    const seen = localStorage.getItem("stash_seen_comparison_explainer") === "true";
    if (!seen && !comparisonTrackedRef.current.explainer) {
      comparisonTrackedRef.current.explainer = true;
      setShowComparisonExplainer(true);
      trackEvent("comparison_explainer_shown");
    }
  }, [momentumGroups.length]);

  const hasActiveFilters =
    !!searchText.trim() ||
    !!tagFilter.trim() ||
    !!mentionFilter.trim() ||
    !!domainInclude.trim() ||
    !!domainExclude.trim() ||
    fileType !== "all";
  const visibleDecisionGroups = showAllComparisons
    ? orderedDecisionGroups
    : orderedDecisionGroups.slice(0, 2);
  const hasHiddenDecisionGroups = orderedDecisionGroups.length > 2;

  function isStaleItem(item) {
    const now = Date.now();
    const addedAt = item.addedAt || 0;
    const lastOpenedAt = item.lastOpenedAt || 0;
    if (lastOpenedAt > 0) {
      return now - lastOpenedAt > STALE_MS;
    }
    if (addedAt > 0) {
      return now - addedAt > STALE_MS;
    }
    return false;
  }

  async function getAccessToken() {
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "";
    if (!supabaseUrl) return { supabaseUrl: "", accessToken: "" };
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || "";
    return { supabaseUrl, accessToken };
  }

  async function trackEvent(eventName, payload = {}) {
    const { supabaseUrl, accessToken } = await getAccessToken();
    if (!supabaseUrl || !accessToken) return;
    try {
      await fetch(`${supabaseUrl}/functions/v1/track-event`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_name: eventName, payload }),
      });
    } catch {
      // ignore
    }
  }

  function markExplainerSeen() {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("stash_seen_comparison_explainer") === "true") return;
    localStorage.setItem("stash_seen_comparison_explainer", "true");
    setShowComparisonExplainer(false);
    trackEvent("comparison_explainer_dismissed");
  }

  async function resolveDecisionGroup(groupId) {
    const { supabaseUrl, accessToken } = await getAccessToken();
    if (!supabaseUrl || !accessToken || !trip?.id || !groupId) return;
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/decision-group-resolve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ collectionId: trip.id, decisionGroupId: groupId }),
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.status === "candidate_chosen") {
        setCandidateByGroup((prev) => ({ ...prev, [groupId]: payload.linkId }));
      } else if (payload?.status === "chosen") {
        setCandidateByGroup((prev) => ({ ...prev, [groupId]: null }));
        if (payload?.linkId) {
          updateItemEngagement(trip.id, payload.linkId, { chosen: true });
        }
      } else {
        setCandidateByGroup((prev) => ({ ...prev, [groupId]: null }));
      }
    } catch {
      // ignore resolution failures
    }
  }

  async function setLinkFlags(item, flags, groupId) {
    const { supabaseUrl, accessToken } = await getAccessToken();
    if (!supabaseUrl || !accessToken || !item?.id) return;
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/link-set-flags`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ linkId: item.id, ...flags }),
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.id) {
        updateItemEngagement(trip.id, item.id, {
          shortlisted: payload.shortlisted,
          dismissed: payload.dismissed,
          chosen: payload.chosen,
        });
      }
      if (groupId) {
        resolveDecisionGroup(groupId);
      }
    } catch {
      // ignore flag failures
    }
  }

  async function markChosen(linkId, groupId) {
    const { supabaseUrl, accessToken } = await getAccessToken();
    if (!supabaseUrl || !accessToken || !linkId) return;
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/mark-chosen`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ linkId }),
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.id) {
        updateItemEngagement(trip.id, payload.id, { chosen: true });
        setCandidateByGroup((prev) => ({ ...prev, [groupId]: null }));
      }
    } catch {
      // ignore
    }
  }

  async function archiveDecisionGroupOthers(groupId, chosenLinkId) {
    const { supabaseUrl, accessToken } = await getAccessToken();
    if (!supabaseUrl || !accessToken || !trip?.id) return;
    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/archive-decision-group-others`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            collectionId: trip.id,
            decisionGroupId: groupId,
            chosenLinkId,
          }),
        }
      );
      if (!response.ok) return;
      updateItemEngagement(trip.id, chosenLinkId, { dismissed: false });
      setInlineToastMessage("Archived the rest");
    } catch {
      // ignore
    }
  }

  async function handleOpenItem(item) {
    if (!item?.airbnbUrl) return;
    markExplainerSeen();
    const { supabaseUrl, accessToken } = await getAccessToken();

    if (supabaseUrl && accessToken && item.id) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/link-open`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ linkId: item.id }),
        });

        if (response.ok) {
          const payload = await response.json();
          updateItemEngagement(trip.id, item.id, {
            openCount:
              payload?.open_count != null ? payload.open_count : (item.openCount || 0) + 1,
            lastOpenedAt: payload?.last_opened_at
              ? new Date(payload.last_opened_at).getTime()
              : Date.now(),
          });
        } else {
          updateItemEngagement(trip.id, item.id, {
            openCount: (item.openCount || 0) + 1,
            lastOpenedAt: Date.now(),
          });
        }
      } catch {
        updateItemEngagement(trip.id, item.id, {
          openCount: (item.openCount || 0) + 1,
          lastOpenedAt: Date.now(),
        });
      }
    }

    window.open(item.airbnbUrl, "_blank", "noopener,noreferrer");
    trackEvent("link_opened", { linkId: item.id, collectionId: trip?.id });
  }

  function shouldShowNudge(group) {
    const now = Date.now();
    const hasRepeatOpens = group.items.some((item) => (item.openCount || 0) >= 2);
    if (!hasRepeatOpens) return false;
    const groupRecent = group.items.every((item) => {
      if (!item.addedAt) return false;
      return now - item.addedAt <= 30 * DAY_MS;
    });
    if (!groupRecent) return false;
    const maxOpenedAt = Math.max(...group.items.map((item) => item.lastOpenedAt || 0), 0);
    if (!maxOpenedAt) return false;
    return now - maxOpenedAt > 7 * DAY_MS;
  }

  function handleReviewGroup(groupId) {
    markExplainerSeen();
    const target = document.getElementById(`decision-group-${groupId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightGroupId(groupId);
    setTimeout(() => setHighlightGroupId(""), 1500);
  }

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

  function toggleCompareItem(itemId) {
    setCompareSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else if (next.size < 4) {
        next.add(itemId);
      } else {
        setCompareNotice("You can compare up to 4 links.");
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

  function setInlineErrorMessage(message) {
    setInlineError(message);
    setTimeout(() => setInlineError(""), 2500);
  }

  function setInlineToastMessage(message) {
    setInlineToast(message);
    setTimeout(() => setInlineToast(""), 1500);
  }

  function toggleNoteExpanded(itemId, expanded) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (expanded) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  }

  function clearFilters() {
    setSearchText("");
    setDomainInclude("");
    setDomainExclude("");
    setFileType("all");
    setTagFilter("");
    setMentionFilter("");
  }

  function handleSegmentKey(event) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll("button[role=\"tab\"]"));
    const currentIndex = buttons.indexOf(event.target);
    if (currentIndex === -1) return;
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + delta + buttons.length) % buttons.length;
    buttons[nextIndex].focus();
    buttons[nextIndex].click();
  }

  function renderNoteArea(item) {
    const noteValue = item.note || "";
    const isExpanded = expandedNotes.has(item.id);
    if (isExpanded) {
      return (
        <textarea
          className={`note ${compactMode ? "compact" : ""}`}
          placeholder="Add a note (e.g. 'near beach', 'sleeps 8', 'from @creator')..."
          value={noteValue}
          onChange={(e) => updateItemNote(trip.id, item.id, e.target.value)}
          onBlur={() => toggleNoteExpanded(item.id, false)}
        />
      );
    }

    return (
      <button
        className={`noteToggle ${compactMode ? "compact" : ""}`}
        type="button"
        onClick={() => toggleNoteExpanded(item.id, true)}
        aria-label={noteValue.trim() ? "Edit note" : "Add note"}
      >
        <IconNote className="noteIcon" />
        <span className="noteToggleText">{noteValue.trim() || "Add note…"}</span>
      </button>
    );
  }

  function clearCompareSelection() {
    setCompareSelected(new Set());
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
          text: `${trip.name} ${collectionShareLabel}`,
          url: targetUrl,
        });
        return;
      } catch {
        return;
      }
    }
    setShareOpen((v) => !v);
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

  async function openItemShare(item) {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title || "Saved link",
          url: item.airbnbUrl,
        });
        setItemMenuOpenId("");
        return;
      } catch {
        // fall back to modal
      }
    }
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

  async function handleCopyItemUrl(item) {
    if (!item?.airbnbUrl) return;
    try {
      await navigator.clipboard.writeText(item.airbnbUrl);
    } catch {
      setInlineErrorMessage("Couldn’t copy link. Try again.");
    }
  }

  async function handleSystemShare() {
    if (!shareUrlFinal || !navigator.share) return;
    try {
      await navigator.share({
        title: trip?.name,
        text: `${trip?.name || "Collection"} ${collectionShareLabel}`,
        url: shareUrlFinal,
      });
      setShareOpen(false);
    } catch {
      // keep modal open if cancelled
    }
  }

  function renderListCard(item) {
    const titleParts = splitTitleParts(item.title, item.airbnbUrl);
    const { rating, chips } = splitMetaParts(titleParts.meta);
    const metadataChips = buildMetadataChips(item.metadata);
    const domainLabel = item.domain || getDomain(item.airbnbUrl);
    const fallbackMeta =
      item.airbnbUrl && item.airbnbUrl.includes("airbnb.")
        ? extractAirbnbMetaFromTitle(item.title)
        : { rating: "", chips: [] };
    const allChips = mergeMetaChips(chips, metadataChips, fallbackMeta.chips);
    const tags = extractTags(item.note || "");
    const mentions = extractMentions(item.note || "");
    const isSelected = compareSelected.has(item.id);
    const disableSelect = compareSelected.size >= 4 && !isSelected;
    const isStale = isStaleItem(item);
    const action = normalizePrimaryAction(item.primaryAction);
    const actionLabel = primaryActionLabel(action);
    const isChosen = !!item.chosen;

    return (
      <div
        key={item.id}
        className={`itemCard ${item.pinned ? "pinned" : ""} ${
          compactMode ? "compact" : ""
        } ${isStale ? "stale" : ""} ${itemMenuOpenId === item.id ? "menuOpen" : ""}`}
      >
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
          <div className="itemHeaderRow">
            <div className="itemTitleBlock">
              {editingId === item.id ? (
                <input
                  className="titleInput"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveEditTitle(item);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelEditTitle();
                    }
                  }}
                />
              ) : (
                <>
                  <div className="itemTitleRow">
                    <button
                      className="itemTitleLink titleClampFade"
                      type="button"
                      onClick={() => handleOpenItem(item)}
                      title={titleParts.main}
                    >
                      {titleParts.main}
                    </button>
                    {isChosen && <span className="chosenPill">Chosen</span>}
                    {domainLabel && <span className="domainPill">{domainLabel}</span>}
                    {(rating || fallbackMeta.rating) && (
                      <span className="ratingPill">⭐ {rating || fallbackMeta.rating}</span>
                    )}
                  </div>
                  {allChips.length > 0 && (
                    <div className="itemMetaRow">
                      <div className="metaChips">
                        {allChips.map((part) => (
                          <span key={part} className="metaChip">
                            {part}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(tags.length > 0 || mentions.length > 0) && (
                    <div className="tagRow">
                      {tags.map((tag) => (
                        <button
                          key={tag}
                          className={`tagPill ${tagFilter === tag ? "active" : ""}`}
                          type="button"
                          onClick={() => {
                            setTagFilter(tag);
                            setFilterOpen(true);
                          }}
                        >
                          #{tag}
                        </button>
                      ))}
                      {mentions.map((mention) => (
                        <button
                          key={mention}
                          className={`tagPill mentionPill ${mentionFilter === mention ? "active" : ""}`}
                          type="button"
                          onClick={() => {
                            setMentionFilter(mention);
                            setFilterOpen(true);
                          }}
                        >
                          @{mention}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="itemActions itemActionsTop">
              {item.pinned && (
                <span className="itemPinInline" aria-hidden="true">
                  <img className="itemPinIcon" src={pinIcon} alt="" />
                </span>
              )}
              <button
                className={`primaryActionBtn ${isStale ? "stale" : ""}`}
                type="button"
                onClick={() => handleOpenItem(item)}
              >
                {actionLabel}
              </button>
              {editingId === item.id ? (
                <div className="itemSecondaryActions">
                  <button className="miniBtn" type="button" onClick={() => saveEditTitle(item)}>
                    Save
                  </button>
                  <button className="miniBtn" type="button" onClick={cancelEditTitle}>
                    Cancel
                  </button>
                </div>
              ) : null}
              <div className="itemMenuWrap">
                <button
                  className="itemMenuBtn"
                  type="button"
                  aria-label="Link options"
                  onClick={() =>
                    setItemMenuOpenId((prev) => (prev === item.id ? "" : item.id))
                  }
                >
                  ⋯
                </button>
                {itemMenuOpenId === item.id && (
                  <div className="itemMenu" role="menu">
                    {editingId !== item.id && (
                      <button className="itemMenuItem" type="button" onClick={() => startEditTitle(item)}>
                        Edit
                      </button>
                    )}
                    <button className="itemMenuItem" type="button" onClick={() => openItemShare(item)}>
                      Share
                    </button>
                    <button
                      className="itemMenuItem"
                      type="button"
                      onClick={() => {
                        toggleItemPinned(trip.id, item.id, !item.pinned);
                        setItemMenuOpenId("");
                      }}
                    >
                      {item.pinned ? "Unpin" : "Pin"}
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
        </div>

        {renderNoteArea(item)}

        {item.sourceText && (
          <div className="source">
            <span className="sourceLabel">Source:</span> {item.sourceText}
          </div>
        )}
      </div>
    );
  }


  if (!user && !loading) {
    return (
      <div className="page tripsPage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
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
              title="Collection"
              subtitle="Sign in to view and edit your collections."
              searchValue={searchText}
              onSearchChange={setSearchText}
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
          <div className="panel p-5">
            <p className="muted">Sign in to view and edit your collections.</p>
            <LoginForm />
          </div>
        </AppShell>
      </div>
    );
  }

  // If trip doesn't exist (bad URL / deleted), show a friendly message
  if (!trip) {
    return (
      <div className="page tripsPage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
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
              title="Collection"
              subtitle="That collection doesn’t exist."
              searchValue={searchText}
              onSearchChange={setSearchText}
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
          <div className="panel p-5">
            <p className="muted">That collection doesn’t exist (it may have been deleted).</p>
            <div className="navRow">
              <Link
                className="miniBtn linkBtn"
                to={trip?.type ? `/trips?category=${trip.type}` : "/trips"}
              >
                ← Back to Collections
              </Link>
            </div>
          </div>
        </AppShell>
      </div>
    );
  }

  return (
    <div className="page tripsPage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
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
            title={trip?.name || "Collection"}
            subtitle={collectionSubtitle}
            searchValue={searchText}
            onSearchChange={setSearchText}
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
        <div className="detailCollectionCard">
        <CollectionCoverHeader
          trip={trip}
          onShare={handleToggleShare}
          showShare={hasItems}
        />

        <div className="detailCollectionBody">
          <div className={`detailHeader hasCover ${focusGroupId ? "focusOnly" : ""}`}>
            <div className="detailHeaderBar">
            <Link
              className="miniBtn linkBtn"
              to={trip?.type ? `/trips?category=${trip.type}` : "/trips"}
            >
              ← Collections
            </Link>
            </div>

            <div className="detailCoverBody">
              <div className="detailCoverTitle">{trip?.name}</div>
              <div className="detailCoverSubtitle">{collectionSubtitle}</div>
              <div className="detailCoverMeta">
                {linkCount} link{linkCount === 1 ? "" : "s"} · Updated {updatedAt} ·{" "}
                {collectionSubtitle}
              </div>
              {(trip.shareId || trip.isShared) && trip.ownerDisplayName && (
                <div className="sharedByLine">
                  Shared by {formatSharedBy(trip.ownerDisplayName)}
                </div>
              )}
            </div>

            <div className="detailSectionDivider" />

            <div className="detailHeaderActions">
            <div className="detailToolbar">
              <div className="toolbarLeft">
                <div className={`sortRow inline ${focusGroupId ? "focusOnly" : ""}`}>
                  <Dropdown
                    id="sortItems"
                    className="sortDropdown"
                    value={sortMode}
                    onChange={setSortMode}
                    options={[
                      { value: "newest", label: "Newest first" },
                      { value: "oldest", label: "Oldest first" },
                      { value: "notes", label: "Notes first" },
                    ]}
                    ariaLabel="Sort items"
                  />
                </div>
              </div>

              <div className="toolbarRight" />
            </div>

            <div className={`filterRow ${focusGroupId ? "focusOnly" : ""}`}>
              <div className="searchWrap">
                <input
                  className="input searchInput"
                  type="search"
                  placeholder="Search title, URL, domain, notes"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  aria-label="Search collection"
                />
                {searchText && (
                  <button className="miniBtn ghostBtn" type="button" onClick={() => setSearchText("")}>
                    Clear
                  </button>
                )}
              </div>
              <button
                className={`miniBtn ${filterOpen ? "active" : ""}`}
                type="button"
                onClick={() => setFilterOpen((v) => !v)}
                aria-expanded={filterOpen}
                aria-controls="collectionFilters"
              >
                Filters
              </button>
              {(tagFilter || mentionFilter) && (
                <button
                  className="miniBtn"
                  type="button"
                  onClick={() => {
                    setTagFilter("");
                    setMentionFilter("");
                  }}
                >
                  Clear tag
                </button>
              )}
            </div>

            {filterOpen && (
              <div className="filterPanel" id="collectionFilters">
                <div className="filterGroup">
                  <label className="filterLabel" htmlFor="includeDomains">
                    Include domains
                  </label>
                  <input
                    id="includeDomains"
                    className="input filterInput"
                    placeholder="airbnb.com, nytimes.com"
                    value={domainInclude}
                    onChange={(e) => setDomainInclude(e.target.value)}
                  />
                </div>
                <div className="filterGroup">
                  <label className="filterLabel" htmlFor="excludeDomains">
                    Exclude domains
                  </label>
                  <input
                    id="excludeDomains"
                    className="input filterInput"
                    placeholder="spam.com, tiktok.com"
                    value={domainExclude}
                    onChange={(e) => setDomainExclude(e.target.value)}
                  />
                </div>
                <div className="filterGroup">
                  <label className="filterLabel" htmlFor="fileType">
                    File type
                  </label>
                  <select
                    id="fileType"
                    className="select filterSelect"
                    value={fileType}
                    onChange={(e) => setFileType(e.target.value)}
                  >
                    <option value="all">All types</option>
                    <option value="pdf">PDF</option>
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                    <option value="doc">Doc</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="filterToggles">
                  <label className="miniToggle">
                    <span>Compact mode</span>
                    <span className="switch">
                      <input
                        type="checkbox"
                        checked={compactMode}
                        onChange={() => setCompactMode((prev) => !prev)}
                      />
                      <span className="slider" />
                    </span>
                  </label>
                  <label className="miniToggle">
                    <span>Group by domain</span>
                    <span className="switch">
                      <input
                        type="checkbox"
                        checked={groupByDomain}
                        onChange={() => setGroupByDomain((prev) => !prev)}
                      />
                      <span className="slider" />
                    </span>
                  </label>
                </div>
                {hasActiveFilters && (
                  <button className="miniBtn" type="button" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            )}
            </div>
          </div>
          <div className="detailSectionDivider" />
          <div className="detailCardContent">
          {inlineError && (
            <div className="inlineError" role="status">
              {inlineError}
            </div>
          )}
          {inlineToast && (
            <div className="inlineToast" role="status">
              {inlineToast}
            </div>
          )}
          {focusGroupId && (
            <div className="focusBanner">
              <div>
                Showing this comparison group only.
              </div>
              <button
                className="miniBtn ghostBtn"
                type="button"
                onClick={() => {
                  setFocusGroupId("");
                  window.history.replaceState({}, "", window.location.pathname);
                }}
              >
                Show all
              </button>
            </div>
          )}

          {trip.items.length === 0 ? (
            <div className="emptyState">
              <div className="emptyTitle">Nothing here yet — stash something.</div>
              <div className="emptyText">
                Save your first link to this collection.
              </div>
            </div>
          ) : (focusGroupId ? focusItems.length === 0 : filteredItems.length === 0) ? (
            <div className="emptyState">
              <div className="emptyTitle">Nothing found</div>
              <div className="emptyText">
                Try another search or clear filters.
              </div>
              {hasActiveFilters && (
                <button className="miniBtn" type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className={`itemList ${compactMode ? "compact" : ""}`}>
              {!compareMode && orderedDecisionGroups.length > 0 && (
                <div className="decisionSection">
                  <div className="decisionHeader">
                    <div className="decisionTitle">You're comparing these</div>
                    {hasHiddenDecisionGroups && (
                      <button
                        className="miniBtn ghostBtn"
                        type="button"
                        onClick={() => setShowAllComparisons((prev) => !prev)}
                      >
                        {showAllComparisons ? "Hide extra groups" : "View all comparisons"}
                      </button>
                    )}
                  </div>
                  {showComparisonExplainer && (
                    <div className="decisionExplainer">
                      Grouped automatically — looks like you're deciding between these.
                    </div>
                  )}
                  <div className="decisionGroups">
                    {visibleDecisionGroups.map((group) => {
                      const activeItems = group.items.filter((item) => !item.dismissed);
                      if (activeItems.length < 2) {
                        return null;
                      }
                      const shortlistedItems = activeItems.filter((item) => item.shortlisted);
                      const dismissedCount = group.items.filter((item) => item.dismissed).length;
                      const chosenItems = activeItems.filter((item) => item.chosen);
                      const bannerDismissed = bannerDismissedGroupIds.has(group.id);
                      const showDecisionBanner = chosenItems.length > 0 && !bannerDismissed;
                      const chosenLink = chosenItems[0];
                      const reviewOnly = reviewOnlyGroupIds.has(group.id);
                      const showingItems =
                        reviewOnly && shortlistedItems.length > 0 ? shortlistedItems : activeItems;
                      const showFooter = shortlistedItems.length > 0 || dismissedCount > 0;
                      const showNudge = shouldShowNudge({ ...group, items: activeItems });
                      const candidateLinkId = candidateByGroup[group.id];
                      return (
                        <div
                          key={group.id}
                          id={`decision-group-${group.id}`}
                          className={`decisionGroup ${
                            highlightGroupId === group.id ? "highlight" : ""
                          }`}
                        >
                          {showNudge && (
                            <div className="decisionNudge">
                              <span>Still deciding?</span>
                              <button
                                className="miniBtn ghostBtn"
                                type="button"
                                onClick={() => handleReviewGroup(group.id)}
                              >
                                Review
                              </button>
                            </div>
                          )}
                          {showDecisionBanner && (
                            <div className="decisionBanner">
                              <div>
                                <div className="decisionBannerTitle">Decision made</div>
                                <div className="decisionBannerSubtitle">Marked as chosen.</div>
                              </div>
                              <div className="decisionBannerActions">
                                {activeItems.length > 1 && chosenLink && (
                                  <button
                                    className="miniBtn ghostBtn"
                                    type="button"
                                    onClick={() => {
                                      trackEvent("archive_rest_clicked", {
                                        decisionGroupId: group.id,
                                        collectionId: trip.id,
                                      });
                                      activeItems.forEach((item) => {
                                        if (item.id === chosenLink.id) return;
                                        updateItemEngagement(trip.id, item.id, {
                                          dismissed: true,
                                          shortlisted: false,
                                        });
                                      });
                                      archiveDecisionGroupOthers(group.id, chosenLink.id);
                                    }}
                                  >
                                    Archive the rest
                                  </button>
                                )}
                                <button
                                  className="miniBtn ghostBtn"
                                  type="button"
                                  onClick={() =>
                                    setBannerDismissedGroupIds((prev) => {
                                      const next = new Set(prev);
                                      next.add(group.id);
                                      return next;
                                    })
                                  }
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="decisionRow">
                            {showingItems.map((item) => {
                              const titleParts = splitTitleParts(item.title, item.airbnbUrl);
                              const domainLabel = item.domain || getDomain(item.airbnbUrl);
                              const action = normalizePrimaryAction(item.primaryAction);
                              const actionLabel = primaryActionLabel(action);
                              const isStale = isStaleItem(item);
                              const isChosen = !!item.chosen;
                              const isShortlisted = !!item.shortlisted;
                              return (
                                <div
                                  key={item.id}
                                  className={`decisionItem ${isStale ? "stale" : ""} ${
                                    isShortlisted ? "shortlisted" : ""
                                  }`}
                                >
                                  <div className="decisionActions">
                                    <button
                                      className={`shortlistBtn ${isShortlisted ? "active" : ""}`}
                                      type="button"
                                      title={isShortlisted ? "Remove from shortlist" : "Shortlist"}
                                      onClick={() => {
                                        const next = !isShortlisted;
                                        markExplainerSeen();
                                        updateItemEngagement(trip.id, item.id, {
                                          shortlisted: next,
                                          dismissed: false,
                                        });
                                        setInlineToastMessage(next ? "Shortlisted" : "Removed from shortlist");
                                        trackEvent("shortlist_toggled", {
                                          linkId: item.id,
                                          decisionGroupId: group.id,
                                          collectionId: trip.id,
                                          newState: next,
                                        });
                                        setLinkFlags(item, { shortlisted: next, dismissed: false }, group.id);
                                      }}
                                    >
                                      {isShortlisted ? "★" : "☆"}
                                    </button>
                                    <button
                                      className="dismissBtn"
                                      type="button"
                                      title="Dismiss"
                                      onClick={() => {
                                        markExplainerSeen();
                                        updateItemEngagement(trip.id, item.id, {
                                          shortlisted: false,
                                          dismissed: true,
                                        });
                                        setInlineToastMessage("Dismissed");
                                        setLinkFlags(item, { dismissed: true }, group.id);
                                      }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                  <button
                                    className="decisionTitleText"
                                    type="button"
                                    onClick={() => handleOpenItem(item)}
                                    title={titleParts.main}
                                  >
                                    {titleParts.main}
                                  </button>
                                  <div className="decisionMeta">
                                    {domainLabel && (
                                      <span className="domainPill small">{domainLabel}</span>
                                    )}
                                    {isChosen && <span className="chosenPill">Chosen</span>}
                                  </div>
                                  <button
                                    className={`primaryActionBtn mini ${
                                      isStale ? "stale" : ""
                                    }`}
                                    type="button"
                                    onClick={() => handleOpenItem(item)}
                                  >
                                    {actionLabel}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          {showFooter && (
                            <div className="decisionFooter">
                              <div className="decisionFooterText">
                                Shortlisted {shortlistedItems.length} of {activeItems.length}
                              </div>
                              <div className="decisionFooterActions">
                                <button
                                  className="miniBtn ghostBtn"
                                  type="button"
                                  onClick={() =>
                                    setReviewOnlyGroupIds((prev) => {
                                      markExplainerSeen();
                                      if (!prev.has(group.id)) {
                                        trackEvent("review_shortlist_clicked", {
                                          decisionGroupId: group.id,
                                          collectionId: trip.id,
                                        });
                                      }
                                      const next = new Set(prev);
                                      if (next.has(group.id)) {
                                        next.delete(group.id);
                                      } else {
                                        next.add(group.id);
                                      }
                                      return next;
                                    })
                                  }
                                  disabled={shortlistedItems.length === 0}
                                >
                                  {reviewOnly ? "Show all" : "Review shortlist"}
                                </button>
                                {candidateLinkId && (
                                  <button
                                    className="miniBtn ghostBtn"
                                    type="button"
                                    onClick={() => {
                                      markExplainerSeen();
                                      trackEvent("mark_chosen_clicked", {
                                        linkId: candidateLinkId,
                                        decisionGroupId: group.id,
                                        collectionId: trip.id,
                                      });
                                      markChosen(candidateLinkId, group.id);
                                    }}
                                  >
                                    Mark chosen
                                  </button>
                                )}
                              </div>
                              {candidateLinkId && (
                                <div className="decisionFooterHint">Looks like you've got a winner.</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {duplicateCount > 0 && (
                <div className="dupeNotice">
                  <span>
                    {duplicateCount} duplicate{duplicateCount === 1 ? "" : "s"}{" "}
                    {showDuplicates ? "shown" : "hidden"}.
                  </span>
                  <button
                    className="miniBtn"
                    type="button"
                    onClick={() => setShowDuplicates((prev) => !prev)}
                  >
                    {showDuplicates ? "Hide duplicates" : "Show duplicates"}
                  </button>
                </div>
              )}

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
                      const metadataChips = buildMetadataChips(item.metadata);
                      const domainLabel = item.domain || getDomain(item.airbnbUrl);
                      const tags = extractTags(item.note || "");
                      const mentions = extractMentions(item.note || "");
                      const fallbackMeta =
                        item.airbnbUrl && item.airbnbUrl.includes("airbnb.")
                          ? extractAirbnbMetaFromTitle(item.title)
                          : { rating: "", chips: [] };
                      const displayChips = mergeMetaChips(
                        titleParts.meta,
                        metadataChips,
                        fallbackMeta.chips
                      );
                      const isStale = isStaleItem(item);
                      const action = normalizePrimaryAction(item.primaryAction);
                      const actionLabel = primaryActionLabel(action);
                      const isChosen = !!item.chosen;
                      return (
                        <div
                          key={item.id}
                          className={`itemCard compareCard ${item.pinned ? "pinned" : ""} ${
                            isStale ? "stale" : ""
                          } ${itemMenuOpenId === item.id ? "menuOpen" : ""}`}
                        >
                          <div className="compareCardHeader">
                            <button
                              className="itemLink compareTitle titleClampFade"
                              type="button"
                              onClick={() => handleOpenItem(item)}
                              title={titleParts.main}
                            >
                              {titleParts.main}
                            </button>
                            {isChosen && <span className="chosenPill">Chosen</span>}
                            {domainLabel && <span className="domainPill">{domainLabel}</span>}

                            {(displayChips.length > 0 || tags.length > 0 || mentions.length > 0) && (
                              <div className="compareMeta">
                                {displayChips.map((part) => (
                                  <span key={part} className="chip">
                                    {part}
                                  </span>
                                ))}
                                {tags.map((tag) => (
                                  <button
                                    key={tag}
                                    className={`tagPill ${tagFilter === tag ? "active" : ""}`}
                                    type="button"
                                    onClick={() => {
                                      setTagFilter(tag);
                                      setFilterOpen(true);
                                    }}
                                  >
                                    #{tag}
                                  </button>
                                ))}
                                {mentions.map((mention) => (
                                  <button
                                    key={mention}
                                    className={`tagPill mentionPill ${mentionFilter === mention ? "active" : ""}`}
                                    type="button"
                                    onClick={() => {
                                      setMentionFilter(mention);
                                      setFilterOpen(true);
                                    }}
                                  >
                                    @{mention}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="compareActionsRow">
                            {item.pinned && (
                              <span className="itemPinInline" aria-hidden="true">
                                <img className="itemPinIcon" src={pinIcon} alt="" />
                              </span>
                            )}
                            <button
                              className={`primaryActionBtn ${isStale ? "stale" : ""}`}
                              type="button"
                              onClick={() => handleOpenItem(item)}
                            >
                              {actionLabel}
                            </button>
                            <div className="itemMenuWrap">
                              <button
                                className="itemMenuBtn"
                                type="button"
                                aria-label="Link options"
                                onClick={() =>
                                  setItemMenuOpenId((prev) => (prev === item.id ? "" : item.id))
                                }
                              >
                                ⋯
                              </button>
                              {itemMenuOpenId === item.id && (
                                <div className="itemMenu" role="menu">
                                  <button className="itemMenuItem" type="button" onClick={() => openItemShare(item)}>
                                    Share
                                  </button>
                                  <button
                                    className="itemMenuItem"
                                    type="button"
                                    onClick={() => {
                                      toggleItemPinned(trip.id, item.id, !item.pinned);
                                      setItemMenuOpenId("");
                                    }}
                                  >
                                    {item.pinned ? "Unpin" : "Pin"}
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

                          {renderNoteArea(item)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : focusGroupId ? (
                focusItems.map((item) => renderListCard(item))
              ) : groupByDomain ? (
                <div className="groupList">
                  {groupedItems.map((group) => {
                    const isCollapsed = !!collapsedDomains[group.domain];
                    return (
                      <div key={group.domain} className="domainGroup">
                        <button
                          className="domainHeader"
                          type="button"
                          onClick={() =>
                            setCollapsedDomains((prev) => ({
                              ...prev,
                              [group.domain]: !prev[group.domain],
                            }))
                          }
                          aria-expanded={!isCollapsed}
                        >
                          <span className="domainTitle">{group.domain}</span>
                          <span className="domainCount">{group.items.length}</span>
                          <span className={`domainChevron ${isCollapsed ? "collapsed" : ""}`}>
                            &gt;
                          </span>
                        </button>
                        {!isCollapsed && (
                          <div className="domainItems">
                            {group.items.map((item) => renderListCard(item))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                filteredItems.map((item) => renderListCard(item))
              )}

              {compareEnabled && !compareMode && compareSelected.size >= 2 && (
                <div className="compareBar">
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
                <div className="shareModalTitle">Share collection</div>
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
              <a
                className="secondary-btn linkBtn"
                href={`https://wa.me/?text=${encodeURIComponent(`${shareUrlFinal}`)}`}
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
                <div className="shareModalTitle">Share link</div>
                <div className="shareModalSubtitle">
                  {(itemShare.title || "").trim() || "Saved link"}
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
      </AppShell>
    </div>
  );
}
