import { supabase } from "./supabaseClient";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeHandle(value = "") {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function mapCreatorRow(row = {}) {
  const id = String(row.id || "");
  const normalizedHandle = normalizeHandle(row.handle || "");
  const displayName = String(row.display_name || "").trim() || normalizedHandle || "Stash user";
  return {
    id,
    handle: normalizedHandle,
    displayName,
    avatarUrl: String(row.avatar_url || "").trim(),
    createdAt: row.created_at || null,
  };
}

export async function fetchCreators({ limit = 6, excludeUserId = "", search = "" } = {}) {
  const safeLimit = clamp(Number(limit) || 6, 1, 30);
  const normalizedSearch = String(search || "").trim().toLowerCase();
  const excludedId = String(excludeUserId || "").trim();

  let query = supabase
    .from("profiles")
    .select("id,handle,display_name,avatar_url,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(12, safeLimit * 3));

  if (excludedId) {
    query = query.neq("id", excludedId);
  }

  const { data, error } = await query;
  if (error) {
    return { creators: [], error };
  }

  const seen = new Set();
  const mapped = [];
  for (const row of data || []) {
    const creator = mapCreatorRow(row);
    if (!creator.id || seen.has(creator.id)) continue;
    seen.add(creator.id);
    mapped.push(creator);
  }

  const filtered = normalizedSearch
    ? mapped.filter((creator) => {
        const haystack = `${creator.displayName} ${creator.handle}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : mapped;

  return {
    creators: filtered.slice(0, safeLimit),
    error: null,
  };
}
