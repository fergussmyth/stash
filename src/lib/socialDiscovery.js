import { supabase } from "./supabaseClient";
import { mapCollectionRow, normalizeCollectionVisibility } from "./publishedCollections";

const TRIP_SELECT =
  "id,owner_id,name,type,subtitle,visibility,public_slug,published_at,is_ranked,ranked_size,cover_image_url,save_count,view_count,last_saved_at,last_viewed_at,created_at,updated_at,source_list_id";

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

function normalizeSection(input = "") {
  const normalized = String(input || "").trim().toLowerCase();
  if (normalized === "travel" || normalized === "fashion" || normalized === "general") {
    return normalized;
  }
  return "general";
}

function extractImageFromMeta(meta) {
  const parsed = parseMetaObject(meta);
  if (!parsed || typeof parsed !== "object") return "";

  const direct = firstNonEmpty([
    parsed.image,
    parsed.image_url,
    parsed.imageUrl,
    parsed.imageURL,
    parsed.preview_image,
    parsed.previewImage,
    parsed.heroImageUrl,
    parsed.og_image,
    parsed.ogImage,
    parsed.thumbnail,
    parsed.thumbnail_url,
    parsed.thumbnailUrl,
    parsed.photo,
    parsed.photo_url,
    parsed.photoUrl,
    parsed.hero_image,
    parsed.heroImage,
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

function resolveTripItemPreviewImage(row) {
  const imageUrl = String(row?.image_url || "").trim();
  if (imageUrl) return imageUrl;

  const metaImage = extractImageFromMeta(row?.metadata);
  if (metaImage) return metaImage;
  const favicon = String(row?.favicon_url || "").trim();
  if (favicon) return favicon;
  return "";
}

async function fetchCollectionPreviewImageMap(tripIds = []) {
  const ids = [...new Set((tripIds || []).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;

  const { data, error } = await supabase
    .from("trip_items")
    .select("trip_id,image_url,favicon_url,metadata,added_at")
    .in("trip_id", ids)
    .order("trip_id", { ascending: true })
    .order("added_at", { ascending: false });

  if (error || !Array.isArray(data)) return map;

  for (const row of data) {
    const tripId = row?.trip_id;
    if (!tripId || map.has(tripId)) continue;
    const image = resolveTripItemPreviewImage(row);
    if (!image) continue;
    map.set(tripId, image);
  }

  return map;
}

export async function hydrateListPreviewImages(rows = []) {
  const listRows = Array.isArray(rows) ? rows : [];
  if (!listRows.length) return listRows;

  const targetIds = listRows
    .filter((row) => !String(row?.cover_image_url || "").trim())
    .map((row) => row?.id)
    .filter(Boolean);

  if (!targetIds.length) return listRows;

  const previewMap = await fetchCollectionPreviewImageMap(targetIds);
  if (!previewMap.size) return listRows;

  return listRows.map((row) => {
    const existingCover = String(row?.cover_image_url || "").trim();
    if (existingCover) return row;
    const preview = previewMap.get(row?.id) || "";
    if (!preview) return row;
    return { ...row, preview_image_url: preview };
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSectionFilter(section = "") {
  const normalized = String(section || "").trim().toLowerCase();
  if (normalized === "travel" || normalized === "fashion" || normalized === "general") {
    return normalized;
  }
  return null;
}

function normalizeSearchTerm(search = "") {
  return String(search || "").trim().toLowerCase();
}

function dedupeById(rows = []) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    deduped.push(row);
  }
  return deduped;
}

function parseDateMs(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fallbackTrendingScore(collection) {
  const saves = Number(collection?.save_count || 0);
  const views = Number(collection?.view_count || 0);
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const lastSavedAtMs = parseDateMs(collection?.last_saved_at);
  const lastViewedAtMs = parseDateMs(collection?.last_viewed_at);

  let score = saves * 3 + views;
  if (lastSavedAtMs && now - lastSavedAtMs <= sevenDaysMs) {
    score += Math.max(2, Math.round(Math.sqrt(saves + 1)));
  }
  if (lastViewedAtMs && now - lastViewedAtMs <= sevenDaysMs) {
    score += Math.max(1, Math.round(Math.sqrt(views + 1) * 0.5));
  }
  return score;
}

async function fetchProfilesMap(ownerIds = []) {
  const uniqueOwnerIds = [...new Set(ownerIds.filter(Boolean))];
  if (!uniqueOwnerIds.length) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("id,handle,display_name,avatar_url,is_public")
    .in("id", uniqueOwnerIds);

  if (error || !data) return new Map();

  const map = new Map();
  for (const profile of data) {
    map.set(profile.id, profile);
  }
  return map;
}

function mapTripRow(row) {
  return mapCollectionRow(row);
}

function enrichWithOwner(rows = [], profilesMap = new Map()) {
  return rows
    .map((row) => {
      const owner = profilesMap.get(row.owner_id || row.owner_user_id);
      const mapped = mapTripRow(row);
      return {
        ...mapped,
        owner_handle: owner?.handle || "",
        owner_display_name: owner?.display_name || owner?.handle || "Stash user",
        owner_avatar_url: owner?.avatar_url || "",
        owner_is_public: owner?.is_public !== false,
      };
    })
    .filter((row) => row.owner_is_public !== false && !!row.owner_handle);
}

function mapTrendingRpcRow(row) {
  return {
    id: row.id,
    owner_id: row.owner_id,
    owner_user_id: row.owner_id,
    type: normalizeSection(row.type),
    section: normalizeSection(row.type),
    name: row.name,
    title: row.name,
    subtitle: row.subtitle ?? null,
    public_slug: row.public_slug || "",
    slug: row.public_slug || "",
    cover_image_url: row.cover_image_url ?? null,
    visibility: normalizeCollectionVisibility(row.visibility),
    is_ranked: !!row.is_ranked,
    ranked_size: row.ranked_size ?? null,
    save_count: Number(row.save_count || 0),
    view_count: Number(row.view_count || 0),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    owner_handle: row.owner_handle || "",
    owner_display_name: row.owner_display_name || row.owner_handle || "Stash user",
    owner_avatar_url: row.owner_avatar_url || "",
    owner_is_public: true,
    saves_last_7_days: Number(row.saves_last_7_days || 0),
    views_last_7_days: Number(row.views_last_7_days || 0),
    trending_score: Number(row.trending_score || 0),
  };
}

async function fetchNewestPublicTrips({ section = null, limit = 120 }) {
  let query = supabase
    .from("trips")
    .select(TRIP_SELECT)
    .eq("visibility", "public")
    .not("public_slug", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (section) query = query.eq("type", section);

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

export async function fetchNewestPublicLists({
  section = "all",
  search = "",
  limit = 24,
  offset = 0,
} = {}) {
  const safeLimit = clamp(Number(limit) || 24, 1, 60);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const sectionFilter = normalizeSectionFilter(section);
  const normalizedSearch = normalizeSearchTerm(search);

  let query = supabase
    .from("trips")
    .select(TRIP_SELECT)
    .eq("visibility", "public")
    .not("public_slug", "is", null)
    .order("created_at", { ascending: false });

  if (sectionFilter) {
    query = query.eq("type", sectionFilter);
  }
  const fetchUpperBound = Math.min(800, safeOffset + safeLimit * (normalizedSearch ? 10 : 3));
  const { data, error } = await query.range(0, fetchUpperBound);
  if (error) {
    return { lists: [], hasMore: false, error };
  }

  const rows = data || [];
  if (!rows.length) {
    return { lists: [], hasMore: false, error: null };
  }

  const profileMap = await fetchProfilesMap(rows.map((row) => row.owner_id));
  const enriched = dedupeById(
    enrichWithOwner(rows, profileMap).filter((row) => matchesSearch(row, normalizedSearch))
  );
  const paged = enriched.slice(safeOffset, safeOffset + safeLimit + 1);
  const hydrated = await hydrateListPreviewImages(paged);
  const hasMore = hydrated.length > safeLimit;
  return {
    lists: hydrated.slice(0, safeLimit),
    hasMore,
    error: null,
  };
}

function matchesSearch(row, normalizedSearch = "") {
  if (!normalizedSearch) return true;
  const haystack = [
    row.title,
    row.name,
    row.subtitle,
    row.owner_handle,
    row.owner_display_name,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" \n ");
  return haystack.includes(normalizedSearch);
}

export async function fetchTrendingLists({
  section = "all",
  search = "",
  limit = 24,
  offset = 0,
} = {}) {
  const safeLimit = clamp(Number(limit) || 24, 1, 60);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const sectionFilter = normalizeSectionFilter(section);
  const normalizedSearch = normalizeSearchTerm(search);
  const rpcLimit = safeLimit + 1;

  const rpcResponse = await supabase.rpc("get_trending_collections", {
    p_section: sectionFilter,
    p_search: normalizedSearch || null,
    p_limit: rpcLimit,
    p_offset: safeOffset,
  });

  if (!rpcResponse.error && Array.isArray(rpcResponse.data)) {
    const hasMore = rpcResponse.data.length > safeLimit;
    const mappedRows = rpcResponse.data.slice(0, safeLimit).map(mapTrendingRpcRow);
    const hydratedRows = await hydrateListPreviewImages(mappedRows);
    return {
      lists: hydratedRows,
      hasMore,
      source: "rpc",
    };
  }

  const candidateLimit = Math.max(120, safeLimit * 4);
  const rows = await fetchNewestPublicTrips({ section: sectionFilter, limit: candidateLimit });
  if (!rows.length) {
    return { lists: [], hasMore: false, source: "fallback" };
  }

  const profileMap = await fetchProfilesMap(rows.map((row) => row.owner_id));
  const enriched = enrichWithOwner(rows, profileMap)
    .filter((row) => matchesSearch(row, normalizedSearch))
    .map((row) => ({ ...row, trending_score: fallbackTrendingScore(row) }))
    .sort((a, b) => {
      const scoreDiff = Number(b.trending_score || 0) - Number(a.trending_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return parseDateMs(b.created_at) - parseDateMs(a.created_at);
    });

  const paged = dedupeById(enriched).slice(safeOffset, safeOffset + safeLimit + 1);
  const hydratedPaged = await hydrateListPreviewImages(paged);
  const hasMore = hydratedPaged.length > safeLimit;
  return {
    lists: hydratedPaged.slice(0, safeLimit),
    hasMore,
    source: "fallback",
  };
}

export async function fetchFollowingFeed({
  viewerUserId,
  limit = 12,
  offset = 0,
} = {}) {
  const safeLimit = clamp(Number(limit) || 12, 1, 60);
  const safeOffset = Math.max(0, Number(offset) || 0);
  if (!viewerUserId) {
    return { lists: [], hasMore: false, followingCount: 0 };
  }

  const { data: followRows, error: followsError } = await supabase
    .from("follows")
    .select("following_user_id")
    .eq("follower_user_id", viewerUserId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (followsError || !followRows?.length) {
    return { lists: [], hasMore: false, followingCount: 0, error: followsError || null };
  }

  const followingIds = [...new Set(followRows.map((row) => row.following_user_id).filter(Boolean))];
  if (!followingIds.length) {
    return { lists: [], hasMore: false, followingCount: 0 };
  }

  const { data: tripRows, error: tripError } = await supabase
    .from("trips")
    .select(TRIP_SELECT)
    .in("owner_id", followingIds)
    .eq("visibility", "public")
    .not("public_slug", "is", null)
    .order("created_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit);

  if (tripError) {
    return {
      lists: [],
      hasMore: false,
      followingCount: followingIds.length,
      error: tripError,
    };
  }

  const rows = tripRows || [];
  const hasMore = rows.length > safeLimit;
  const pagedRows = rows.slice(0, safeLimit);
  const profileMap = await fetchProfilesMap(pagedRows.map((row) => row.owner_id));
  const lists = await hydrateListPreviewImages(enrichWithOwner(pagedRows, profileMap));
  return {
    lists,
    hasMore,
    followingCount: followingIds.length,
    error: null,
  };
}
