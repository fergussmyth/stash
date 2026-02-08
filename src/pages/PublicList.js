import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import { savePublicListToStash } from "../lib/socialSave";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import stashLogo from "../assets/icons/stash-favicon.png";
import userIcon from "../assets/icons/user.png";

function normalizeHandleParam(input = "") {
  return String(input || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function normalizeSlugParam(input = "") {
  return String(input || "").trim().toLowerCase();
}

function displayNameForProfile(profile) {
  if (!profile) return "";
  return profile.display_name || profile.handle || "Stash user";
}

function sectionLabel(section = "") {
  const normalized = String(section || "").toLowerCase();
  if (normalized === "travel") return "Travel";
  if (normalized === "fashion") return "Fashion";
  return "General";
}

function visibilityLabel(value = "") {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "public") return "Public";
  if (normalized === "unlisted") return "Unlisted";
  return "Private";
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

function getDomain(url = "") {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatRating(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num % 1 === 0 ? String(num) : num.toFixed(1);
}

function getMetaObject(meta) {
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
  const parsed = getMetaObject(meta);
  if (!parsed || typeof parsed !== "object") return "";

  const direct = firstNonEmpty([
    parsed.image,
    parsed.image_url,
    parsed.imageUrl,
    parsed.og_image,
    parsed.ogImage,
    parsed.thumbnail,
    parsed.thumbnail_url,
    parsed.thumbnailUrl,
    parsed.photo,
    parsed.photo_url,
    parsed.photoUrl,
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

function resolveListItemImage(item) {
  const snapshotImage = String(item?.image_snapshot || "").trim();
  if (snapshotImage) return snapshotImage;

  const metaImage = extractImageFromMeta(item?.meta_json);
  if (metaImage) return metaImage;
  return "";
}

async function fetchLinkPreviewWithTimeout(url, timeoutMs = 3800) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/fetch-link-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    const data = await res.json();
    return {
      title: String(data?.title || "").trim(),
      imageUrl: String(data?.imageUrl || "").trim(),
    };
  } catch {
    return { title: "", imageUrl: "" };
  } finally {
    clearTimeout(timer);
  }
}

function shouldReplaceItemTitle(existingTitle = "", itemUrl = "") {
  const normalized = String(existingTitle || "").trim();
  if (!normalized) return true;
  if (normalized.toLowerCase() === "saved link") return true;
  const domain = getDomain(itemUrl).toLowerCase();
  if (domain && normalized.toLowerCase() === domain) return true;
  return false;
}

function buildMetaChips(item) {
  const chips = [];
  if (item.price_snapshot) chips.push(String(item.price_snapshot));
  const meta = getMetaObject(item.meta_json);
  if (meta && typeof meta === "object") {
    const location =
      meta.location ||
      meta.neighborhood ||
      meta.city ||
      meta.region ||
      meta.area ||
      meta.place ||
      meta.destination;
    if (location && typeof location === "string") chips.push(location);
  }
  return chips;
}

function IconCopy(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <rect x="9" y="9" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="4" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" />
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

function IconArrowUp(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 5l-6 6M12 5l6 6M12 5v14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconArrowDown(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 19l-6-6M12 19l6-6M12 5v14"
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

function IconGrip(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <circle cx="9" cy="6" r="1.5" fill="currentColor" />
      <circle cx="15" cy="6" r="1.5" fill="currentColor" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <circle cx="9" cy="18" r="1.5" fill="currentColor" />
      <circle cx="15" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

export default function PublicList() {
  const params = useParams();
  const rawHandle = params.handle || "";
  const rawSlug = params.listSlug || "";
  const isPublicHandlePath = String(rawHandle || "").trim().startsWith("@");
  const handle = normalizeHandleParam(rawHandle);
  const listSlug = normalizeSlugParam(rawSlug);

  const { user, loading: authLoading } = useAuth();
  const viewerUserId = user?.id || null;
  const { trips, createTrip, deleteTrip, reloadTripItems } = useTrips();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [profile, setProfile] = useState(null);
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const [isSaved, setIsSaved] = useState(false);
  const [savedTripId, setSavedTripId] = useState("");
  const [checkingSaved, setCheckingSaved] = useState(false);
  const [saveWorking, setSaveWorking] = useState(false);

  const [reorderWorking, setReorderWorking] = useState(false);
  const [workingItemId, setWorkingItemId] = useState("");
  const [expandedNotes, setExpandedNotes] = useState(new Set());
  const [dragItemId, setDragItemId] = useState("");
  const [dragOverItemId, setDragOverItemId] = useState("");

  const viewTrackedRef = useRef(new Set());
  const previewAttemptedItemIdsRef = useRef(new Set());
  const [coverLoaded, setCoverLoaded] = useState(false);

  const categoryCounts = useMemo(
    () =>
      ["general", "travel", "fashion"].reduce((acc, category) => {
        acc[category] = trips.filter((trip) => (trip.type || "general") === category).length;
        return acc;
      }, {}),
    [trips]
  );

  const isOwner = !!viewerUserId && !!profile?.id && viewerUserId === profile.id;
  const listTitle = list?.title || "List";
  const listSubtitle = list?.subtitle || "";
  const section = list?.section || "general";
  const listVisibility = list?.visibility || "private";
  const showRank = !!list?.is_ranked;
  const rankedSize = list?.ranked_size || null;
  const saveCount = Number(list?.save_count || 0);

  const coverSeed = useMemo(
    () => `${list?.id || ""}-${list?.title || ""}-${profile?.id || ""}`,
    [list?.id, list?.title, profile?.id]
  );
  const fallbackGradient = useMemo(() => makeCoverGradient(coverSeed), [coverSeed]);
  const firstItemCoverImage = useMemo(() => {
    for (const item of items || []) {
      const image = resolveListItemImage(item);
      if (image) return image;
    }
    return "";
  }, [items]);
  const coverImageUrl = list?.cover_image_url || firstItemCoverImage || "";
  const isGradientCover =
    (coverImageUrl || "").startsWith("linear-gradient") || (coverImageUrl || "").startsWith("radial-gradient");
  const isImageCover =
    !!coverImageUrl && !isGradientCover && !(coverImageUrl || "").startsWith("data:");
  const coverBackground = isGradientCover && coverImageUrl ? coverImageUrl : fallbackGradient;

  function setToast(message) {
    setToastMsg(message);
    setTimeout(() => setToastMsg(""), 1500);
  }

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    setProfile(null);
    setList(null);
    setItems([]);
    setLoadingList(true);
    setLoadingItems(true);
    setNotFound(false);
    setLoadError("");
    setIsSaved(false);
    setSavedTripId("");
    setCheckingSaved(false);
    setToastMsg("");
    setCoverLoaded(false);

    async function load() {
      if (!isPublicHandlePath || !handle || !listSlug) {
        if (!active) return;
        setNotFound(true);
        setLoadingList(false);
        setLoadingItems(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id,handle,display_name,avatar_url,is_public")
        .eq("handle", handle)
        .single();

      if (!active) return;
      if (profileError || !profileData) {
        setNotFound(true);
        setLoadingList(false);
        setLoadingItems(false);
        return;
      }

      setProfile(profileData);

      const { data: listData, error: listError } = await supabase
        .from("lists")
        .select(
          "id,owner_user_id,section,title,subtitle,slug,cover_image_url,visibility,is_ranked,ranked_size,pinned_order,save_count,view_count,created_at,updated_at"
        )
        .eq("owner_user_id", profileData.id)
        .eq("slug", listSlug)
        .single();

      if (!active) return;
      if (listError || !listData) {
        setNotFound(true);
        setLoadingList(false);
        setLoadingItems(false);
        return;
      }

      setList(listData);
      setLoadingList(false);

      const { data: itemsData, error: itemsError } = await supabase
        .from("list_items")
        .select(
          "id,list_id,item_id,url,title_snapshot,image_snapshot,domain_snapshot,price_snapshot,rating_snapshot,meta_json,rank_index,note,created_at"
        )
        .eq("list_id", listData.id)
        .order("rank_index", { ascending: true })
        .limit(300);

      if (!active) return;
      if (itemsError) {
        setLoadError("Could not load this list right now.");
        setItems([]);
      } else {
        setItems(itemsData || []);
      }
      setLoadingItems(false);

      if (viewerUserId) {
        setCheckingSaved(true);
        let saveLookupError = null;
        let saveRow = null;

        const withTrip = await supabase
          .from("list_saves")
          .select("list_id,saved_trip_id")
          .eq("user_id", viewerUserId)
          .eq("list_id", listData.id)
          .maybeSingle();

        if (withTrip.error && withTrip.error.code === "42703") {
          const fallback = await supabase
            .from("list_saves")
            .select("list_id")
            .eq("user_id", viewerUserId)
            .eq("list_id", listData.id)
            .maybeSingle();
          saveLookupError = fallback.error;
          saveRow = fallback.data || null;
        } else {
          saveLookupError = withTrip.error;
          saveRow = withTrip.data || null;
        }

        if (!active) return;
        if (!saveLookupError) {
          setIsSaved(!!saveRow);
          setSavedTripId(saveRow?.saved_trip_id || "");
        }
        setCheckingSaved(false);
      }

      const viewKey = `${viewerUserId || "anon"}:${listData.id}`;
      if (!viewTrackedRef.current.has(viewKey)) {
        viewTrackedRef.current.add(viewKey);
        const referrer = typeof document !== "undefined" ? document.referrer || null : null;
        supabase.from("list_views").insert({ list_id: listData.id, referrer }).then(() => {});
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [authLoading, handle, isPublicHandlePath, listSlug, viewerUserId]);

  useEffect(() => {
    previewAttemptedItemIdsRef.current = new Set();
  }, [list?.id]);

  useEffect(() => {
    if (!isOwner || !list?.id || loadingItems || !items?.length) return;

    const candidates = items
      .filter((item) => item?.id && item?.url && !item?.image_snapshot)
      .filter((item) => !previewAttemptedItemIdsRef.current.has(item.id))
      .slice(0, 8);

    if (!candidates.length) return;

    let cancelled = false;

    async function enrichMissingPreviews() {
      for (const item of candidates) {
        if (cancelled) return;
        previewAttemptedItemIdsRef.current.add(item.id);

        const preview = await fetchLinkPreviewWithTimeout(item.url, 4200);
        if (cancelled) return;

        const nextTitle = preview.title;
        const nextImage = preview.imageUrl;
        const patch = {};

        if (nextImage) {
          patch.image_snapshot = nextImage;
        }
        if (nextTitle && shouldReplaceItemTitle(item.title_snapshot, item.url)) {
          patch.title_snapshot = nextTitle;
        }

        if (Object.keys(patch).length === 0) continue;

        const { error } = await supabase
          .from("list_items")
          .update(patch)
          .eq("id", item.id)
          .eq("list_id", list.id);

        if (cancelled) return;
        if (error) continue;

        setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, ...patch } : row)));
      }
    }

    enrichMissingPreviews();
    return () => {
      cancelled = true;
    };
  }, [isOwner, list?.id, items, loadingItems]);

  async function viewSavedCopy() {
    if (saveWorking) return;
    if (savedTripId) {
      navigate(`/trips/${savedTripId}`);
      return;
    }
    if (!viewerUserId || !list) {
      navigate("/trips");
      return;
    }

    setSaveWorking(true);
    try {
      const result = await savePublicListToStash({
        viewerUserId,
        list,
        ownerHandle: profile?.handle || handle || "",
        listItems: items,
        createTrip,
        deleteTrip,
        reloadTripItems,
      });

      if ((result.status === "saved" || result.status === "already_saved") && result.savedTripId) {
        setIsSaved(true);
        setSavedTripId(result.savedTripId);
        if (result.status === "saved" && result.insertedSaveRow) {
          setList((prev) => (prev ? { ...prev, save_count: Number(prev.save_count || 0) + 1 } : prev));
        }
        navigate(`/trips/${result.savedTripId}`);
        return;
      }

      if (result.status === "error") {
        setToast(result.message || "Couldn’t open saved copy right now.");
      }
      navigate("/trips");
    } finally {
      setSaveWorking(false);
    }
  }

  async function toggleSave() {
    if (!list) return;
    if (!viewerUserId) {
      navigate("/login");
      return;
    }
    if (saveWorking) return;
    if (isSaved) {
      await viewSavedCopy();
      return;
    }

    setSaveWorking(true);
    try {
      const result = await savePublicListToStash({
        viewerUserId,
        list,
        ownerHandle: profile?.handle || handle || "",
        listItems: items,
        createTrip,
        deleteTrip,
        reloadTripItems,
      });

      if (result.status === "saved") {
        setIsSaved(true);
        setSavedTripId(result.savedTripId || "");
        if (result.insertedSaveRow) {
          setList((prev) => (prev ? { ...prev, save_count: Number(prev.save_count || 0) + 1 } : prev));
        }
        setToast("Saved to your Stash");
        return;
      }

      if (result.status === "already_saved") {
        setIsSaved(true);
        setSavedTripId(result.savedTripId || "");
        setToast("Already saved");
        return;
      }

      setToast(result.message || "Couldn’t save right now.");
    } finally {
      setSaveWorking(false);
    }
  }

  async function handleShare() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: listTitle,
          text: listSubtitle || `${listTitle} by @${handle}`,
          url,
        });
        return;
      } catch {
        // fall back to clipboard
      }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        setToast("Copied!");
      } catch {
        setToast("Couldn’t copy link.");
      }
    }
  }

  async function handleCopyItem(url) {
    if (!url) return;
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(url);
      setToast("Copied!");
    } catch {
      setToast("Couldn’t copy link.");
    }
  }

  function updateLocalItem(itemId, patch) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  }

  function reorderItemsByDrop(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return null;
    const sourceIndex = items.findIndex((it) => it.id === sourceId);
    const targetIndex = items.findIndex((it) => it.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return null;
    const next = [...items];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    return next;
  }

  function toggleNoteExpanded(itemId, expanded) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (expanded) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  async function saveItemNote(item) {
    if (!isOwner) return;
    if (!item?.id) return;
    setWorkingItemId(item.id);
    const { error } = await supabase
      .from("list_items")
      .update({ note: (item.note || "").trim() || null })
      .eq("id", item.id)
      .eq("list_id", item.list_id);
    if (error) {
      setToast("Couldn’t save note.");
    }
    setWorkingItemId("");
  }

  async function persistReorderWithoutRpc(nextItems) {
    if (!list?.id) return new Error("Missing list id.");
    const shift = nextItems.length + 1000;
    for (let index = 0; index < nextItems.length; index += 1) {
      const item = nextItems[index];
      const { error } = await supabase
        .from("list_items")
        .update({ rank_index: index + 1 + shift })
        .eq("id", item.id)
        .eq("list_id", list.id);
      if (error) return error;
    }
    for (let index = 0; index < nextItems.length; index += 1) {
      const item = nextItems[index];
      const { error } = await supabase
        .from("list_items")
        .update({ rank_index: index + 1 })
        .eq("id", item.id)
        .eq("list_id", list.id);
      if (error) return error;
    }
    return null;
  }

  async function applyReorder(nextItems) {
    if (!isOwner || !list) return;
    if (reorderWorking) return;
    const previousItems = items;
    const normalized = nextItems.map((it, index) => ({ ...it, rank_index: index + 1 }));
    setItems(normalized);
    setReorderWorking(true);
    setDragItemId("");
    setDragOverItemId("");

    try {
      const ids = normalized.map((it) => it.id);
      let reorderError = null;
      try {
        const { error } = await supabase.rpc("reorder_list_items", { list_id: list.id, item_ids: ids });
        reorderError = error;
      } catch (error) {
        reorderError = error;
      }

      if (reorderError) {
        if (!list.is_ranked) {
          const fallbackError = await persistReorderWithoutRpc(normalized);
          if (!fallbackError) {
            return;
          }
          setItems(previousItems);
          const details = fallbackError?.message || reorderError?.message || "unknown error";
          setToast(`Couldn’t reorder right now (${details}).`);
          return;
        }

        setItems(previousItems);
        const details = reorderError?.message || "unknown error";
        const hint =
          details.includes("rank_index out of range")
            ? " Run latest social migration SQL in Supabase."
            : "";
        setToast(`Couldn’t reorder right now (${details}).${hint}`);
      }
    } finally {
      setReorderWorking(false);
    }
  }

  function moveItem(itemId, direction) {
    if (reorderWorking) return;
    const index = items.findIndex((it) => it.id === itemId);
    if (index === -1) return;
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    applyReorder(next);
  }

  function handleDragStart(event, itemId) {
    if (!isOwner || reorderWorking || !itemId) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
    setDragItemId(itemId);
    setDragOverItemId(itemId);
  }

  function handleDragOver(event, itemId) {
    if (!isOwner || reorderWorking || !dragItemId || !itemId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (itemId !== dragOverItemId) {
      setDragOverItemId(itemId);
    }
  }

  function handleDrop(event, itemId) {
    if (!isOwner || reorderWorking || !itemId) return;
    event.preventDefault();
    const sourceId = dragItemId || event.dataTransfer.getData("text/plain");
    setDragItemId("");
    setDragOverItemId("");
    const next = reorderItemsByDrop(sourceId, itemId);
    if (next) applyReorder(next);
  }

  function handleDragEnd() {
    setDragItemId("");
    setDragOverItemId("");
  }

  async function removeItem(itemId) {
    if (!isOwner) return;
    if (!itemId) return;
    if (workingItemId) return;
    setWorkingItemId(itemId);
    const { error } = await supabase.from("list_items").delete().eq("id", itemId);
    if (error) {
      setToast("Couldn’t remove item.");
      setWorkingItemId("");
      return;
    }
    const next = items.filter((it) => it.id !== itemId);
    setItems(next);
    if (list?.id && next.length > 0) {
      const { error: reorderError } = await supabase.rpc("reorder_list_items", {
        list_id: list.id,
        item_ids: next.map((it) => it.id),
      });
      if (reorderError) {
        setToast("Removed, but couldn’t reorder.");
      }
    }
    setWorkingItemId("");
  }

  function renderNoteArea(item) {
    const noteValue = item.note || "";
    if (!isOwner) {
      if (!noteValue.trim()) return null;
      return <div className="listItemNoteText">{noteValue}</div>;
    }

    const isExpanded = expandedNotes.has(item.id);
    if (isExpanded) {
      return (
        <textarea
          className="note compact"
          placeholder="Add a note…"
          value={noteValue}
          onChange={(e) => updateLocalItem(item.id, { note: e.target.value })}
          onBlur={() => {
            toggleNoteExpanded(item.id, false);
            saveItemNote(item);
          }}
          disabled={workingItemId === item.id}
        />
      );
    }

    return (
      <button
        className="noteToggle compact"
        type="button"
        onClick={() => toggleNoteExpanded(item.id, true)}
        aria-label={noteValue.trim() ? "Edit note" : "Add note"}
      >
        <IconNote className="noteIcon" />
        <span className="noteToggleText">{noteValue.trim() || "Add note…"}</span>
      </button>
    );
  }

  return (
    <div className="page publicListPage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
      <AppShell
        sidebar={
          <SidebarNav
            brandIcon={<img className="sidebarBrandIcon" src={stashLogo} alt="" aria-hidden="true" />}
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
            title={loadingList ? "List" : listTitle}
            subtitle={handle ? `@${handle}` : "Public list"}
            searchValue=""
            onSearchChange={() => {}}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            actions={
              user ? (
                <Link className="topbarIconBtn" to="/profile" aria-label="Profile">
                  <img className="topbarAvatar" src={userIcon} alt="" aria-hidden="true" />
                </Link>
              ) : (
                <Link className="topbarPill subtle" to="/login">
                  Sign in
                </Link>
              )
            }
          />
        }
        isSidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      >
        {toastMsg && <div className="toast">{toastMsg}</div>}

        {notFound ? (
          <section className="panel p-5 collectionsPanel listPanel fullWidth">
            <div className="collectionsEmpty">
              <div className="collectionsEmptyIcon" aria-hidden="true">
                ?
              </div>
              <div className="collectionsEmptyTitle">List not found</div>
              <div className="collectionsEmptyText">That list isn’t available.</div>
              <div className="navRow">
                <Link className="miniBtn linkBtn" to={handle ? `/@${handle}` : "/"}>
                  {handle ? "Back to profile" : "Back home"}
                </Link>
              </div>
            </div>
          </section>
        ) : loadingList ? (
          <section className="panel p-5 collectionsPanel listPanel fullWidth">
            <div className="muted">Loading list…</div>
          </section>
        ) : (
          <div className="detailCollectionCard publicListDetailCard">
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
            </div>

            <div className="detailCollectionBody">
              <div className="detailHeader hasCover">
                <div className="detailHeaderBar">
                  <Link className="miniBtn linkBtn" to={`/@${handle}`}>
                    ← Profile
                  </Link>
                </div>

                <div className="detailCoverBody">
                  <div className="publicListHeaderTitleRow">
                    <div className="detailCoverTitle">{listTitle}</div>
                    <span className="tripCategory">{sectionLabel(section)}</span>
                    {isOwner ? (
                      <span className={`visibilityPill ${listVisibility}`}>
                        {visibilityLabel(listVisibility)}
                      </span>
                    ) : null}
                  </div>
                  {listSubtitle ? <div className="detailCoverSubtitle">{listSubtitle}</div> : null}

                  <div className="publicListOwnerRow">
                    <Link className="publicListOwnerLink" to={`/@${handle}`}>
                      <span className="publicListOwnerAvatar" aria-hidden="true">
                        {profile?.avatar_url ? (
                          <img src={profile.avatar_url} alt="" />
                        ) : (
                          <span className="publicListOwnerAvatarText">
                            {displayNameForProfile(profile).charAt(0).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="publicListOwnerName">{displayNameForProfile(profile)}</span>
                      {profile?.handle ? <span className="publicListOwnerHandle">@{profile.handle}</span> : null}
                    </Link>
                  </div>

                  <div className="detailCoverMeta">
                    {(items?.length || 0)} item{(items?.length || 0) === 1 ? "" : "s"} · Saved by{" "}
                    {saveCount}
                    {showRank && rankedSize ? ` · Top ${rankedSize}` : ""}
                  </div>
                </div>

                <div className="detailSectionDivider" />

                <div className="publicListHeaderActions">
                  {isOwner && list?.id ? (
                    <Link className="miniBtn" to={`/lists/${list.id}/edit`}>
                      Edit
                    </Link>
                  ) : null}
                  <button
                    className={isSaved ? "miniBtn active" : "miniBtn blue"}
                    type="button"
                    onClick={toggleSave}
                    disabled={saveWorking || checkingSaved}
                  >
                    {checkingSaved ? "…" : saveWorking ? "Working…" : isSaved ? "Saved" : "Save"}
                  </button>
                  {isSaved ? (
                    <button className="miniBtn" type="button" onClick={viewSavedCopy} disabled={saveWorking || checkingSaved}>
                      View in my Stash
                    </button>
                  ) : null}
                  <button className="miniBtn" type="button" onClick={handleShare}>
                    Share
                  </button>
                </div>

                {loadError && <div className="warning">{loadError}</div>}
              </div>

              {loadingItems ? (
                <div className="muted">Loading items…</div>
              ) : items.length === 0 ? (
                <div className="collectionsEmpty">
                  <div className="collectionsEmptyIcon" aria-hidden="true">
                    ✦
                  </div>
                  <div className="collectionsEmptyTitle">No items yet</div>
                  <div className="collectionsEmptyText">This list is empty.</div>
                </div>
              ) : (
                <div className="itemList">
                  {items.map((item, index) => {
                    const title = item.title_snapshot || item.url || "Saved link";
                    const domain = item.domain_snapshot || getDomain(item.url || "");
                    const rating = formatRating(item.rating_snapshot);
                    const chips = buildMetaChips(item);
                    const imgUrl = resolveListItemImage(item);
                    const canMoveUp = isOwner && index > 0 && !reorderWorking;
                    const canMoveDown = isOwner && index < items.length - 1 && !reorderWorking;
                    return (
                      <div
                        key={item.id}
                        className={`itemCard publicListItemCard ${dragItemId === item.id ? "isDragSource" : ""} ${
                          dragOverItemId === item.id && dragItemId !== item.id ? "isDragOver" : ""
                        }`}
                        onDragOver={(event) => handleDragOver(event, item.id)}
                        onDrop={(event) => handleDrop(event, item.id)}
                      >
                        <div className="itemTop">
                          <div className="listItemLead">
                            {showRank ? <div className="rankBadge">{item.rank_index}</div> : null}
                            <div className="listItemThumb" aria-hidden="true">
                              {imgUrl ? <img src={imgUrl} alt="" loading="lazy" /> : <div className="listItemThumbFallback" />}
                            </div>
                          </div>

                          <div className="itemHeaderRow">
                            <div className="itemTitleBlock">
                              <div className="itemTitleRow">
                                <a
                                  className="itemTitleLink titleClampFade"
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={title}
                                >
                                  {title}
                                </a>
                                {domain ? <span className="domainPill">{domain}</span> : null}
                                {rating ? <span className="ratingPill">⭐ {rating}</span> : null}
                              </div>

                              {chips.length > 0 && (
                                <div className="itemMetaRow">
                                  <div className="metaChips">
                                    {chips.map((chip) => (
                                      <span key={chip} className="metaChip">
                                        {chip}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="itemActions itemActionsTop">
                              <a
                                className="iconBtn bare quickActionBtn"
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Open link"
                              >
                                <IconExternal className="quickActionIcon" />
                              </a>
                              <button
                                className="iconBtn bare quickActionBtn"
                                type="button"
                                onClick={() => handleCopyItem(item.url)}
                                aria-label="Copy link"
                              >
                                <IconCopy className="quickActionIcon" />
                              </button>

                              {isOwner ? (
                                <>
                                  <button
                                    className="iconBtn bare quickActionBtn dragHandleBtn"
                                    type="button"
                                    draggable={!reorderWorking}
                                    onDragStart={(event) => handleDragStart(event, item.id)}
                                    onDragEnd={handleDragEnd}
                                    aria-label="Drag to reorder"
                                    title="Drag to reorder"
                                    disabled={reorderWorking}
                                  >
                                    <IconGrip className="quickActionIcon" />
                                  </button>
                                  <button
                                    className="iconBtn bare quickActionBtn"
                                    type="button"
                                    onClick={() => moveItem(item.id, -1)}
                                    aria-label="Move up"
                                    disabled={!canMoveUp}
                                  >
                                    <IconArrowUp className="quickActionIcon" />
                                  </button>
                                  <button
                                    className="iconBtn bare quickActionBtn"
                                    type="button"
                                    onClick={() => moveItem(item.id, 1)}
                                    aria-label="Move down"
                                    disabled={!canMoveDown}
                                  >
                                    <IconArrowDown className="quickActionIcon" />
                                  </button>
                                  <button
                                    className="iconBtn bare quickActionBtn danger"
                                    type="button"
                                    onClick={() => removeItem(item.id)}
                                    aria-label="Remove item"
                                    disabled={!!workingItemId}
                                  >
                                    <IconTrash className="quickActionIcon" />
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {renderNoteArea(item)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </AppShell>
    </div>
  );
}
