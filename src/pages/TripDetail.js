import { Link, useNavigate, useParams } from "react-router-dom";
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

function parseMetaObject(meta) {
  if (!meta) return null;
  if (typeof meta === "object") return meta;
  try {
    return JSON.parse(String(meta));
  } catch {
    return null;
  }
}

function firstNonEmpty(values = []) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function extractImageFromMeta(meta) {
  const parsed = parseMetaObject(meta);
  if (!parsed || typeof parsed !== "object") return "";

  const direct = firstNonEmpty([
    parsed.image,
    parsed.image_url,
    parsed.imageUrl,
    parsed.preview_image,
    parsed.previewImage,
    parsed.thumbnail,
    parsed.thumbnail_url,
    parsed.thumbnailUrl,
    parsed.photo,
    parsed.photo_url,
    parsed.photoUrl,
    parsed.og_image,
    parsed.ogImage,
  ]);
  if (direct) return direct;

  if (Array.isArray(parsed.images)) {
    for (const image of parsed.images) {
      if (typeof image === "string" && image.trim()) return image.trim();
      if (image && typeof image === "object") {
        const nested = firstNonEmpty([image.url, image.src, image.image, image.image_url]);
        if (nested) return nested;
      }
    }
  }

  if (parsed.og && typeof parsed.og === "object") {
    const ogImage = firstNonEmpty([parsed.og.image, parsed.og.image_url, parsed.og.imageUrl]);
    if (ogImage) return ogImage;
  }

  return "";
}

function resolveItemPreviewImage(item = {}) {
  const direct = firstNonEmpty([item.imageUrl, item.image_url]);
  if (direct) return direct;
  const fromMeta = extractImageFromMeta(item.metadata);
  if (fromMeta) return fromMeta;
  return firstNonEmpty([item.faviconUrl, item.favicon_url]);
}

async function fetchTitleWithTimeout(endpoint, url, timeoutMs = 2600) {
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

    const previewData = await postJsonWithTimeout("/fetch-link-preview", { url }, timeoutMs + 1800);
    const previewTitle = String(previewData?.title || "").trim();
    return previewTitle || null;
  } catch {
    return null;
  }
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

function normalizeUrl(input = "") {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(raw)) return `https://${raw}`;
  return raw;
}

function getPlatform(domain = "") {
  if (!domain) return "";
  if (domain.includes("airbnb.")) return "airbnb";
  return "";
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
const ECOMMERCE_DOMAIN_HINTS = [
  "amazon.",
  "asos.",
  "nike.",
  "adidas.",
  "ebay.",
  "etsy.",
  "target.",
  "walmart.",
  "bestbuy.",
  "shopify.",
  "zara.",
  "hm.",
  "uniqlo.",
  "ssense.",
  "net-a-porter.",
  "farfetch.",
];
const TRAVEL_DOMAIN_HINTS = [
  "airbnb.",
  "booking.",
  "expedia.",
  "hotels.",
  "priceline.",
  "tripadvisor.",
  "vrbo.",
  "marriott.",
  "hilton.",
  "hyatt.",
];

function inferPrimaryAction(url = "", domain = "") {
  const cleanDomain = String(domain || "").toLowerCase();
  const cleanUrl = String(url || "").toLowerCase();

  if (
    cleanDomain.includes("youtube.com") ||
    cleanDomain.includes("youtu.be") ||
    cleanUrl.includes("/watch")
  ) {
    return "watch";
  }

  if (cleanDomain.includes("github.com")) {
    return "reference";
  }

  if (
    TRAVEL_DOMAIN_HINTS.some((entry) => cleanDomain.includes(entry)) ||
    cleanUrl.includes("/hotel") ||
    cleanUrl.includes("/hotels") ||
    cleanUrl.includes("/stay") ||
    cleanUrl.includes("/rooms")
  ) {
    return "book";
  }

  if (
    cleanUrl.includes("/product") ||
    cleanUrl.includes("/prd/") ||
    cleanUrl.includes("cart") ||
    cleanUrl.includes("checkout") ||
    ECOMMERCE_DOMAIN_HINTS.some((entry) => cleanDomain.includes(entry))
  ) {
    return "buy";
  }

  return "read";
}

function getSocialSourceAttribution(item) {
  const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const sourceType = String(metadata.source || "").toLowerCase();
  const sourceListId = metadata.source_list_id;
  const sourceHandle = String(metadata.source_owner_handle || "")
    .trim()
    .replace(/^@+/, "");
  const sourceListSlug = String(metadata.source_list_slug || "").trim();
  const sourceListTitle = String(metadata.source_list_title || "").trim();

  if (!sourceListId && sourceType !== "social_list") return null;

  const ownerLabel = sourceHandle ? `@${sourceHandle}` : "another creator";
  const listLabel = sourceListTitle || "a public list";
  const listPath = sourceHandle && sourceListSlug ? `/@${sourceHandle}/${sourceListSlug}` : "";
  const sourceKey = sourceListId || (sourceHandle && sourceListSlug ? `${sourceHandle}/${sourceListSlug}` : "");

  return { ownerLabel, listLabel, listPath, sourceKey };
}

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

function CollectionCoverHeader({
  trip,
  onShare,
  showShare,
  backTo,
  collectionSubtitle,
  updatedAt,
  linkCount,
  collectionSourceAttribution,
}) {
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
      <div className="detailCoverTopRow">
        <Link className="detailCoverBackLink" to={backTo}>
          <span aria-hidden="true">←</span>
          <span>Collections</span>
        </Link>
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
      <div className="detailCoverBody">
        <div className="detailCoverTitle">{trip?.name}</div>
        <div className="detailCoverSubtitle">{collectionSubtitle}</div>
        <div className="detailCoverMeta">
          {linkCount} link{linkCount === 1 ? "" : "s"} · Updated {updatedAt} ·{" "}
          {collectionSubtitle}
        </div>
        {collectionSourceAttribution?.type === "single" && collectionSourceAttribution.source ? (
          <div className="sourceAttributionRow collectionSourceAttribution">
            <span className="sourceAttributionLabel">From</span>
            <span className="sourceAttributionOwner">
              {collectionSourceAttribution.source.ownerLabel}
            </span>
            <span className="sourceAttributionDivider">•</span>
            {collectionSourceAttribution.source.listPath ? (
              <Link className="sourceAttributionLink" to={collectionSourceAttribution.source.listPath}>
                {collectionSourceAttribution.source.listLabel}
              </Link>
            ) : (
              <span className="sourceAttributionText">
                {collectionSourceAttribution.source.listLabel}
              </span>
            )}
          </div>
        ) : null}
        {collectionSourceAttribution?.type === "multiple" ? (
          <div className="sourceAttributionRow collectionSourceAttribution">
            <span className="sourceAttributionLabel">From</span>
            <span className="sourceAttributionText">
              {collectionSourceAttribution.count} public lists
            </span>
          </div>
        ) : null}
        {(trip?.shareId || trip?.isShared) && trip?.ownerDisplayName && (
          <div className="sharedByLine">
            Shared by {formatSharedBy(trip.ownerDisplayName)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TripDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    trips,
    tripsById,
    removeItem,
    updateItemNote,
    updateItemTitle,
    updateItemEngagement,
    updateTripState,
    enableShare,
    toggleItemPinned,
    addItemToTrip,
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
  const [decisionMode, setDecisionMode] = useState("normal");
  const [pickWinnerOpen, setPickWinnerOpen] = useState(false);
  const [pickWinnerSelection, setPickWinnerSelection] = useState("");
  const [ruledOutOpen, setRuledOutOpen] = useState(false);
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const [addLinkInput, setAddLinkInput] = useState("");
  const [addLinkLoading, setAddLinkLoading] = useState(false);
  const decisionScrollRef = useRef(null);
  const autoPickRef = useRef({ count: null });

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
  const backTo = trip?.type ? `/trips?category=${trip.type}` : "/trips";
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
    if (!decisionScrollRef.current) return;
    const nextScroll = decisionScrollRef.current;
    decisionScrollRef.current = null;
    requestAnimationFrame(() => {
      window.scrollTo({ top: nextScroll });
    });
  }, [decisionMode]);

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
    const includeList = parseDomainList(domainInclude).map((item) => item.toLowerCase());
    const excludeList = parseDomainList(domainExclude).map((item) => item.toLowerCase());
    const tagQuery = normalizeText(tagFilter);
    const mentionQuery = normalizeText(mentionFilter);

    let filtered = sortedItems.filter((item) => {
      const domain = normalizeText(item.domain || getDomain(item.airbnbUrl));
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
    domainInclude,
    domainExclude,
    fileType,
    tagFilter,
    mentionFilter,
    showDuplicates,
  ]);

  const filteredItems = filteredState.items;
  const duplicateCount = filteredState.duplicateCount;
  const compareItems = useMemo(() => {
    if (!filteredItems.length || compareSelected.size === 0) return [];
    return filteredItems.filter((item) => compareSelected.has(item.id));
  }, [filteredItems, compareSelected]);

  const decisionStatus = trip?.decisionStatus || "none";
  const decisionDismissed = !!trip?.decisionDismissed;
  const decisionItems = useMemo(() => trip?.items || [], [trip?.items]);
  const decisionActiveItems = useMemo(
    () =>
      decisionItems.filter(
        (item) => !item.decisionState || item.decisionState === "active"
      ),
    [decisionItems]
  );
  const decisionRuledOutItems = useMemo(
    () => decisionItems.filter((item) => item.decisionState === "ruled_out"),
    [decisionItems]
  );
  const decisionChosenItem = useMemo(
    () => decisionItems.find((item) => item.decisionState === "chosen") || null,
    [decisionItems]
  );
  const decisionActiveCount = decisionActiveItems.length;
  const decisionRuledOutCount = decisionRuledOutItems.length;
  const decisionHasComparable =
    decisionItems.length >= 2 && decisionItems.some((item) => !!item.decisionGroupId);
  const pickWinnerItems = useMemo(() => {
    if (decisionStatus === "decided") {
      const items = [];
      const seen = new Set();
      [decisionChosenItem, ...decisionRuledOutItems, ...decisionActiveItems].forEach((item) => {
        if (!item || seen.has(item.id)) return;
        seen.add(item.id);
        items.push(item);
      });
      return items;
    }
    return decisionActiveItems;
  }, [decisionActiveItems, decisionChosenItem, decisionRuledOutItems, decisionStatus]);
  const filteredDisplayItems = useMemo(() => {
    if (decisionStatus !== "decided") return filteredItems;
    const excluded = new Set();
    if (decisionChosenItem?.id) excluded.add(decisionChosenItem.id);
    decisionRuledOutItems.forEach((item) => excluded.add(item.id));
    return filteredItems.filter((item) => !excluded.has(item.id));
  }, [decisionChosenItem, decisionRuledOutItems, decisionStatus, filteredItems]);
  const groupedDisplayItems = useMemo(() => {
    if (!groupByDomain) return [];
    const groups = [];
    const map = new Map();
    filteredDisplayItems.forEach((item) => {
      const domain = item.domain || getDomain(item.airbnbUrl) || "Unknown domain";
      if (!map.has(domain)) {
        const group = { domain, items: [] };
        map.set(domain, group);
        groups.push(group);
      }
      map.get(domain).items.push(item);
    });
    return groups;
  }, [filteredDisplayItems, groupByDomain]);

  const collectionSourceAttribution = useMemo(() => {
    const sourceMap = new Map();
    for (const item of trip?.items || []) {
      const source = getSocialSourceAttribution(item);
      if (!source) continue;
      const key = source.sourceKey || `${source.ownerLabel}|${source.listLabel}`;
      if (!sourceMap.has(key)) {
        sourceMap.set(key, source);
      }
    }

    if (!sourceMap.size) return null;

    const uniqueSources = Array.from(sourceMap.values());
    if (uniqueSources.length === 1) {
      return { type: "single", source: uniqueSources[0], count: 1 };
    }

    return { type: "multiple", count: uniqueSources.length };
  }, [trip?.items]);

  const hasActiveFilters =
    !!tagFilter.trim() ||
    !!mentionFilter.trim() ||
    !!domainInclude.trim() ||
    !!domainExclude.trim() ||
    fileType !== "all";

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

  async function handleOpenItem(item) {
    if (!item?.airbnbUrl) return;
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
    setDomainInclude("");
    setDomainExclude("");
    setFileType("all");
    setTagFilter("");
    setMentionFilter("");
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

  async function handleAddLinkToCollection() {
    if (!trip?.id || addLinkLoading) return;
    const normalizedInput = normalizeUrl(addLinkInput);
    if (!normalizedInput) {
      setInlineErrorMessage("Paste a URL first.");
      return;
    }

    let parsed;
    try {
      parsed = new URL(normalizedInput);
    } catch {
      setInlineErrorMessage("That doesn’t look like a valid URL.");
      return;
    }

    if (!/^https?:$/i.test(parsed.protocol)) {
      setInlineErrorMessage("Only http/https URLs are supported.");
      return;
    }

    const url = parsed.toString();
    const normalizedIncoming = cleanAirbnbUrl(url);
    const exists = (trip.items || []).some(
      (item) => cleanAirbnbUrl(item?.url || item?.airbnbUrl || "") === normalizedIncoming
    );
    if (exists) {
      setInlineErrorMessage("That link is already in this collection.");
      return;
    }

    const domain = getDomain(url);
    const endpoint = domain.includes("airbnb.") ? "/fetch-airbnb-title" : "/fetch-title";
    const fallbackTitle = fallbackTitleForUrl(url);

    setAddLinkLoading(true);
    try {
      const fetchedTitle = await fetchTitleWithTimeout(endpoint, url, 2600);
      const decodedTitle = decodeHtmlEntities(fetchedTitle || "").trim();
      const title = decodedTitle || fallbackTitle;
      const insertedItem = await addItemToTrip(trip.id, {
        title,
        url,
        airbnbUrl: url,
        originalUrl: url,
        domain,
        platform: getPlatform(domain),
        itemType: "link",
        metadata: {},
        addedAt: Date.now(),
      });
      if (!insertedItem) {
        setInlineErrorMessage("Couldn’t add that link right now.");
        return;
      }
      setAddLinkInput("");
      setInlineToastMessage("Link added.");
    } catch {
      setInlineErrorMessage("Couldn’t add that link right now.");
    } finally {
      setAddLinkLoading(false);
    }
  }

  useEffect(() => {
    if (!trip?.id || !user) return;
    if (decisionStatus !== "none") return;
    if (!decisionHasComparable) return;
    const previous = {
      decisionStatus,
      decidedAt: trip.decidedAt || 0,
      decisionDismissed: !!trip.decisionDismissed,
    };
    updateTripState(trip.id, { decisionStatus: "in_progress" });
    supabase
      .from("trips")
      .update({ decision_status: "in_progress", decided_at: null })
      .eq("id", trip.id)
      .eq("owner_id", user.id)
      .then(({ error }) => {
        if (error) {
          updateTripState(trip.id, previous);
        }
      });
  }, [decisionHasComparable, decisionStatus, trip, updateTripState, user]);

  useEffect(() => {
    if (decisionMode !== "narrow") {
      autoPickRef.current.count = null;
      return;
    }
    if (decisionStatus === "decided") return;
    if (decisionActiveCount !== 1) {
      autoPickRef.current.count = null;
      return;
    }
    if (pickWinnerOpen) return;
    if (autoPickRef.current.count === decisionActiveCount) return;
    const remaining = decisionActiveItems[0];
    if (!remaining) return;
    autoPickRef.current.count = decisionActiveCount;
    setPickWinnerSelection(remaining.id);
    setPickWinnerOpen(true);
  }, [decisionActiveCount, decisionActiveItems, decisionMode, decisionStatus, pickWinnerOpen]);

  useEffect(() => {
    if (decisionStatus !== "decided") return;
    if (decisionMode === "normal") return;
    setDecisionMode("normal");
  }, [decisionMode, decisionStatus]);

  function setDecisionModeWithScroll(nextMode) {
    if (typeof window !== "undefined") {
      decisionScrollRef.current = window.scrollY;
    }
    setDecisionMode(nextMode);
  }

  async function updateTripDecision(nextUpdates) {
    if (!trip?.id || !user) return false;
    const previous = {
      decisionStatus: decisionStatus || "none",
      decidedAt: trip.decidedAt || 0,
      decisionDismissed: !!trip.decisionDismissed,
    };
    updateTripState(trip.id, nextUpdates);
    const payload = {};
    if ("decisionStatus" in nextUpdates) payload.decision_status = nextUpdates.decisionStatus;
    if ("decidedAt" in nextUpdates) {
      payload.decided_at = nextUpdates.decidedAt
        ? new Date(nextUpdates.decidedAt).toISOString()
        : null;
    }
    if ("decisionDismissed" in nextUpdates) {
      payload.decision_dismissed = !!nextUpdates.decisionDismissed;
    }
    const { error } = await supabase
      .from("trips")
      .update(payload)
      .eq("id", trip.id)
      .eq("owner_id", user.id);
    if (error) {
      updateTripState(trip.id, previous);
      setInlineErrorMessage("Couldn’t update decision state.");
      return false;
    }
    return true;
  }

  async function handleDecisionDismiss() {
    await updateTripDecision({ decisionDismissed: true });
  }

  async function handleDecisionRestoreBanner() {
    await updateTripDecision({ decisionDismissed: false });
  }

  async function handleRuleOutItem(item) {
    if (!item?.id || !trip?.id) return;
    const now = Date.now();
    const previous = {
      decisionState: item.decisionState || "active",
      ruledOutAt: item.ruledOutAt || 0,
      chosenAt: item.chosenAt || 0,
      chosen: !!item.chosen,
    };
    updateItemEngagement(trip.id, item.id, {
      decisionState: "ruled_out",
      ruledOutAt: now,
      chosenAt: 0,
      chosen: false,
    });
    const { error } = await supabase
      .from("trip_items")
      .update({
        decision_state: "ruled_out",
        ruled_out_at: new Date(now).toISOString(),
        chosen_at: null,
        chosen: false,
      })
      .eq("id", item.id);
    if (error) {
      updateItemEngagement(trip.id, item.id, previous);
      setInlineErrorMessage("Couldn’t move item.");
      return;
    }
    setInlineToastMessage("Moved to ruled out");
  }

  async function handleRestoreItem(item) {
    if (!item?.id || !trip?.id) return;
    if (item.decisionState !== "ruled_out") return;
    const previous = {
      decisionState: item.decisionState || "active",
      ruledOutAt: item.ruledOutAt || 0,
      chosenAt: item.chosenAt || 0,
      chosen: !!item.chosen,
    };
    updateItemEngagement(trip.id, item.id, {
      decisionState: "active",
      ruledOutAt: 0,
      chosenAt: 0,
      chosen: false,
    });
    const { error } = await supabase
      .from("trip_items")
      .update({
        decision_state: "active",
        ruled_out_at: null,
        chosen_at: null,
        chosen: false,
      })
      .eq("id", item.id);
    if (error) {
      updateItemEngagement(trip.id, item.id, previous);
      setInlineErrorMessage("Couldn’t restore item.");
      return;
    }
  }

  async function handleDecisionReset() {
    if (!trip?.id) return;
    const previousTrip = {
      decisionStatus,
      decidedAt: trip.decidedAt || 0,
      decisionDismissed: !!trip.decisionDismissed,
    };
    const previousItems = new Map(
      decisionItems.map((item) => [
        item.id,
        {
          decisionState: item.decisionState || "active",
          ruledOutAt: item.ruledOutAt || 0,
          chosenAt: item.chosenAt || 0,
          chosen: !!item.chosen,
        },
      ])
    );
    updateTripState(trip.id, {
      decisionStatus: "in_progress",
      decidedAt: 0,
      decisionDismissed: false,
    });
    decisionItems.forEach((item) => {
      updateItemEngagement(trip.id, item.id, {
        decisionState: "active",
        ruledOutAt: 0,
        chosenAt: 0,
        chosen: false,
      });
    });
    const [itemsResult, tripResult] = await Promise.all([
      supabase
        .from("trip_items")
        .update({
          decision_state: "active",
          ruled_out_at: null,
          chosen_at: null,
          chosen: false,
        })
        .eq("trip_id", trip.id),
      supabase
        .from("trips")
        .update({ decision_status: "in_progress", decided_at: null, decision_dismissed: false })
        .eq("id", trip.id)
        .eq("owner_id", user?.id),
    ]);
    if (itemsResult.error || tripResult.error) {
      updateTripState(trip.id, previousTrip);
      previousItems.forEach((value, itemId) => {
        updateItemEngagement(trip.id, itemId, value);
      });
      setInlineErrorMessage("Couldn’t reset decision.");
      return;
    }
    setInlineToastMessage("Reset decision");
  }

  function openPickWinner(selectedId) {
    if (selectedId) {
      setPickWinnerSelection(selectedId);
    }
    setPickWinnerOpen(true);
  }

  async function handleConfirmWinner() {
    if (!trip?.id || !pickWinnerSelection) return;
    const now = Date.now();
    const selectedId = pickWinnerSelection;
    const candidateIds = pickWinnerItems.map((item) => item.id);
    const otherActiveIds = candidateIds.filter((id) => id !== selectedId);
    const previousTrip = {
      decisionStatus,
      decidedAt: trip.decidedAt || 0,
      decisionDismissed: !!trip.decisionDismissed,
    };
    const previousItems = new Map();
    decisionItems.forEach((item) => {
      if (item.id === selectedId || otherActiveIds.includes(item.id)) {
        previousItems.set(item.id, {
          decisionState: item.decisionState || "active",
          ruledOutAt: item.ruledOutAt || 0,
          chosenAt: item.chosenAt || 0,
          chosen: !!item.chosen,
        });
      }
    });
    updateTripState(trip.id, { decisionStatus: "decided", decidedAt: now });
    updateItemEngagement(trip.id, selectedId, {
      decisionState: "chosen",
      chosenAt: now,
      ruledOutAt: 0,
      chosen: true,
    });
    otherActiveIds.forEach((id) => {
      updateItemEngagement(trip.id, id, {
        decisionState: "ruled_out",
        ruledOutAt: now,
        chosenAt: 0,
        chosen: false,
      });
    });
    const [chosenResult, ruledOutResult, tripResult] = await Promise.all([
      supabase
        .from("trip_items")
        .update({
          decision_state: "chosen",
          chosen_at: new Date(now).toISOString(),
          ruled_out_at: null,
          chosen: true,
        })
        .eq("id", selectedId),
      otherActiveIds.length
        ? supabase
            .from("trip_items")
            .update({
              decision_state: "ruled_out",
              ruled_out_at: new Date(now).toISOString(),
              chosen_at: null,
              chosen: false,
            })
            .in("id", otherActiveIds)
        : Promise.resolve({ error: null }),
      supabase
        .from("trips")
        .update({ decision_status: "decided", decided_at: new Date(now).toISOString() })
        .eq("id", trip.id)
        .eq("owner_id", user?.id),
    ]);
    if (chosenResult.error || ruledOutResult.error || tripResult.error) {
      updateTripState(trip.id, previousTrip);
      previousItems.forEach((value, itemId) => {
        updateItemEngagement(trip.id, itemId, value);
      });
      setInlineErrorMessage("Couldn’t mark winner.");
      return;
    }
    setPickWinnerOpen(false);
    setDecisionModeWithScroll("normal");
    setInlineToastMessage("Marked as decided.");
  }

  async function handleReopenDecision() {
    if (!trip?.id || !decisionChosenItem) return;
    const previousTrip = {
      decisionStatus,
      decidedAt: trip.decidedAt || 0,
      decisionDismissed: !!trip.decisionDismissed,
    };
    const previousItem = {
      decisionState: decisionChosenItem.decisionState || "active",
      ruledOutAt: decisionChosenItem.ruledOutAt || 0,
      chosenAt: decisionChosenItem.chosenAt || 0,
      chosen: !!decisionChosenItem.chosen,
    };
    updateTripState(trip.id, { decisionStatus: "in_progress", decidedAt: 0 });
    updateItemEngagement(trip.id, decisionChosenItem.id, {
      decisionState: "active",
      chosenAt: 0,
      ruledOutAt: 0,
      chosen: false,
    });
    const [itemResult, tripResult] = await Promise.all([
      supabase
        .from("trip_items")
        .update({
          decision_state: "active",
          chosen_at: null,
          ruled_out_at: null,
          chosen: false,
        })
        .eq("id", decisionChosenItem.id),
      supabase
        .from("trips")
        .update({ decision_status: "in_progress", decided_at: null })
        .eq("id", trip.id)
        .eq("owner_id", user?.id),
    ]);
    if (itemResult.error || tripResult.error) {
      updateTripState(trip.id, previousTrip);
      updateItemEngagement(trip.id, decisionChosenItem.id, previousItem);
      setInlineErrorMessage("Couldn’t reopen decision.");
      return;
    }
  }

  function handleChangeWinner() {
    if (!decisionChosenItem) return;
    openPickWinner(decisionChosenItem.id);
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
    const action = normalizePrimaryAction(
      item.primaryAction || inferPrimaryAction(item.airbnbUrl, domainLabel)
    );
    const actionLabel = primaryActionLabel(action);
    const isChosen = item.decisionState === "chosen" || !!item.chosen;
    const itemPreviewImage = resolveItemPreviewImage(item);
    const thumbFallback = (titleParts.main || domainLabel || "S").charAt(0).toUpperCase();

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
            <div className="itemPreviewThumb" aria-hidden="true">
              {itemPreviewImage ? (
                <img src={itemPreviewImage} alt="" loading="lazy" />
              ) : (
                <span>{thumbFallback}</span>
              )}
            </div>
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
      <div className="page tripsPage tripDetailPage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
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
              searchValue=""
              onSearchChange={() => {}}
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
      <div className="page tripsPage tripDetailPage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
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
              searchValue=""
              onSearchChange={() => {}}
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
    <div className="page tripsPage tripDetailPage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
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
            searchValue=""
            onSearchChange={() => {}}
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
          backTo={backTo}
          collectionSubtitle={collectionSubtitle}
          updatedAt={updatedAt}
          linkCount={linkCount}
          collectionSourceAttribution={collectionSourceAttribution}
        />

        <div className="detailCollectionBody">
          <div className="detailHeader hasCover">
            <div className="detailSectionDivider" />

            <div className="detailHeaderActions">
              <div className="detailAddLinkRow">
                <span className="detailAddLinkIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                    <path d="M16.5 16.5L21 21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  className="detailAddLinkInput"
                  type="url"
                  placeholder="Paste a link or add anything you want to stash..."
                  value={addLinkInput}
                  onChange={(e) => setAddLinkInput(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddLinkToCollection();
                    }
                  }}
                  disabled={addLinkLoading}
                  aria-label="Paste link to collection"
                />
                <button
                  className="detailAddLinkBtn"
                  type="button"
                  onClick={handleAddLinkToCollection}
                  disabled={addLinkLoading}
                  aria-label={addLinkLoading ? "Adding link" : "Add link"}
                >
                  {addLinkLoading ? "…" : "+"}
                </button>
              </div>

            <div className="detailToolbar">
              <div className="toolbarLeft">
                <div className="sortRow inline">
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

            <div className="filterRow">
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
          {trip.items.length === 0 ? (
            <div className="emptyState">
              <div className="emptyTitle">Nothing here yet — stash something.</div>
              <div className="emptyText">
                Save your first link to this collection.
              </div>
            </div>
          ) : (decisionMode !== "narrow" && filteredItems.length === 0) ? (
            <div className="emptyState">
              <div className="emptyTitle">Nothing found</div>
              <div className="emptyText">
                Try different filters or clear filters.
              </div>
              {hasActiveFilters && (
                <button className="miniBtn" type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className={`itemList ${compactMode ? "compact" : ""}`}>
              {!compareMode && (
                <>
                  {decisionStatus === "in_progress" &&
                    decisionMode === "normal" &&
                    !decisionDismissed && (
                      <div className="decisionBanner inProgress">
                        <div>
                          <div className="decisionBannerTitle">Decision in progress</div>
                          <div className="decisionBannerSubtitle">
                            Narrow this down when you're ready.
                          </div>
                        </div>
                        <div className="decisionBannerActions">
                          <button
                            className="miniBtn"
                            type="button"
                            onClick={() => {
                              setViewMode("list");
                              setCompareMode(false);
                              setDecisionModeWithScroll("narrow");
                            }}
                          >
                            Narrow this down
                          </button>
                          <button
                            className="miniBtn ghostBtn"
                            type="button"
                            onClick={handleDecisionDismiss}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}

                  {decisionStatus === "in_progress" &&
                    decisionMode === "normal" &&
                    decisionDismissed && (
                      <button
                        className="decisionToggleChip"
                        type="button"
                        onClick={handleDecisionRestoreBanner}
                      >
                        Decision banner hidden · Re-enable
                      </button>
                    )}

                  {decisionStatus === "decided" && decisionChosenItem && (
                    <div className="decisionWinnerCard">
                      <div className="decisionWinnerTop">
                        <div className="decisionWinnerLabel">Winner</div>
                      </div>
                      <div className="decisionWinnerTitleRow">
                        <a
                          className="decisionWinnerTitleLink"
                          href={decisionChosenItem.airbnbUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => {
                            if (!decisionChosenItem.airbnbUrl) event.preventDefault();
                          }}
                        >
                          {splitTitleParts(decisionChosenItem.title, decisionChosenItem.airbnbUrl).main}
                        </a>
                        <div className="decisionWinnerBadges">
                          <span className="decisionWinnerBadge">Decided</span>
                          {(decisionChosenItem.domain ||
                            getDomain(decisionChosenItem.airbnbUrl)) && (
                            <>
                              <span className="domainPill">
                                {decisionChosenItem.domain ||
                                  getDomain(decisionChosenItem.airbnbUrl)}
                              </span>
                              {decisionChosenItem.airbnbUrl && (
                                <a
                                  className="decisionExternalLink"
                                  href={decisionChosenItem.airbnbUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label="Open winner in new tab"
                                >
                                  <svg viewBox="0 0 20 20" role="presentation">
                                    <path d="M11 3h6v6h-2V6.41l-7.3 7.3-1.4-1.42 7.29-7.29H11V3z" />
                                    <path d="M5 5h5v2H6.99v6.01h6.02V10h2v5H5V5z" />
                                  </svg>
                                </a>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="decisionWinnerActionsRow">
                        <button
                          className="decisionWinnerAction"
                          type="button"
                          onClick={handleChangeWinner}
                        >
                          Change winner
                        </button>
                        <button
                          className="decisionWinnerAction"
                          type="button"
                          onClick={handleReopenDecision}
                        >
                          Re-open decision
                        </button>
                      </div>
                    </div>
                  )}

                  {decisionStatus === "decided" && decisionRuledOutItems.length > 0 && (
                    <div className="decisionCollapse">
                      <button
                        className="decisionCollapseToggle"
                        type="button"
                        onClick={() => setAlternativesOpen((prev) => !prev)}
                      >
                        Considered alternatives ({decisionRuledOutItems.length})
                        <span className={`chevron ${alternativesOpen ? "open" : ""}`}>▾</span>
                      </button>
                      {alternativesOpen && (
                        <div className="decisionCollapseBody">
                          {decisionRuledOutItems.map((item) => {
                            const domainLabel = item.domain || getDomain(item.airbnbUrl);
                            return (
                              <div key={item.id} className="decisionAltRow">
                                <button
                                  className="decisionAltTitle"
                                  type="button"
                                  onClick={() => handleOpenItem(item)}
                                >
                                  {splitTitleParts(item.title, item.airbnbUrl).main}
                                </button>
                                <div className="decisionAltMeta">
                                  {domainLabel && (
                                    <span className="domainPill small">{domainLabel}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {decisionMode === "narrow" && decisionStatus !== "decided" && (
                    <div className="decisionNarrow">
                      <div className="decisionNarrowHeader">
                        <div className="decisionCounts">
                          {decisionActiveCount} active • {decisionRuledOutCount} ruled out
                        </div>
                        <div className="decisionNarrowActions">
                          <button
                            className="miniBtn ghostBtn"
                            type="button"
                            onClick={handleDecisionReset}
                          >
                            Reset
                          </button>
                          <button
                            className="miniBtn"
                            type="button"
                            onClick={() => setDecisionModeWithScroll("normal")}
                          >
                            Done
                          </button>
                        </div>
                      </div>

                      <div className="decisionNarrowList">
                        {decisionActiveItems.map((item) => {
                          const domainLabel = item.domain || getDomain(item.airbnbUrl);
                          return (
                            <div key={item.id} className="decisionNarrowCard">
                              <div className="decisionNarrowMain">
                                <button
                                  className="decisionNarrowTitle"
                                  type="button"
                                  onClick={() => handleOpenItem(item)}
                                >
                                  {splitTitleParts(item.title, item.airbnbUrl).main}
                                </button>
                                <div className="decisionNarrowMeta">
                                  {domainLabel && (
                                    <span className="domainPill small">{domainLabel}</span>
                                  )}
                                </div>
                              </div>
                              <div className="decisionNarrowActions">
                                <button
                                  className="miniBtn ghostBtn"
                                  type="button"
                                  onClick={() => setInlineToastMessage("Kept active")}
                                >
                                  Keep
                                </button>
                                <button
                                  className="miniBtn danger"
                                  type="button"
                                  onClick={() => handleRuleOutItem(item)}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {decisionActiveCount === 2 && (
                        <div className="decisionNudgeRow">
                          <div className="decisionNudgeText">Almost there — pick one?</div>
                          <div className="decisionNudgeActions">
                            <button
                              className="miniBtn"
                              type="button"
                              onClick={() => openPickWinner(decisionActiveItems[0]?.id)}
                            >
                              Pick a winner
                            </button>
                            <button
                              className="miniBtn ghostBtn"
                              type="button"
                              onClick={() => setDecisionModeWithScroll("normal")}
                            >
                              Keep browsing
                            </button>
                          </div>
                        </div>
                      )}

                      {decisionRuledOutItems.length > 0 && (
                        <div className="decisionCollapse">
                          <button
                            className="decisionCollapseToggle"
                            type="button"
                            onClick={() => setRuledOutOpen((prev) => !prev)}
                          >
                            Ruled out ({decisionRuledOutItems.length})
                            <span className={`chevron ${ruledOutOpen ? "open" : ""}`}>▾</span>
                          </button>
                          {ruledOutOpen && (
                            <div className="decisionCollapseBody">
                              {decisionRuledOutItems.map((item) => {
                                const domainLabel = item.domain || getDomain(item.airbnbUrl);
                                return (
                                  <div key={item.id} className="decisionAltRow">
                                    <button
                                      className="decisionAltTitle"
                                      type="button"
                                      onClick={() => handleOpenItem(item)}
                                    >
                                      {splitTitleParts(item.title, item.airbnbUrl).main}
                                    </button>
                                    <div className="decisionAltMeta">
                                      {domainLabel && (
                                        <span className="domainPill small">{domainLabel}</span>
                                      )}
                                    </div>
                                    <button
                                      className="miniBtn ghostBtn"
                                      type="button"
                                      onClick={() => handleRestoreItem(item)}
                                    >
                                      Restore
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {decisionMode !== "narrow" && duplicateCount > 0 && (
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
                      const action = normalizePrimaryAction(
                        item.primaryAction || inferPrimaryAction(item.airbnbUrl, domainLabel)
                      );
                      const actionLabel = primaryActionLabel(action);
                      const isChosen = item.decisionState === "chosen" || !!item.chosen;
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
              ) : decisionMode === "narrow" ? null : groupByDomain ? (
                <div className="groupList">
                  {groupedDisplayItems.map((group) => {
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
                filteredDisplayItems.map((item) => renderListCard(item))
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

      {pickWinnerOpen && (
        <div
          className="decisionOverlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setPickWinnerOpen(false)}
        >
          <div className="decisionSheet" onClick={(e) => e.stopPropagation()}>
            <div className="decisionSheetHeader">
              <div>
                <div className="decisionSheetTitle">Pick the winner</div>
                <div className="decisionSheetSubtitle">
                  This will mark the collection as decided.
                </div>
              </div>
              <button
                className="shareModalClose"
                type="button"
                onClick={() => setPickWinnerOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="decisionSheetBody">
              {pickWinnerItems.length === 0 ? (
                <div className="inlineError">No active items to choose from.</div>
              ) : (
                pickWinnerItems.map((item) => {
                  const titleParts = splitTitleParts(item.title, item.airbnbUrl);
                  const domainLabel = item.domain || getDomain(item.airbnbUrl);
                  const isSelected = pickWinnerSelection === item.id;
                  return (
                    <label
                      key={item.id}
                      className={`decisionOption${isSelected ? " selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="pickWinner"
                        checked={isSelected}
                        onChange={() => setPickWinnerSelection(item.id)}
                      />
                      <div className="decisionOptionInfo">
                        <div className="decisionOptionTitle">{titleParts.main}</div>
                        <div className="decisionOptionMeta">
                          {domainLabel && (
                            <span className="domainPill small">{domainLabel}</span>
                          )}
                        </div>
                      </div>
                      <div className="decisionOptionCheck" aria-hidden="true">
                        <svg viewBox="0 0 20 20" role="presentation">
                          <circle cx="10" cy="10" r="9" />
                          <path d="M6.2 10.4l2.3 2.3 5.4-5.4" />
                        </svg>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <div className="decisionSheetActions">
              <button
                className="decisionGhostBtn"
                type="button"
                onClick={() => setPickWinnerOpen(false)}
              >
                Cancel
              </button>
              <button
                className="decisionPrimaryBtn"
                type="button"
                onClick={handleConfirmWinner}
                disabled={!pickWinnerSelection}
              >
                Confirm winner
              </button>
            </div>
          </div>
        </div>
      )}

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
