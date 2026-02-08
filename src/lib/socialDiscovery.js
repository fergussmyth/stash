import { supabase } from "./supabaseClient";

const LIST_SELECT =
  "id,owner_user_id,section,title,subtitle,slug,cover_image_url,visibility,is_ranked,ranked_size,pinned_order,save_count,view_count,last_saved_at,last_viewed_at,created_at,updated_at";

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

function sanitizeSearchForFilter(search = "") {
  return normalizeSearchTerm(search)
    .replace(/[%(),"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeListsById(rows = []) {
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

function fallbackTrendingScore(list) {
  const saves = Number(list?.save_count || 0);
  const views = Number(list?.view_count || 0);
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const lastSavedAtMs = parseDateMs(list?.last_saved_at);
  const lastViewedAtMs = parseDateMs(list?.last_viewed_at);

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

function enrichWithOwner(rows = [], profilesMap = new Map()) {
  return rows
    .map((row) => {
      const owner = profilesMap.get(row.owner_user_id);
      return {
        ...row,
        owner_handle: owner?.handle || "",
        owner_display_name: owner?.display_name || owner?.handle || "Stash user",
        owner_avatar_url: owner?.avatar_url || "",
        owner_is_public: owner?.is_public !== false,
      };
    })
    .filter((row) => row.owner_is_public !== false && !!row.owner_handle);
}

function mapRpcRow(row) {
  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    section: row.section,
    title: row.title,
    subtitle: row.subtitle ?? null,
    slug: row.slug,
    cover_image_url: row.cover_image_url ?? null,
    visibility: row.visibility,
    is_ranked: !!row.is_ranked,
    ranked_size: row.ranked_size ?? null,
    pinned_order: row.pinned_order ?? null,
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

async function fetchNewestPublicRows({ section = null, limit = 120 }) {
  let query = supabase
    .from("lists")
    .select(LIST_SELECT)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (section) query = query.eq("section", section);

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

async function fetchFallbackTrendingRows({ section = null, search = "", limit = 120 }) {
  const normalizedSearch = sanitizeSearchForFilter(search);
  let titleRows = [];
  let ownerRows = [];

  let titleQuery = supabase
    .from("lists")
    .select(LIST_SELECT)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (section) titleQuery = titleQuery.eq("section", section);

  if (normalizedSearch) {
    titleQuery = titleQuery.or(
      `title.ilike.%${normalizedSearch}%,subtitle.ilike.%${normalizedSearch}%`
    );
  }

  const { data: titleData } = await titleQuery;
  titleRows = titleData || [];

  if (normalizedSearch) {
    const { data: ownerMatches } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_public", true)
      .or(`handle.ilike.%${normalizedSearch}%,display_name.ilike.%${normalizedSearch}%`)
      .limit(limit);

    const ownerIds = (ownerMatches || []).map((row) => row.id).filter(Boolean);
    if (ownerIds.length) {
      let ownerQuery = supabase
        .from("lists")
        .select(LIST_SELECT)
        .eq("visibility", "public")
        .in("owner_user_id", ownerIds)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (section) ownerQuery = ownerQuery.eq("section", section);

      const { data: ownerData } = await ownerQuery;
      ownerRows = ownerData || [];
    }
  }

  return dedupeListsById([...titleRows, ...ownerRows]);
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

  const { data: rpcData, error: rpcError } = await supabase.rpc("get_trending_lists", {
    p_section: sectionFilter,
    p_search: normalizedSearch || null,
    p_limit: rpcLimit,
    p_offset: safeOffset,
  });

  if (!rpcError && Array.isArray(rpcData)) {
    const hasMore = rpcData.length > safeLimit;
    return {
      lists: rpcData.slice(0, safeLimit).map(mapRpcRow),
      hasMore,
      source: "rpc",
    };
  }

  const candidateLimit = Math.max(90, safeLimit * 4);
  let rows = await fetchFallbackTrendingRows({
    section: sectionFilter,
    search: normalizedSearch,
    limit: candidateLimit,
  });

  if (!rows.length && !normalizedSearch) {
    rows = await fetchNewestPublicRows({ section: sectionFilter, limit: candidateLimit });
  }

  if (!rows.length) {
    return { lists: [], hasMore: false, source: "fallback" };
  }

  const profileMap = await fetchProfilesMap(rows.map((row) => row.owner_user_id));
  const enriched = enrichWithOwner(rows, profileMap)
    .map((row) => ({ ...row, trending_score: fallbackTrendingScore(row) }))
    .sort((a, b) => {
      const scoreDiff = Number(b.trending_score || 0) - Number(a.trending_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return parseDateMs(b.created_at) - parseDateMs(a.created_at);
    });

  const paged = enriched.slice(safeOffset, safeOffset + safeLimit + 1);
  const hasMore = paged.length > safeLimit;
  return {
    lists: paged.slice(0, safeLimit),
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

  const { data: listRows, error: listError } = await supabase
    .from("lists")
    .select(LIST_SELECT)
    .in("owner_user_id", followingIds)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit);

  if (listError) {
    return {
      lists: [],
      hasMore: false,
      followingCount: followingIds.length,
      error: listError,
    };
  }

  const rows = listRows || [];
  const hasMore = rows.length > safeLimit;
  const pagedRows = rows.slice(0, safeLimit);
  const profileMap = await fetchProfilesMap(pagedRows.map((row) => row.owner_user_id));
  const lists = enrichWithOwner(pagedRows, profileMap);
  return {
    lists,
    hasMore,
    followingCount: followingIds.length,
    error: null,
  };
}
