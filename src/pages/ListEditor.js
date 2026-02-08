import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import { isValidHandle, normalizeHandle, normalizeListVisibility, normalizeSection, slugify } from "../lib/social";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import stashLogo from "../assets/icons/stash-favicon.png";
import userIcon from "../assets/icons/user.png";

const SECTION_OPTIONS = [
  { value: "general", label: "General" },
  { value: "travel", label: "Travel" },
  { value: "fashion", label: "Fashion" },
];

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private" },
  { value: "unlisted", label: "Unlisted" },
  { value: "public", label: "Public" },
];

function sectionLabel(section = "") {
  const normalized = String(section || "").toLowerCase();
  if (normalized === "travel") return "Travel";
  if (normalized === "fashion") return "Fashion";
  return "General";
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

function normalizeUrl(input = "") {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(raw)) return `https://${raw}`;
  return raw;
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

function IconCopy(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <rect x="9" y="9" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="4" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" />
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

export default function ListEditor() {
  const params = useParams();
  const listId = params.id || "";
  const isEditMode = !!listId;

  const { user, loading: authLoading } = useAuth();
  const viewerUserId = user?.id || null;
  const { trips } = useTrips();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [handleInput, setHandleInput] = useState("");
  const [savingHandle, setSavingHandle] = useState(false);
  const [handleError, setHandleError] = useState("");

  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [section, setSection] = useState("general");
  const [visibility, setVisibility] = useState("private");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [isRanked, setIsRanked] = useState(false);
  const [rankedSize, setRankedSize] = useState(5);
  const [pinnedOrder, setPinnedOrder] = useState("");

  const [savingMeta, setSavingMeta] = useState(false);
  const [metaError, setMetaError] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [coverLoaded, setCoverLoaded] = useState(false);

  const [urlInput, setUrlInput] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [addUrlError, setAddUrlError] = useState("");

  const [stashModalOpen, setStashModalOpen] = useState(false);
  const [stashSearch, setStashSearch] = useState("");
  const [stashSelected, setStashSelected] = useState(new Set());
  const [addingFromStash, setAddingFromStash] = useState(false);

  const [expandedNotes, setExpandedNotes] = useState(new Set());
  const [reorderWorking, setReorderWorking] = useState(false);
  const [workingItemId, setWorkingItemId] = useState("");
  const [dragItemId, setDragItemId] = useState("");
  const [dragOverItemId, setDragOverItemId] = useState("");
  const coverLoadKeyRef = useRef("");

  const categoryCounts = useMemo(
    () =>
      ["general", "travel", "fashion"].reduce((acc, category) => {
        acc[category] = trips.filter((trip) => (trip.type || "general") === category).length;
        return acc;
      }, {}),
    [trips]
  );

  const slugPreview = useMemo(() => slugify(title || ""), [title]);

  const shareHandle = normalizeHandle(profile?.handle || "");
  const listSlug = list?.slug || "";
  const sharePath = shareHandle && listSlug ? `/@${shareHandle}/${listSlug}` : "";

  const hasPublishVisibility = visibility === "public" || visibility === "unlisted";
  const profileIsPublic = profile?.is_public !== false;
  const publishWarning =
    hasPublishVisibility && profile && !profileIsPublic
      ? "Your profile is private. Public/unlisted lists won’t be visible to others until your profile is public."
      : "";

  const rankLimit = isRanked ? (rankedSize === 10 ? 10 : 5) : null;
  const rankRemaining = rankLimit != null ? Math.max(0, rankLimit - items.length) : null;

  const stashItems = useMemo(() => {
    const flattened = trips.flatMap((trip) =>
      (trip.items || []).map((item) => ({
        ...item,
        tripId: trip.id,
        tripName: trip.name,
        tripType: trip.type,
      }))
    );
    return flattened.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }, [trips]);

  const filteredStashItems = useMemo(() => {
    const query = stashSearch.trim().toLowerCase();
    if (!query) return stashItems.slice(0, 80);
    return stashItems
      .filter((item) => {
        const titleText = (item.title || "").toLowerCase();
        const urlText = (item.airbnbUrl || item.url || "").toLowerCase();
        const domainText = (item.domain || "").toLowerCase();
        const tripText = (item.tripName || "").toLowerCase();
        return (
          titleText.includes(query) ||
          urlText.includes(query) ||
          domainText.includes(query) ||
          tripText.includes(query)
        );
      })
      .slice(0, 80);
  }, [stashItems, stashSearch]);

  function setToast(message) {
    setToastMsg(message);
    setTimeout(() => setToastMsg(""), 1500);
  }

  function resetFormFromList(data) {
    setTitle(data?.title || "");
    setSubtitle(data?.subtitle || "");
    setSection(normalizeSection(data?.section || "general"));
    setVisibility(normalizeListVisibility(data?.visibility || "private"));
    setCoverImageUrl(data?.cover_image_url || "");
    setIsRanked(!!data?.is_ranked);
    setRankedSize(data?.ranked_size === 10 ? 10 : 5);
    setPinnedOrder(data?.pinned_order != null ? String(data.pinned_order) : "");
  }

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setLoadingProfile(true);
    setProfile(null);
    setHandleError("");
    setSavingHandle(false);
    setHandleInput("");

    async function loadProfile() {
      if (!viewerUserId) {
        if (!active) return;
        setLoadingProfile(false);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id,handle,display_name,avatar_url,is_public")
        .eq("id", viewerUserId)
        .single();

      if (!active) return;
      if (!error && data) {
        setProfile(data);
        setHandleInput(data.handle || "");
      }
      setLoadingProfile(false);
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [authLoading, viewerUserId]);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setNotFound(false);
    setLoadError("");
    setMetaError("");
    setToastMsg("");
    setItems([]);
    setExpandedNotes(new Set());
    setReorderWorking(false);
    setWorkingItemId("");
    setCoverLoaded(false);
    coverLoadKeyRef.current = "";

    if (!viewerUserId) {
      setList(null);
      setLoadingList(false);
      setLoadingItems(false);
      return () => {
        active = false;
      };
    }

    if (!isEditMode) {
      setList(null);
      resetFormFromList({
        title: "",
        subtitle: "",
        section: "general",
        visibility: "private",
        cover_image_url: "",
        is_ranked: false,
        ranked_size: null,
        pinned_order: null,
      });
      setLoadingList(false);
      setLoadingItems(false);
      return () => {
        active = false;
      };
    }

    setLoadingList(true);
    setLoadingItems(true);

    async function loadListAndItems() {
      const { data: listData, error: listError } = await supabase
        .from("lists")
        .select(
          "id,owner_user_id,section,title,subtitle,slug,cover_image_url,visibility,is_ranked,ranked_size,pinned_order,save_count,view_count,created_at,updated_at"
        )
        .eq("id", listId)
        .single();

      if (!active) return;
      if (listError || !listData) {
        setNotFound(true);
        setList(null);
        setLoadingList(false);
        setLoadingItems(false);
        return;
      }

      if (listData.owner_user_id !== viewerUserId) {
        setNotFound(true);
        setList(null);
        setLoadingList(false);
        setLoadingItems(false);
        return;
      }

      setList(listData);
      resetFormFromList(listData);
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
        setLoadError("Could not load items right now.");
        setItems([]);
      } else {
        setItems(itemsData || []);
      }
      setLoadingItems(false);
    }

    loadListAndItems();
    return () => {
      active = false;
    };
  }, [authLoading, viewerUserId, isEditMode, listId]);

  async function saveHandle() {
    if (!viewerUserId) {
      navigate("/login");
      return;
    }
    if (savingHandle) return;
    const normalized = normalizeHandle(handleInput || "");
    setHandleError("");
    if (normalized && !isValidHandle(normalized)) {
      setHandleError("Handle must be 3–24 chars: lowercase letters, numbers, underscore.");
      return;
    }

    setSavingHandle(true);
    const { error } = await supabase
      .from("profiles")
      .update({ handle: normalized || null })
      .eq("id", viewerUserId);
    if (error) {
      setHandleError("Could not save handle. Try another.");
      setSavingHandle(false);
      return;
    }
    setProfile((prev) => (prev ? { ...prev, handle: normalized || null } : prev));
    setSavingHandle(false);
    setToast("Saved");
  }

  async function generateUniqueSlug(baseSlug) {
    const base = String(baseSlug || "").trim();
    if (!base) return "";
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const { data, error } = await supabase
        .from("lists")
        .select("id")
        .eq("owner_user_id", viewerUserId)
        .eq("slug", candidate)
        .limit(1);
      if (error) return candidate;
      if (!data || data.length === 0) return candidate;
    }
    return `${base}-${Date.now().toString(36).slice(2, 6)}`;
  }

  async function createList() {
    if (!viewerUserId) {
      navigate("/login");
      return;
    }
    if (savingMeta) return;
    setMetaError("");
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setMetaError("Title is required.");
      return;
    }
    const baseSlug = slugify(trimmedTitle);
    if (!baseSlug) {
      setMetaError("Title needs at least one letter or number to generate a slug.");
      return;
    }

    const normalizedSection = normalizeSection(section);
    const normalizedVisibility = normalizeListVisibility(visibility);
    const ranked = !!isRanked;
    const rankedLimit = ranked ? (rankedSize === 10 ? 10 : 5) : null;

    setSavingMeta(true);
    const uniqueSlug = await generateUniqueSlug(baseSlug);
    const payload = {
      title: trimmedTitle,
      subtitle: subtitle.trim() || null,
      section: normalizedSection,
      visibility: normalizedVisibility,
      slug: uniqueSlug,
      cover_image_url: coverImageUrl.trim() || null,
      is_ranked: ranked,
      ranked_size: ranked ? rankedLimit : null,
    };

    const { data, error } = await supabase
      .from("lists")
      .insert(payload)
      .select(
        "id,owner_user_id,section,title,subtitle,slug,cover_image_url,visibility,is_ranked,ranked_size,pinned_order,save_count,view_count,created_at,updated_at"
      )
      .single();

    if (error || !data) {
      setMetaError("Could not create list right now.");
      setSavingMeta(false);
      return;
    }

    setSavingMeta(false);
    navigate(`/lists/${data.id}/edit`, { replace: true });
  }

  async function setPinnedOrderSafely(nextPinned) {
    if (!list?.id) return true;
    const desired = nextPinned != null ? Number(nextPinned) : null;
    const current = list.pinned_order != null ? Number(list.pinned_order) : null;
    if (desired === current) return true;

    if (desired == null) {
      const { error } = await supabase.from("lists").update({ pinned_order: null }).eq("id", list.id);
      if (error) return false;
      setList((prev) => (prev ? { ...prev, pinned_order: null } : prev));
      return true;
    }

    const { data: existing } = await supabase
      .from("lists")
      .select("id,pinned_order")
      .eq("owner_user_id", viewerUserId)
      .eq("pinned_order", desired)
      .neq("id", list.id)
      .limit(1);

    const other = (existing || [])[0] || null;

    const { error: clearError } = await supabase.from("lists").update({ pinned_order: null }).eq("id", list.id);
    if (clearError) return false;

    if (other) {
      const { error: otherError } = await supabase
        .from("lists")
        .update({ pinned_order: current })
        .eq("id", other.id);
      if (otherError) return false;
    }

    const { error: setError } = await supabase
      .from("lists")
      .update({ pinned_order: desired })
      .eq("id", list.id);
    if (setError) return false;

    setList((prev) => (prev ? { ...prev, pinned_order: desired } : prev));
    return true;
  }

  async function saveListMeta() {
    if (!list?.id) return;
    if (savingMeta) return;
    setMetaError("");
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setMetaError("Title is required.");
      return;
    }

    const normalizedSection = normalizeSection(section);
    const normalizedVisibility = normalizeListVisibility(visibility);
    const ranked = !!isRanked;
    const rankedLimit = ranked ? (rankedSize === 10 ? 10 : 5) : null;

    if (ranked && items.length > (rankedLimit || 0)) {
      setMetaError(`Ranked lists can have up to ${rankedLimit} items. Remove ${items.length - rankedLimit} first.`);
      return;
    }

    setSavingMeta(true);

    const { error } = await supabase
      .from("lists")
      .update({
        title: trimmedTitle,
        subtitle: subtitle.trim() || null,
        section: normalizedSection,
        visibility: normalizedVisibility,
        cover_image_url: coverImageUrl.trim() || null,
        is_ranked: ranked,
        ranked_size: ranked ? rankedLimit : null,
      })
      .eq("id", list.id);

    if (error) {
      setMetaError("Could not save changes right now.");
      setSavingMeta(false);
      return;
    }

    const pinnedValue = pinnedOrder ? Number(pinnedOrder) : null;
    const pinnedOk = await setPinnedOrderSafely(pinnedValue);
    if (!pinnedOk) {
      setMetaError("Saved, but couldn’t update pin state.");
      setSavingMeta(false);
      return;
    }

    if (ranked && items.length > 1) {
      await supabase.rpc("reorder_list_items", {
        list_id: list.id,
        item_ids: items.map((it) => it.id),
      });
    }

    setList((prev) =>
      prev
        ? {
            ...prev,
            title: trimmedTitle,
            subtitle: subtitle.trim() || null,
            section: normalizedSection,
            visibility: normalizedVisibility,
            cover_image_url: coverImageUrl.trim() || null,
            is_ranked: ranked,
            ranked_size: ranked ? rankedLimit : null,
          }
        : prev
    );
    setSavingMeta(false);
    setToast("Saved");
  }

  function toggleNoteExpanded(itemId, expanded) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (expanded) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
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

  async function saveItemNote(item) {
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

  function renderNoteArea(item) {
    const noteValue = item.note || "";
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
    if (!list?.id) return;
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
    if (reorderWorking || !itemId) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
    setDragItemId(itemId);
    setDragOverItemId(itemId);
  }

  function handleDragOver(event, itemId) {
    if (reorderWorking || !dragItemId || !itemId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (itemId !== dragOverItemId) {
      setDragOverItemId(itemId);
    }
  }

  function handleDrop(event, itemId) {
    if (reorderWorking || !itemId) return;
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
    if (list?.id && next.length > 1) {
      await supabase.rpc("reorder_list_items", { list_id: list.id, item_ids: next.map((it) => it.id) });
    }
    setWorkingItemId("");
  }

  async function addUrlItem() {
    if (!list?.id) return;
    if (addingUrl) return;
    setAddUrlError("");
    const cleaned = normalizeUrl(urlInput);
    if (!cleaned) {
      setAddUrlError("Paste a URL first.");
      return;
    }

    let parsed;
    try {
      parsed = new URL(cleaned);
    } catch {
      setAddUrlError("That doesn’t look like a valid URL.");
      return;
    }
    if (!/^https?:$/i.test(parsed.protocol)) {
      setAddUrlError("Only http/https URLs are supported.");
      return;
    }

    if (rankLimit != null && items.length >= rankLimit) {
      setAddUrlError(`This ranked list is full (Top ${rankLimit}).`);
      return;
    }

    const url = parsed.toString();
    const already = items.some((it) => (it.url || "").trim() === url);
    if (already) {
      setAddUrlError("That link is already in this list.");
      return;
    }

    const domain = getDomain(url);
    const fallbackTitle = domain || "Saved link";
    const nextRank = items.length + 1;

    setAddingUrl(true);
    const { data, error } = await supabase
      .from("list_items")
      .insert({
        list_id: list.id,
        url,
        title_snapshot: fallbackTitle,
        image_snapshot: null,
        domain_snapshot: domain || null,
        meta_json: {},
        rank_index: nextRank,
        note: null,
      })
      .select(
        "id,list_id,item_id,url,title_snapshot,image_snapshot,domain_snapshot,price_snapshot,rating_snapshot,meta_json,rank_index,note,created_at"
      )
      .single();

    if (error || !data) {
      setAddUrlError("Could not add that link right now.");
      setAddingUrl(false);
      return;
    }

    setItems((prev) => [...prev, data]);
    setUrlInput("");
    setAddingUrl(false);

    const endpoint = url.includes("airbnb.") ? "/fetch-airbnb-title" : "/fetch-title";
    fetchTitleWithTimeout(endpoint, url, 2800).then(async (foundTitle) => {
      const decoded = decodeHtmlEntities(foundTitle || "").trim();
      if (!decoded || decoded === fallbackTitle) return;
      await supabase.from("list_items").update({ title_snapshot: decoded }).eq("id", data.id);
      setItems((prev) => prev.map((it) => (it.id === data.id ? { ...it, title_snapshot: decoded } : it)));
    });
  }

  async function addSelectedFromStash() {
    if (!list?.id) return;
    if (addingFromStash) return;
    const selectedIds = Array.from(stashSelected);
    if (selectedIds.length === 0) {
      setToast("Select at least one item.");
      return;
    }

    const existingUrls = new Set(items.map((it) => (it.url || "").trim()).filter(Boolean));
    let toAdd = stashItems
      .filter((it) => selectedIds.includes(it.id))
      .map((it) => ({
        id: it.id,
        url: it.airbnbUrl || it.url || "",
        title: it.title || "",
        imageUrl: it.imageUrl || "",
        domain: it.domain || getDomain(it.airbnbUrl || it.url || ""),
        meta: it.metadata || {},
        note: it.note || "",
      }))
      .filter((it) => it.url && !existingUrls.has(it.url.trim()));

    if (rankLimit != null) {
      toAdd = toAdd.slice(0, Math.max(0, rankLimit - items.length));
    }

    if (toAdd.length === 0) {
      setToast(rankLimit != null && items.length >= rankLimit ? `This ranked list is full.` : "Nothing new to add.");
      return;
    }

    setAddingFromStash(true);
    const inserted = [];
    for (let i = 0; i < toAdd.length; i += 1) {
      const it = toAdd[i];
      const nextRank = items.length + inserted.length + 1;
      const { data, error } = await supabase
        .from("list_items")
        .insert({
          list_id: list.id,
          item_id: it.id,
          url: it.url,
          title_snapshot: it.title || it.domain || "Saved link",
          image_snapshot: it.imageUrl || null,
          domain_snapshot: it.domain || null,
          meta_json: it.meta || {},
          rank_index: nextRank,
          note: it.note.trim() ? it.note : null,
        })
        .select(
          "id,list_id,item_id,url,title_snapshot,image_snapshot,domain_snapshot,price_snapshot,rating_snapshot,meta_json,rank_index,note,created_at"
        )
        .single();
      if (error || !data) continue;
      inserted.push(data);
    }

    if (inserted.length > 0) {
      setItems((prev) => [...prev, ...inserted]);
      setToast(`Added ${inserted.length}`);
    } else {
      setToast("Couldn’t add items right now.");
    }

    setAddingFromStash(false);
    setStashSelected(new Set());
    setStashModalOpen(false);
  }

  const coverSeed = useMemo(() => `${list?.id || "new"}-${title || ""}`, [list?.id, title]);
  const fallbackGradient = useMemo(() => makeCoverGradient(coverSeed), [coverSeed]);
  const resolvedCoverUrl = coverImageUrl || "";
  const isGradientCover =
    (resolvedCoverUrl || "").startsWith("linear-gradient") || (resolvedCoverUrl || "").startsWith("radial-gradient");
  const isImageCover = !!resolvedCoverUrl && !isGradientCover && !(resolvedCoverUrl || "").startsWith("data:");
  const coverBackground = isGradientCover && resolvedCoverUrl ? resolvedCoverUrl : fallbackGradient;

  async function handleCopy(url) {
    if (!url) return;
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(url);
      setToast("Copied!");
    } catch {
      setToast("Couldn’t copy link.");
    }
  }

  return (
    <div className="page listEditorPage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
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
            title={isEditMode ? "Edit list" : "New list"}
            subtitle={isEditMode ? (list?.title ? list.title : "List editor") : "Create a public list"}
            searchValue=""
            onSearchChange={() => {}}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            actions={
              viewerUserId ? (
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

        <section className="panel p-5 collectionsPanel listPanel fullWidth">
          {notFound ? (
            <div className="collectionsEmpty">
              <div className="collectionsEmptyIcon" aria-hidden="true">
                ?
              </div>
              <div className="collectionsEmptyTitle">List not found</div>
              <div className="collectionsEmptyText">You may not have access to that list.</div>
              <div className="navRow">
                <Link className="miniBtn linkBtn" to="/lists">
                  Back to lists
                </Link>
              </div>
            </div>
          ) : (
            loadingList ? (
              <div className="panelContent">
                <div className="muted">Loading list…</div>
              </div>
            ) :
            <div className="panelContent">
              <div className="listHeaderRow">
                <div className="listTitleRow">
                  <div className="listTitle">{isEditMode ? "List settings" : "Create list"}</div>
                </div>
                <div className="listHeaderActions">
                  <Link className="miniBtn linkBtn" to="/lists">
                    ← Lists
                  </Link>
                </div>
              </div>

              {loadError && <div className="warning">{loadError}</div>}

              <div
                className={`detailCoverMedia ${coverLoaded ? "isLoaded" : ""}`}
                style={{ backgroundImage: coverBackground }}
              >
                {isImageCover && (
                  <img
                    className="detailCoverImage"
                    src={resolvedCoverUrl}
                    alt=""
                    loading="lazy"
                    onLoad={() => {
                      setCoverLoaded(true);
                    }}
                    onError={() => {
                      setCoverLoaded(true);
                    }}
                  />
                )}
                <div className="detailCoverOverlay" aria-hidden="true" />
              </div>

              {viewerUserId && !loadingProfile && profile && !profile.handle && (
                <div className="focusBanner">
                  <div>
                    <div className="listTitle">Pick your handle</div>
                    <div className="muted">
                      You’ll share lists at <strong>/@handle/slug</strong>.
                    </div>
                  </div>
                  <div className="listEditorHandleRow">
                    <input
                      className="input small"
                      value={handleInput}
                      placeholder="your_handle"
                      onChange={(e) => setHandleInput(e.target.value)}
                      disabled={savingHandle}
                    />
                    <button className="miniBtn blue" type="button" onClick={saveHandle} disabled={savingHandle}>
                      {savingHandle ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
              {handleError && <div className="warning">{handleError}</div>}
              {publishWarning && <div className="warning">{publishWarning}</div>}

              <div className="createTripForm listEditorForm">
                <div className="fieldGroup">
                  <div className="fieldLabel">Title</div>
                  <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
                </div>

                <div className="fieldGroup">
                  <div className="fieldLabel">Subtitle</div>
                  <input
                    className="input"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    maxLength={120}
                    placeholder="Optional"
                  />
                </div>

                <div className="fieldGroup">
                  <div className="fieldLabel">Section</div>
                  <select className="select" value={section} onChange={(e) => setSection(e.target.value)}>
                    {SECTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="fieldGroup">
                  <div className="fieldLabel">Visibility</div>
                  <select className="select" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                    {VISIBILITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div className="fieldHelp">
                    Private = only you · Unlisted = share link only · Public = shown on your profile
                  </div>
                </div>

                <div className="fieldGroup">
                  <div className="fieldLabel">Ranked mode</div>
                  <label className="miniToggle">
                    <input type="checkbox" checked={isRanked} onChange={(e) => setIsRanked(e.target.checked)} />
                    Top list
                  </label>
                  {isRanked && (
                    <div className="listEditorRankRow">
                      <label className="miniToggle">
                        <input
                          type="radio"
                          checked={rankedSize === 5}
                          onChange={() => setRankedSize(5)}
                        />
                        Top 5
                      </label>
                      <label className="miniToggle">
                        <input
                          type="radio"
                          checked={rankedSize === 10}
                          onChange={() => setRankedSize(10)}
                        />
                        Top 10
                      </label>
                      {rankRemaining != null && (
                        <div className="fieldHelp">
                          {rankRemaining} slot{rankRemaining === 1 ? "" : "s"} left
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="fieldGroup">
                  <div className="fieldLabel">Cover image URL</div>
                  <input
                    className="input"
                    value={coverImageUrl}
                    onChange={(e) => setCoverImageUrl(e.target.value)}
                    placeholder="Optional (image URL or CSS gradient)"
                  />
                </div>

                {isEditMode ? (
                  <div className="fieldGroup">
                    <div className="fieldLabel">Pinned on profile</div>
                    <select className="select" value={pinnedOrder} onChange={(e) => setPinnedOrder(e.target.value)}>
                      <option value="">Not pinned</option>
                      <option value="1">Pinned #1</option>
                      <option value="2">Pinned #2</option>
                      <option value="3">Pinned #3</option>
                    </select>
                  </div>
                ) : null}

                <div className="fieldGroup">
                  <div className="fieldLabel">Slug</div>
                  <div className="shareLinkValue">{isEditMode ? list?.slug : slugPreview || "—"}</div>
                  <div className="fieldHelp">Auto-generated from title. Slug stays stable after creation.</div>
                </div>

                {metaError && <div className="fieldError">{metaError}</div>}

                <div className="listEditorActions">
                  {!isEditMode ? (
                    <button className="primary-btn createTripBtn" type="button" onClick={createList} disabled={savingMeta}>
                      {savingMeta ? "Creating…" : "Create list"}
                    </button>
                  ) : (
                    <button className="primary-btn createTripBtn" type="button" onClick={saveListMeta} disabled={savingMeta}>
                      {savingMeta ? "Saving…" : "Save changes"}
                    </button>
                  )}
                  {isEditMode && sharePath ? (
                    <Link className="secondary-btn linkBtn" to={sharePath}>
                      View public page
                    </Link>
                  ) : null}
                </div>
              </div>

              {isEditMode ? (
                <>
                  <div className="detailSectionDivider" />

                  <div className="listHeaderRow">
                    <div className="listTitleRow">
                      <div className="listTitle">Items</div>
                      {rankLimit != null ? (
                        <span className="listCountBadge">
                          {items.length}/{rankLimit}
                        </span>
                      ) : null}
                    </div>
                    <div className="listHeaderActions">
                      <button className="miniBtn" type="button" onClick={() => setStashModalOpen(true)}>
                        Add from Stash
                      </button>
                    </div>
                  </div>

                  <div className="saveRow listEditorAddRow">
                    <input
                      className="input"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="Paste URL…"
                      disabled={addingUrl}
                    />
                    <button className="primary-btn createTripBtn" type="button" onClick={addUrlItem} disabled={addingUrl}>
                      {addingUrl ? "Adding…" : "Add"}
                    </button>
                  </div>
                  {addUrlError && <div className="fieldError">{addUrlError}</div>}

                  {loadingItems ? (
                    <div className="collectionsGrid">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="publicListSkeleton" />
                      ))}
                    </div>
                  ) : items.length === 0 ? (
                    <div className="collectionsEmpty">
                      <div className="collectionsEmptyIcon" aria-hidden="true">
                        ✦
                      </div>
                      <div className="collectionsEmptyTitle">No items yet</div>
                      <div className="collectionsEmptyText">Add a link to start building this list.</div>
                    </div>
                  ) : (
                    <div className="itemList">
                      {items.map((item, index) => {
                        const titleText = item.title_snapshot || item.url || "Saved link";
                        const domainText = item.domain_snapshot || getDomain(item.url || "");
                        const imgUrl = item.image_snapshot || "";
                        const canMoveUp = index > 0 && !reorderWorking;
                        const canMoveDown = index < items.length - 1 && !reorderWorking;

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
                                {isRanked ? <div className="rankBadge">{item.rank_index}</div> : null}
                                <div className="listItemThumb" aria-hidden="true">
                                  {imgUrl ? (
                                    <img src={imgUrl} alt="" loading="lazy" />
                                  ) : (
                                    <div className="listItemThumbFallback" />
                                  )}
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
                                      title={titleText}
                                    >
                                      {titleText}
                                    </a>
                                    {domainText ? <span className="domainPill">{domainText}</span> : null}
                                  </div>
                                </div>

                                <div className="itemActions itemActionsTop">
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
                                    onClick={() => handleCopy(item.url)}
                                    aria-label="Copy link"
                                  >
                                    <IconCopy className="quickActionIcon" />
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
                                </div>
                              </div>
                            </div>

                            {renderNoteArea(item)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </section>
      </AppShell>

      {stashModalOpen && (
        <div className="shareOverlay" role="dialog" aria-modal="true" onClick={() => setStashModalOpen(false)}>
          <div className="shareModal" onClick={(e) => e.stopPropagation()}>
            <div className="shareModalHeader">
              <div>
                <div className="shareModalTitle">Add from your Stash</div>
                <div className="shareModalSubtitle">Select saved links to copy into this list.</div>
              </div>
              <button className="shareModalClose" type="button" aria-label="Close" onClick={() => setStashModalOpen(false)}>
                ×
              </button>
            </div>

            <div className="fieldGroup">
              <div className="fieldLabel">Search</div>
              <input className="input" value={stashSearch} onChange={(e) => setStashSearch(e.target.value)} placeholder="Search title, URL, domain, collection…" />
              <div className="fieldHelp">
                {rankLimit != null ? `Top ${rankLimit} list · ${Math.max(0, rankLimit - items.length)} slots left` : "Adds to the end of your list"}
              </div>
            </div>

            <div className="previewList">
              {filteredStashItems.map((it) => {
                const url = it.airbnbUrl || it.url || "";
                const titleText = it.title || url || "Saved link";
                const checked = stashSelected.has(it.id);
                const disabled =
                  rankLimit != null &&
                  !checked &&
                  stashSelected.size >= Math.max(0, rankLimit - items.length);
                return (
                  <div key={it.id} className={`previewItem ${disabled ? "invalid" : ""}`}>
                    <label className="previewCheckbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled || addingFromStash}
                        onChange={() =>
                          setStashSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(it.id)) next.delete(it.id);
                            else next.add(it.id);
                            return next;
                          })
                        }
                      />
                    </label>
                    <div className="previewItemMeta">
                      <div className="previewItemTitle">{titleText}</div>
                      <div className="previewItemUrl">
                        {(it.domain || getDomain(url) || "link").toString()} · {it.tripName || "Collection"}
                      </div>
                    </div>
                    <div className="previewBadge duplicate">{sectionLabel(it.tripType || "")}</div>
                  </div>
                );
              })}
            </div>

            <div className="shareModalActions">
              <button className="primary-btn createTripBtn" type="button" onClick={addSelectedFromStash} disabled={addingFromStash}>
                {addingFromStash ? "Adding…" : `Add selected (${stashSelected.size})`}
              </button>
              <button className="secondary-btn" type="button" onClick={() => setStashModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
