import { supabase } from "./supabaseClient";

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

const AIRBNB_FALLBACK_TITLE_RE = /^airbnb room(?:\s+\d+)?$/i;
const resolvedTitleCache = new Map();

function normalizeTripType(section = "") {
  const normalized = String(section || "").trim().toLowerCase();
  if (normalized === "travel" || normalized === "fashion" || normalized === "general") {
    return normalized;
  }
  return "general";
}

function normalizeUrlForStash(input = "") {
  let value = String(input || "").trim();
  if (!value) return "";
  while (/[),.\]}>"']$/.test(value)) {
    value = value.slice(0, -1);
  }
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  return value;
}

function getDomain(url = "") {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

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

function parseMetaObject(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

async function postWithTimeout(url, payload, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function enrichAirbnbTitle(url = "", currentTitle = "", domain = "") {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) return String(currentTitle || "").trim();

  const normalizedDomain = String(domain || "").toLowerCase();
  const normalizedTitle = String(currentTitle || "").trim();
  const isAirbnb =
    normalizedDomain.includes("airbnb.") || normalizedUrl.toLowerCase().includes("airbnb.");
  const isFallbackTitle = AIRBNB_FALLBACK_TITLE_RE.test(normalizedTitle.toLowerCase());
  if (!isAirbnb || !isFallbackTitle) return normalizedTitle;

  if (resolvedTitleCache.has(normalizedUrl)) {
    const cached = String(resolvedTitleCache.get(normalizedUrl) || "").trim();
    return cached || normalizedTitle;
  }

  const direct = await postWithTimeout("/fetch-airbnb-title", { url: normalizedUrl }, 5500);
  const directTitle = String(direct?.title || "").trim();
  if (directTitle) {
    resolvedTitleCache.set(normalizedUrl, directTitle);
    return directTitle;
  }

  const preview = await postWithTimeout("/fetch-link-preview", { url: normalizedUrl }, 6000);
  const previewTitle = String(preview?.title || "").trim();
  if (previewTitle) {
    resolvedTitleCache.set(normalizedUrl, previewTitle);
    return previewTitle;
  }

  resolvedTitleCache.set(normalizedUrl, "");
  return normalizedTitle;
}

function normalizeSourceCollectionEntity(list = null) {
  if (!list || typeof list !== "object") return null;
  const id = String(list.id || "");
  if (!id) return null;
  return {
    id,
    ownerUserId: String(list.owner_user_id || list.owner_id || ""),
    section: normalizeTripType(list.section || list.type || "general"),
    title: String(list.title || list.name || "Saved list").trim() || "Saved list",
    slug: String(list.slug || list.public_slug || "").trim(),
    subtitle: String(list.subtitle || "").trim(),
    isRanked: !!list.is_ranked,
    rankedSize: list.ranked_size ? Number(list.ranked_size) : null,
  };
}

function mapSourceItem(item = {}, index = 0, sourceEntity = null, ownerHandle = "") {
  const url = normalizeUrlForStash(item?.url || item?.airbnbUrl || item?.original_url || "");
  if (!url) return null;

  const domain =
    String(item?.domain_snapshot || item?.domain || "").trim() || getDomain(url);
  const title =
    String(item?.title_snapshot || item?.title || "").trim() || domain || "Saved link";
  const imageUrl = String(item?.image_snapshot || item?.image_url || item?.imageUrl || "").trim();
  const faviconUrl = String(item?.favicon_snapshot || item?.favicon_url || item?.faviconUrl || "").trim();
  const metadataSource = parseMetaObject(item?.meta_json || item?.metadata);
  const note = String(item?.note || "").trim();
  const sourceRank = Number(item?.rank_index || index + 1) || index + 1;

  const metadata = {
    ...(metadataSource && typeof metadataSource === "object" ? metadataSource : {}),
    source: "social_list",
    source_trip_id: sourceEntity?.id || null,
    source_owner_user_id: sourceEntity?.ownerUserId || null,
    source_owner_handle: ownerHandle || null,
    source_trip_slug: sourceEntity?.slug || null,
    source_trip_title: sourceEntity?.title || null,
    source_rank_index: sourceRank,
    source_section: sourceEntity?.section || "general",
    source_is_ranked: !!sourceEntity?.isRanked,
    source_ranked_size: sourceEntity?.rankedSize || null,
  };

  return {
    url,
    domain,
    title,
    imageUrl,
    faviconUrl,
    note,
    metadata,
    primaryAction:
      item?.primary_action || item?.primaryAction || inferPrimaryAction(url, domain),
    addedAt:
      item?.added_at || item?.created_at || item?.addedAt || new Date().toISOString(),
  };
}

async function fetchSourceItemsFromTrip(tripId = "") {
  if (!tripId) return { items: [], error: null };
  const { data, error } = await supabase
    .from("trip_items")
    .select(
      "id,trip_id,url,original_url,domain,platform,item_type,image_url,favicon_url,metadata,title,note,primary_action,added_at"
    )
    .eq("trip_id", tripId)
    .order("added_at", { ascending: true })
    .limit(500);
  return { items: data || [], error: error || null };
}

async function fetchSaveRow(viewerUserId, sourceTripId) {
  const withDestTrip = await supabase
    .from("trip_saves")
    .select("trip_id,saved_trip_id")
    .eq("user_id", viewerUserId)
    .eq("trip_id", sourceTripId)
    .maybeSingle();

  if (!withDestTrip.error) {
    return { row: withDestTrip.data || null, schemaHasSavedTrip: true, error: null };
  }

  if (withDestTrip.error.code === "42703") {
    const fallback = await supabase
      .from("trip_saves")
      .select("trip_id")
      .eq("user_id", viewerUserId)
      .eq("trip_id", sourceTripId)
      .maybeSingle();
    return {
      row: fallback.data || null,
      schemaHasSavedTrip: false,
      error: fallback.error || null,
    };
  }

  if (withDestTrip.error.code === "42P01") {
    return { row: null, schemaHasSavedTrip: false, error: withDestTrip.error };
  }

  return { row: null, schemaHasSavedTrip: true, error: withDestTrip.error };
}

async function findSavedTripIdsFromMetadata(sourceTripId, viewerUserId) {
  if (!sourceTripId || !viewerUserId) return [];
  const { data, error } = await supabase
    .from("trip_items")
    .select("trip_id,added_at")
    .contains("metadata", { source_trip_id: sourceTripId })
    .order("added_at", { ascending: false })
    .limit(20);

  if (error || !Array.isArray(data) || !data.length) return [];

  const tripIds = [...new Set(data.map((row) => row.trip_id).filter(Boolean))];
  if (!tripIds.length) return [];

  const { data: ownedTrips, error: ownedError } = await supabase
    .from("trips")
    .select("id,created_at")
    .eq("owner_id", viewerUserId)
    .in("id", tripIds)
    .order("created_at", { ascending: false })
    .limit(20);
  if (ownedError) return [];
  return (ownedTrips || []).map((row) => row.id).filter(Boolean);
}

async function findSavedTripFromMetadata(sourceTripId, viewerUserId) {
  const tripIds = await findSavedTripIdsFromMetadata(sourceTripId, viewerUserId);
  return tripIds[0] || "";
}

async function attachSavedTripToSaveRow(viewerUserId, sourceTripId, savedTripId) {
  if (!viewerUserId || !sourceTripId || !savedTripId) return;
  const { error } = await supabase
    .from("trip_saves")
    .update({ saved_trip_id: savedTripId })
    .eq("user_id", viewerUserId)
    .eq("trip_id", sourceTripId);

  if (error && error.code !== "42703" && error.code !== "42P01") {
    // no-op
  }
}

export async function getSavedListsByIds({ viewerUserId, listIds = [] } = {}) {
  const ids = [...new Set((listIds || []).filter(Boolean))];
  if (!viewerUserId || !ids.length) {
    return { map: new Map(), schemaHasSavedTrip: true, error: null };
  }

  const withDestTrip = await supabase
    .from("trip_saves")
    .select("trip_id,saved_trip_id")
    .eq("user_id", viewerUserId)
    .in("trip_id", ids);

  if (!withDestTrip.error) {
    const map = new Map();
    for (const row of withDestTrip.data || []) {
      if (!row?.trip_id) continue;
      map.set(row.trip_id, { savedTripId: row.saved_trip_id || "" });
    }
    return { map, schemaHasSavedTrip: true, error: null };
  }

  if (withDestTrip.error.code === "42703") {
    const fallback = await supabase
      .from("trip_saves")
      .select("trip_id")
      .eq("user_id", viewerUserId)
      .in("trip_id", ids);

    if (fallback.error) {
      return { map: new Map(), schemaHasSavedTrip: false, error: fallback.error };
    }

    const map = new Map();
    for (const row of fallback.data || []) {
      if (!row?.trip_id) continue;
      map.set(row.trip_id, { savedTripId: "" });
    }
    return { map, schemaHasSavedTrip: false, error: null };
  }

  if (withDestTrip.error.code === "42P01") {
    return { map: new Map(), schemaHasSavedTrip: false, error: null };
  }

  return { map: new Map(), schemaHasSavedTrip: true, error: withDestTrip.error };
}

export async function getSavedTripsByIds(args = {}) {
  return getSavedListsByIds(args);
}

async function safeDeleteTrip(deleteTrip, tripId) {
  if (!tripId || typeof deleteTrip !== "function") return;
  try {
    await deleteTrip(tripId);
  } catch {
    // no-op
  }
}

async function createPrivateCopy({
  sourceEntity,
  ownerHandle,
  listItems,
  createTrip,
  deleteTrip,
  reloadTripItems,
} = {}) {
  const tripName = String(sourceEntity?.title || "Saved list").trim() || "Saved list";
  const tripType = normalizeTripType(sourceEntity?.section || "general");
  const createdTripId = (await createTrip(tripName, tripType)) || "";
  if (!createdTripId) {
    return { savedTripId: "", copiedCount: 0, error: new Error("create_trip_failed") };
  }

  let sourceItems = Array.isArray(listItems) ? listItems : null;
  if (!sourceItems) {
    const fetched = await fetchSourceItemsFromTrip(sourceEntity.id);
    if (fetched.error) {
      await safeDeleteTrip(deleteTrip, createdTripId);
      return { savedTripId: "", copiedCount: 0, error: fetched.error };
    }
    sourceItems = fetched.items;
  }

  const now = Date.now();
  const rows = [];
  for (let index = 0; index < sourceItems.length; index += 1) {
    const mapped = mapSourceItem(sourceItems[index], index, sourceEntity, ownerHandle);
    if (!mapped) continue;
    const enrichedTitle = await enrichAirbnbTitle(mapped.url, mapped.title, mapped.domain);

    rows.push({
      trip_id: createdTripId,
      url: mapped.url,
      original_url: mapped.url,
      domain: mapped.domain || null,
      platform: mapped.domain && mapped.domain.includes("airbnb.") ? "airbnb" : null,
      item_type: "link",
      image_url: mapped.imageUrl || null,
      favicon_url: mapped.faviconUrl || null,
      metadata: mapped.metadata,
      pinned: false,
      archived: false,
      title: enrichedTitle || mapped.title,
      note: mapped.note || null,
      primary_action: mapped.primaryAction || null,
      added_at: new Date(now + index * 1000).toISOString(),
    });
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("trip_items").insert(rows);
    if (insertError) {
      await safeDeleteTrip(deleteTrip, createdTripId);
      return { savedTripId: "", copiedCount: 0, error: insertError };
    }
  }

  if (typeof reloadTripItems === "function") {
    try {
      await reloadTripItems(createdTripId);
    } catch {
      // no-op
    }
  }

  return { savedTripId: createdTripId, copiedCount: rows.length, error: null };
}

export async function savePublicListToStash({
  viewerUserId,
  list,
  ownerHandle = "",
  listItems = null,
  createTrip,
  deleteTrip,
  reloadTripItems,
} = {}) {
  if (!viewerUserId) {
    return { status: "error", message: "Sign in required." };
  }

  const sourceEntity = normalizeSourceCollectionEntity(list);
  if (!sourceEntity?.id) {
    return { status: "error", message: "Collection not found." };
  }

  if (sourceEntity.ownerUserId && sourceEntity.ownerUserId === viewerUserId) {
    return { status: "error", message: "This is already your collection." };
  }

  if (typeof createTrip !== "function" || typeof deleteTrip !== "function") {
    return { status: "error", message: "Save is unavailable right now." };
  }

  const existing = await fetchSaveRow(viewerUserId, sourceEntity.id);
  if (existing.error && existing.error.code !== "42P01") {
    return { status: "error", message: "Couldn’t verify save status.", error: existing.error };
  }

  if (existing.row?.saved_trip_id) {
    return { status: "already_saved", savedTripId: existing.row.saved_trip_id || "" };
  }

  if (existing.row) {
    const recoveredTripId = await findSavedTripFromMetadata(sourceEntity.id, viewerUserId);
    if (recoveredTripId) {
      await attachSavedTripToSaveRow(viewerUserId, sourceEntity.id, recoveredTripId);
      return { status: "already_saved", savedTripId: recoveredTripId };
    }

    const copyResult = await createPrivateCopy({
      sourceEntity,
      ownerHandle,
      listItems,
      createTrip,
      deleteTrip,
      reloadTripItems,
    });

    if (copyResult.error || !copyResult.savedTripId) {
      return {
        status: "error",
        message: "Couldn’t create Stash copy.",
        error: copyResult.error || null,
      };
    }

    await attachSavedTripToSaveRow(viewerUserId, sourceEntity.id, copyResult.savedTripId);
    return {
      status: "saved",
      savedTripId: copyResult.savedTripId,
      copiedCount: copyResult.copiedCount,
      insertedSaveRow: false,
    };
  }

  const copyResult = await createPrivateCopy({
    sourceEntity,
    ownerHandle,
    listItems,
    createTrip,
    deleteTrip,
    reloadTripItems,
  });

  if (copyResult.error || !copyResult.savedTripId) {
    return { status: "error", message: "Couldn’t create Stash copy.", error: copyResult.error || null };
  }

  const createdTripId = copyResult.savedTripId;

  const withDestInsert = await supabase
    .from("trip_saves")
    .insert({ user_id: viewerUserId, trip_id: sourceEntity.id, saved_trip_id: createdTripId });

  let saveError = withDestInsert.error;
  if (saveError && (saveError.code === "42703" || saveError.code === "42P01")) {
    const fallbackInsert = await supabase
      .from("trip_saves")
      .insert({ user_id: viewerUserId, trip_id: sourceEntity.id });
    saveError = fallbackInsert.error;
  }

  if (saveError) {
    if (saveError.code === "23505") {
      const afterConflict = await fetchSaveRow(viewerUserId, sourceEntity.id);
      if (afterConflict.row?.saved_trip_id) {
        await safeDeleteTrip(deleteTrip, createdTripId);
        return {
          status: "already_saved",
          savedTripId: afterConflict.row.saved_trip_id || "",
        };
      }

      await attachSavedTripToSaveRow(viewerUserId, sourceEntity.id, createdTripId);
      const linkedRow = await fetchSaveRow(viewerUserId, sourceEntity.id);
      if (linkedRow.row?.saved_trip_id) {
        return {
          status: "already_saved",
          savedTripId: linkedRow.row.saved_trip_id || "",
        };
      }

      const recoveredTripId = await findSavedTripFromMetadata(sourceEntity.id, viewerUserId);
      if (recoveredTripId) {
        await attachSavedTripToSaveRow(viewerUserId, sourceEntity.id, recoveredTripId);
      }

      return {
        status: "already_saved",
        savedTripId: recoveredTripId || afterConflict.row?.saved_trip_id || "",
      };
    }

    await safeDeleteTrip(deleteTrip, createdTripId);
    return { status: "error", message: "Couldn’t save right now.", error: saveError };
  }

  return {
    status: "saved",
    savedTripId: createdTripId,
    copiedCount: copyResult.copiedCount,
    insertedSaveRow: true,
  };
}

export async function unsavePublicListFromStash({ viewerUserId, listId, deleteTrip } = {}) {
  const normalizedUserId = String(viewerUserId || "").trim();
  const normalizedListId = String(listId || "").trim();
  if (!normalizedUserId || !normalizedListId) {
    return { status: "error", message: "Missing save context." };
  }

  const existing = await supabase
    .from("trip_saves")
    .select("saved_trip_id")
    .eq("user_id", normalizedUserId)
    .eq("trip_id", normalizedListId)
    .maybeSingle();

  const tableMissing = existing.error?.code === "42P01";
  if (existing.error && !tableMissing) {
    return { status: "error", message: "Couldn’t verify save status.", error: existing.error };
  }

  const candidateTripIds = new Set();
  const existingSavedTripId = String(existing.data?.saved_trip_id || "").trim();
  if (existingSavedTripId) {
    candidateTripIds.add(existingSavedTripId);
  }
  const recoveredTripIds = await findSavedTripIdsFromMetadata(normalizedListId, normalizedUserId);
  for (const tripId of recoveredTripIds) {
    candidateTripIds.add(tripId);
  }

  if (!existing.data && candidateTripIds.size === 0) {
    return { status: "not_saved", savedTripId: "" };
  }

  if (!tableMissing) {
    const { error: deleteError } = await supabase
      .from("trip_saves")
      .delete()
      .eq("user_id", normalizedUserId)
      .eq("trip_id", normalizedListId);

    if (deleteError && deleteError.code !== "42P01") {
      return { status: "error", message: "Couldn’t remove save right now.", error: deleteError };
    }
  }

  const removedTripIds = [];
  for (const tripId of candidateTripIds) {
    if (!tripId) continue;
    if (typeof deleteTrip === "function") {
      try {
        await deleteTrip(tripId);
        removedTripIds.push(tripId);
        continue;
      } catch {
        // fall through to direct delete
      }
    }
    const { error: deleteTripError } = await supabase
      .from("trips")
      .delete()
      .eq("id", tripId)
      .eq("owner_id", normalizedUserId);
    if (!deleteTripError) {
      removedTripIds.push(tripId);
    }
  }

  return {
    status: "unsaved",
    savedTripId: existingSavedTripId || removedTripIds[0] || "",
    removedTripIds,
  };
}
