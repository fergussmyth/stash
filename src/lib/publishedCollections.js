import { supabase } from "./supabaseClient";
import { isValidHandle, normalizeHandle, slugify } from "./social";

const COLLECTION_VISIBILITY_VALUES = ["private", "unlisted", "public"];
const COLLECTION_TYPE_VALUES = ["general", "travel", "fashion"];

const COLLECTION_SELECT =
  "id,owner_id,name,type,subtitle,visibility,public_slug,published_at,is_ranked,ranked_size,cover_image_url,cover_image_source,cover_updated_at,save_count,view_count,pinned,created_at,updated_at,source_list_id";

const COLLECTION_ITEM_SELECT =
  "id,trip_id,url,original_url,domain,platform,item_type,image_url,favicon_url,metadata,pinned,archived,title,note,primary_action,added_at,last_opened_at,open_count";

function normalizeCollectionType(input = "") {
  const normalized = String(input || "").trim().toLowerCase();
  if (COLLECTION_TYPE_VALUES.includes(normalized)) return normalized;
  return "general";
}

export function normalizeCollectionVisibility(input = "") {
  const normalized = String(input || "").trim().toLowerCase();
  if (COLLECTION_VISIBILITY_VALUES.includes(normalized)) return normalized;
  return "private";
}

function normalizeRankedSettings({ isRanked = false, rankedSize = null } = {}) {
  const ranked = !!isRanked;
  if (!ranked) return { is_ranked: false, ranked_size: null };
  const size = Number(rankedSize) === 10 ? 10 : 5;
  return { is_ranked: true, ranked_size: size };
}

export function mapCollectionRow(row = {}) {
  const section = normalizeCollectionType(row.type);
  return {
    id: row.id,
    owner_id: row.owner_id,
    owner_user_id: row.owner_id,
    section,
    type: section,
    title: row.name || "",
    name: row.name || "",
    subtitle: row.subtitle || null,
    slug: row.public_slug || "",
    public_slug: row.public_slug || "",
    visibility: normalizeCollectionVisibility(row.visibility),
    published_at: row.published_at || null,
    is_ranked: !!row.is_ranked,
    ranked_size: row.ranked_size ?? null,
    cover_image_url: row.cover_image_url || null,
    cover_image_source: row.cover_image_source || null,
    cover_updated_at: row.cover_updated_at || null,
    pinned_order: row.pinned ? 1 : null,
    pinned: !!row.pinned,
    save_count: Number(row.save_count || 0),
    view_count: Number(row.view_count || 0),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    source_list_id: row.source_list_id || null,
  };
}

export function mapCollectionItemRow(row = {}) {
  return {
    id: row.id,
    trip_id: row.trip_id,
    url: row.url,
    original_url: row.original_url,
    domain_snapshot: row.domain || "",
    domain: row.domain || "",
    platform: row.platform || null,
    item_type: row.item_type || "link",
    image_snapshot: row.image_url || "",
    image_url: row.image_url || "",
    favicon_snapshot: row.favicon_url || "",
    favicon_url: row.favicon_url || "",
    title_snapshot: row.title || "",
    title: row.title || "",
    note: row.note || "",
    meta_json: row.metadata || {},
    metadata: row.metadata || {},
    primary_action: row.primary_action || null,
    added_at: row.added_at || null,
    open_count: Number(row.open_count || 0),
    last_opened_at: row.last_opened_at || null,
  };
}

export async function getProfileByHandle(handleInput = "") {
  const handle = normalizeHandle(handleInput || "");
  if (!handle) return { profile: null, error: null };
  const { data, error } = await supabase
    .from("profiles")
    .select("id,handle,display_name,bio,avatar_url,is_public,created_at,updated_at")
    .eq("handle", handle)
    .maybeSingle();
  if (error) return { profile: null, error };
  return { profile: data || null, error: null };
}

export async function getViewerProfile(viewerUserId = "") {
  if (!viewerUserId) return { profile: null, error: null };
  const { data, error } = await supabase
    .from("profiles")
    .select("id,handle,display_name,bio,avatar_url,is_public,created_at,updated_at")
    .eq("id", viewerUserId)
    .maybeSingle();
  if (error) return { profile: null, error };
  return { profile: data || null, error: null };
}

export async function claimProfileHandle({ viewerUserId, handleInput } = {}) {
  const userId = String(viewerUserId || "");
  if (!userId) return { ok: false, message: "Sign in required.", error: null, handle: "" };
  const normalized = normalizeHandle(handleInput || "");
  if (!isValidHandle(normalized)) {
    return {
      ok: false,
      message: "Handle must be 3-24 chars: lowercase letters, numbers, underscore.",
      error: null,
      handle: normalized,
    };
  }

  const { error } = await supabase.from("profiles").update({ handle: normalized }).eq("id", userId);
  if (error) {
    const message =
      error.code === "23505"
        ? "That handle is already taken."
        : "Could not save handle right now.";
    return { ok: false, message, error, handle: normalized };
  }
  return { ok: true, message: "", error: null, handle: normalized };
}

export async function ensureUniquePublicSlug({
  ownerUserId,
  inputSlug = "",
  fallbackTitle = "",
  excludeTripId = "",
} = {}) {
  const ownerId = String(ownerUserId || "");
  if (!ownerId) return "";
  const preferred = slugify(inputSlug || "") || slugify(fallbackTitle || "");
  if (!preferred) return "";

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = attempt === 0 ? preferred : `${preferred}-${attempt + 1}`;
    let query = supabase
      .from("trips")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("public_slug", candidate)
      .limit(1);
    if (excludeTripId) {
      query = query.neq("id", excludeTripId);
    }
    const { data, error } = await query;
    if (error) return candidate;
    if (!data?.length) return candidate;
  }

  return `${preferred}-${Date.now().toString(36).slice(2, 7)}`;
}

export async function publishCollection({
  viewerUserId,
  tripId,
  title,
  subtitle = "",
  visibility = "private",
  isRanked = false,
  rankedSize = null,
  requestedSlug = "",
  coverImageUrl = "",
} = {}) {
  const ownerIdFromInput = String(viewerUserId || "");
  const targetTripId = String(tripId || "");
  if (!targetTripId) {
    return { ok: false, message: "Missing collection context.", error: null };
  }

  let ownerId = ownerIdFromInput;
  const { data: authData } = await supabase.auth.getUser();
  const authUserId = String(authData?.user?.id || "");
  if (authUserId) {
    ownerId = authUserId;
  }
  if (!ownerId) {
    return { ok: false, message: "Please sign in again and retry.", error: null };
  }

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("id,owner_id,name,public_slug,published_at")
    .eq("id", targetTripId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (tripError) {
    const message =
      tripError.code === "42703"
        ? "Publishing fields are missing in your DB. Run migration `migrations/20260208_collections_publish_unification.sql`."
        : "Could not load this collection for publishing.";
    return { ok: false, message, error: tripError };
  }
  if (!trip) {
    return { ok: false, message: "Collection not found.", error: tripError || null };
  }

  const normalizedVisibility = normalizeCollectionVisibility(visibility);
  const nextTitle = String(title || "").trim() || String(trip.name || "").trim() || "Collection";
  const { is_ranked, ranked_size } = normalizeRankedSettings({ isRanked, rankedSize });
  const shouldPublish = normalizedVisibility === "public" || normalizedVisibility === "unlisted";
  const nextSlug = shouldPublish
    ? await ensureUniquePublicSlug({
        ownerUserId: ownerId,
        inputSlug: requestedSlug || trip.public_slug || nextTitle,
        fallbackTitle: nextTitle,
        excludeTripId: targetTripId,
      })
    : trip.public_slug || null;

  const payload = {
    name: nextTitle,
    subtitle: String(subtitle || "").trim() || null,
    visibility: normalizedVisibility,
    public_slug: nextSlug || null,
    published_at: shouldPublish ? trip.published_at || new Date().toISOString() : null,
    is_ranked,
    ranked_size,
  };
  if (String(coverImageUrl || "").trim()) {
    payload.cover_image_url = String(coverImageUrl).trim();
    payload.cover_image_source = "manual";
    payload.cover_updated_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("trips")
    .update(payload)
    .eq("id", targetTripId)
    .eq("owner_id", ownerId)
    .select(COLLECTION_SELECT)
    .single();
  if (error) {
    const message =
      error.code === "42703"
        ? "Publishing fields are missing in your DB. Run migration `migrations/20260208_collections_publish_unification.sql`."
        : "Could not publish collection right now.";
    return { ok: false, message, error };
  }
  if (!data) {
    return { ok: false, message: "Could not publish collection right now.", error: error || null };
  }

  return { ok: true, collection: mapCollectionRow(data), message: "" };
}

export async function saveCollectionPublishDetails({
  viewerUserId,
  tripId,
  orderedItemIds = [],
  itemUpdates = [],
} = {}) {
  const ownerIdFromInput = String(viewerUserId || "");
  const targetTripId = String(tripId || "");
  if (!targetTripId) {
    return { ok: false, message: "Missing collection context.", error: null };
  }

  let ownerId = ownerIdFromInput;
  const { data: authData } = await supabase.auth.getUser();
  const authUserId = String(authData?.user?.id || "");
  if (authUserId) {
    ownerId = authUserId;
  }
  if (!ownerId) {
    return { ok: false, message: "Please sign in again and retry.", error: null };
  }

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("id")
    .eq("id", targetTripId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (tripError) {
    return { ok: false, message: "Could not load this collection right now.", error: tripError };
  }
  if (!trip) {
    return { ok: false, message: "Collection not found.", error: null };
  }

  const nextOrderedIds = [...new Set((orderedItemIds || []).map((value) => String(value || "").trim()).filter(Boolean))];
  if (nextOrderedIds.length > 0) {
    const baseTime = Date.now() + nextOrderedIds.length;
    const orderUpdates = nextOrderedIds.map((itemId, index) =>
      supabase
        .from("trip_items")
        .update({ added_at: new Date(baseTime - index).toISOString() })
        .eq("id", itemId)
        .eq("trip_id", targetTripId)
    );
    const orderResults = await Promise.all(orderUpdates);
    const orderFailure = orderResults.find((result) => result.error);
    if (orderFailure?.error) {
      return {
        ok: false,
        message: "Could not save link order right now.",
        error: orderFailure.error,
      };
    }
  }

  const normalizedUpdates = (itemUpdates || [])
    .map((item) => {
      const id = String(item?.id || "").trim();
      if (!id) return null;
      const title = String(item?.title || "").trim();
      const note = String(item?.note || "").trim();
      return { id, title, note };
    })
    .filter(Boolean);

  if (normalizedUpdates.length > 0) {
    const itemUpdateQueries = normalizedUpdates.map((item) =>
      supabase
        .from("trip_items")
        .update({
          title: item.title || null,
          note: item.note || null,
        })
        .eq("id", item.id)
        .eq("trip_id", targetTripId)
    );
    const itemUpdateResults = await Promise.all(itemUpdateQueries);
    const itemFailure = itemUpdateResults.find((result) => result.error);
    if (itemFailure?.error) {
      return {
        ok: false,
        message: "Could not save link edits right now.",
        error: itemFailure.error,
      };
    }
  }

  return { ok: true, message: "", error: null };
}

export async function unpublishCollection({ viewerUserId, tripId } = {}) {
  const ownerIdFromInput = String(viewerUserId || "");
  const targetTripId = String(tripId || "");
  if (!targetTripId) {
    return { ok: false, message: "Missing collection context.", error: null };
  }
  let ownerId = ownerIdFromInput;
  const { data: authData } = await supabase.auth.getUser();
  const authUserId = String(authData?.user?.id || "");
  if (authUserId) {
    ownerId = authUserId;
  }
  if (!ownerId) {
    return { ok: false, message: "Please sign in again and retry.", error: null };
  }
  const { data, error } = await supabase
    .from("trips")
    .update({ visibility: "private", published_at: null })
    .eq("id", targetTripId)
    .eq("owner_id", ownerId)
    .select(COLLECTION_SELECT)
    .single();
  if (error) {
    const message =
      error.code === "42703"
        ? "Publishing fields are missing in your DB. Run migration `migrations/20260208_collections_publish_unification.sql`."
        : "Could not unpublish collection.";
    return { ok: false, message, error };
  }
  if (!data) {
    return { ok: false, message: "Could not unpublish collection.", error: error || null };
  }
  return { ok: true, collection: mapCollectionRow(data), message: "" };
}

async function fetchCollectionItems(tripId = "") {
  const { data, error } = await supabase
    .from("trip_items")
    .select(COLLECTION_ITEM_SELECT)
    .eq("trip_id", tripId)
    .order("added_at", { ascending: false })
    .limit(400);
  if (error) return { items: [], error };
  return { items: (data || []).map(mapCollectionItemRow), error: null };
}

export async function getPublishedCollectionByHandleAndSlug({
  handleInput = "",
  slugInput = "",
  viewerUserId = "",
  trackView = true,
  referrer = "",
} = {}) {
  const { profile, error: profileError } = await getProfileByHandle(handleInput);
  if (profileError || !profile) {
    return { status: "not_found", profile: null, collection: null, items: [], error: profileError || null };
  }

  const normalizedSlug = slugify(slugInput || "");
  if (!normalizedSlug) {
    return { status: "not_found", profile, collection: null, items: [], error: null };
  }

  const isOwner = !!viewerUserId && viewerUserId === profile.id;
  if (!isOwner && profile.is_public === false) {
    return { status: "not_found", profile, collection: null, items: [], error: null };
  }

  let { data: tripRow, error: tripError } = await supabase
    .from("trips")
    .select(COLLECTION_SELECT)
    .eq("owner_id", profile.id)
    .eq("public_slug", normalizedSlug)
    .maybeSingle();

  if (!tripRow && !tripError && normalizedSlug) {
    const { data: legacyList } = await supabase
      .from("lists")
      .select("id")
      .eq("owner_user_id", profile.id)
      .eq("slug", normalizedSlug)
      .maybeSingle();

    if (legacyList?.id) {
      const resolved = await supabase
        .from("trips")
        .select(COLLECTION_SELECT)
        .eq("source_list_id", legacyList.id)
        .maybeSingle();
      tripRow = resolved.data || null;
      tripError = resolved.error || null;
    }
  }

  if (tripError || !tripRow) {
    return { status: "not_found", profile, collection: null, items: [], error: tripError || null };
  }

  const collection = mapCollectionRow(tripRow);
  const visibility = normalizeCollectionVisibility(collection.visibility);
  if (!isOwner && visibility === "private") {
    return { status: "not_found", profile, collection: null, items: [], error: null };
  }

  if (!isOwner && visibility !== "private" && profile.is_public === false) {
    return { status: "not_found", profile, collection: null, items: [], error: null };
  }

  const { items, error: itemsError } = await fetchCollectionItems(collection.id);

  if (trackView) {
    await supabase.from("trip_views").insert({
      trip_id: collection.id,
      viewer_user_id: viewerUserId || null,
      referrer: referrer || null,
    });
  }

  return {
    status: "ok",
    profile,
    collection,
    items,
    isOwner,
    error: itemsError || null,
  };
}

export async function getPublicCollectionsByHandle({
  handleInput = "",
  viewerUserId = "",
  limit = 80,
} = {}) {
  const { profile, error: profileError } = await getProfileByHandle(handleInput);
  if (profileError || !profile) {
    return { status: "not_found", profile: null, collections: [], error: profileError || null };
  }
  const isOwner = !!viewerUserId && viewerUserId === profile.id;
  if (!isOwner && profile.is_public === false) {
    return { status: "not_found", profile, collections: [], error: null };
  }

  let query = supabase
    .from("trips")
    .select(COLLECTION_SELECT)
    .eq("owner_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(limit) || 80)));
  if (!isOwner) {
    query = query.eq("visibility", "public");
  }

  const { data, error } = await query;
  if (error) return { status: "error", profile, collections: [], error };
  return {
    status: "ok",
    profile,
    collections: (data || []).map(mapCollectionRow),
    error: null,
  };
}
