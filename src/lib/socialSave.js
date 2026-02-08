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

async function fetchSaveRow(viewerUserId, listId) {
  const withTrip = await supabase
    .from("list_saves")
    .select("list_id,saved_trip_id")
    .eq("user_id", viewerUserId)
    .eq("list_id", listId)
    .maybeSingle();

  if (!withTrip.error) {
    return { row: withTrip.data || null, schemaHasSavedTrip: true, error: null };
  }

  if (withTrip.error.code === "42703") {
    const fallback = await supabase
      .from("list_saves")
      .select("list_id")
      .eq("user_id", viewerUserId)
      .eq("list_id", listId)
      .maybeSingle();
    return { row: fallback.data || null, schemaHasSavedTrip: false, error: fallback.error || null };
  }

  return { row: null, schemaHasSavedTrip: true, error: withTrip.error };
}

async function findSavedTripFromMetadata(listId) {
  if (!listId) return "";
  const { data, error } = await supabase
    .from("trip_items")
    .select("trip_id,added_at")
    .contains("metadata", { source_list_id: listId })
    .order("added_at", { ascending: false })
    .limit(1);

  if (error) return "";
  return data?.[0]?.trip_id || "";
}

async function attachSavedTripToSaveRow(viewerUserId, listId, savedTripId) {
  if (!viewerUserId || !listId || !savedTripId) return;
  const { error } = await supabase
    .from("list_saves")
    .update({ saved_trip_id: savedTripId })
    .eq("user_id", viewerUserId)
    .eq("list_id", listId);

  if (error && error.code !== "42703") {
    // noop: linking can fail if update policy isn't applied yet.
  }
}

export async function getSavedListsByIds({ viewerUserId, listIds = [] } = {}) {
  const ids = [...new Set((listIds || []).filter(Boolean))];
  if (!viewerUserId || !ids.length) {
    return { map: new Map(), schemaHasSavedTrip: true, error: null };
  }

  const withTrip = await supabase
    .from("list_saves")
    .select("list_id,saved_trip_id")
    .eq("user_id", viewerUserId)
    .in("list_id", ids);

  if (!withTrip.error) {
    const map = new Map();
    for (const row of withTrip.data || []) {
      if (!row?.list_id) continue;
      map.set(row.list_id, { savedTripId: row.saved_trip_id || "" });
    }
    return { map, schemaHasSavedTrip: true, error: null };
  }

  if (withTrip.error.code === "42703") {
    const fallback = await supabase
      .from("list_saves")
      .select("list_id")
      .eq("user_id", viewerUserId)
      .in("list_id", ids);

    if (fallback.error) {
      return { map: new Map(), schemaHasSavedTrip: false, error: fallback.error };
    }

    const map = new Map();
    for (const row of fallback.data || []) {
      if (!row?.list_id) continue;
      map.set(row.list_id, { savedTripId: "" });
    }
    return { map, schemaHasSavedTrip: false, error: null };
  }

  return { map: new Map(), schemaHasSavedTrip: true, error: withTrip.error };
}

async function safeDeleteTrip(deleteTrip, tripId) {
  if (!tripId || typeof deleteTrip !== "function") return;
  try {
    await deleteTrip(tripId);
  } catch {
    // noop
  }
}

async function createPrivateCopy({
  list,
  ownerHandle,
  listItems,
  createTrip,
  deleteTrip,
  reloadTripItems,
} = {}) {
  const tripName = (list.title || "Saved list").trim() || "Saved list";
  const tripType = normalizeTripType(list.section);
  const createdTripId = (await createTrip(tripName, tripType)) || "";
  if (!createdTripId) {
    return { savedTripId: "", copiedCount: 0, error: new Error("create_trip_failed") };
  }

  let sourceItems = Array.isArray(listItems) ? listItems : null;
  if (!sourceItems) {
    const { data: fetchedItems, error: itemsError } = await supabase
      .from("list_items")
      .select(
        "id,list_id,item_id,url,title_snapshot,image_snapshot,domain_snapshot,price_snapshot,rating_snapshot,meta_json,rank_index,note,created_at"
      )
      .eq("list_id", list.id)
      .order("rank_index", { ascending: true })
      .limit(300);

    if (itemsError) {
      await safeDeleteTrip(deleteTrip, createdTripId);
      return { savedTripId: "", copiedCount: 0, error: itemsError };
    }
    sourceItems = fetchedItems || [];
  }

  const sortedItems = [...(sourceItems || [])].sort(
    (a, b) => Number(a?.rank_index || 0) - Number(b?.rank_index || 0)
  );
  const now = Date.now();
  const rows = [];
  for (let index = 0; index < sortedItems.length; index += 1) {
    const item = sortedItems[index];
    const normalizedUrl = normalizeUrlForStash(item?.url || "");
    if (!normalizedUrl) continue;
    const domain = item?.domain_snapshot || getDomain(normalizedUrl);
    const title = item?.title_snapshot || domain || "Saved link";
    const baseMeta = parseMetaObject(item?.meta_json);
    const metadata = {
      ...(baseMeta && typeof baseMeta === "object" ? baseMeta : {}),
      source: "social_list",
      source_list_id: list.id,
      source_list_item_id: item?.id || null,
      source_owner_user_id: list.owner_user_id || null,
      source_owner_handle: ownerHandle || null,
      source_list_slug: list.slug || null,
      source_list_title: list.title || null,
      source_rank_index: Number(item?.rank_index || index + 1),
      source_item_id: item?.item_id || null,
      source_price_snapshot: item?.price_snapshot ?? null,
      source_rating_snapshot: item?.rating_snapshot ?? null,
      source_section: list.section || "general",
    };

    rows.push({
      trip_id: createdTripId,
      url: normalizedUrl,
      original_url: normalizedUrl,
      domain: domain || null,
      platform: domain && domain.includes("airbnb.") ? "airbnb" : null,
      item_type: "link",
      primary_action: inferPrimaryAction(normalizedUrl, domain),
      image_url: item?.image_snapshot || null,
      metadata,
      title,
      note: item?.note || null,
      added_at: new Date(now - index * 1000).toISOString(),
    });
  }

  if (rows.length > 0) {
    const { error: insertItemsError } = await supabase.from("trip_items").insert(rows);
    if (insertItemsError) {
      await safeDeleteTrip(deleteTrip, createdTripId);
      return { savedTripId: "", copiedCount: 0, error: insertItemsError };
    }
  }

  if (typeof reloadTripItems === "function") {
    try {
      await reloadTripItems(createdTripId);
    } catch {
      // noop
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
  if (!list?.id) {
    return { status: "error", message: "List not found." };
  }
  if (typeof createTrip !== "function" || typeof deleteTrip !== "function") {
    return { status: "error", message: "Save is unavailable right now." };
  }

  const existing = await fetchSaveRow(viewerUserId, list.id);
  if (existing.error) {
    return { status: "error", message: "Couldn’t verify save status.", error: existing.error };
  }
  if (existing.row?.saved_trip_id) {
    return { status: "already_saved", savedTripId: existing.row.saved_trip_id || "" };
  }
  if (existing.row) {
    const recoveredTripId = await findSavedTripFromMetadata(list.id);
    if (recoveredTripId) {
      await attachSavedTripToSaveRow(viewerUserId, list.id, recoveredTripId);
      return { status: "already_saved", savedTripId: recoveredTripId };
    }

    const copyResult = await createPrivateCopy({
      list,
      ownerHandle,
      listItems,
      createTrip,
      deleteTrip,
      reloadTripItems,
    });
    if (copyResult.error || !copyResult.savedTripId) {
      return { status: "error", message: "Couldn’t create Stash copy.", error: copyResult.error || null };
    }

    await attachSavedTripToSaveRow(viewerUserId, list.id, copyResult.savedTripId);
    return {
      status: "saved",
      savedTripId: copyResult.savedTripId,
      copiedCount: copyResult.copiedCount,
      insertedSaveRow: false,
    };
  }

  const copyResult = await createPrivateCopy({
    list,
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

  const withTripInsert = await supabase
    .from("list_saves")
    .insert({ user_id: viewerUserId, list_id: list.id, saved_trip_id: createdTripId });

  let saveError = withTripInsert.error;
  if (saveError && saveError.code === "42703") {
    const fallbackInsert = await supabase
      .from("list_saves")
      .insert({ user_id: viewerUserId, list_id: list.id });
    saveError = fallbackInsert.error;
  }

  if (saveError) {
    if (saveError.code === "23505") {
      const afterConflict = await fetchSaveRow(viewerUserId, list.id);
      if (afterConflict.row?.saved_trip_id) {
        await safeDeleteTrip(deleteTrip, createdTripId);
        return {
          status: "already_saved",
          savedTripId: afterConflict.row.saved_trip_id || "",
        };
      }

      await attachSavedTripToSaveRow(viewerUserId, list.id, createdTripId);
      const linkedRow = await fetchSaveRow(viewerUserId, list.id);
      if (linkedRow.row?.saved_trip_id) {
        return {
          status: "already_saved",
          savedTripId: linkedRow.row.saved_trip_id || "",
        };
      }

      const recoveredTripId = await findSavedTripFromMetadata(list.id);
      if (recoveredTripId) {
        await attachSavedTripToSaveRow(viewerUserId, list.id, recoveredTripId);
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
