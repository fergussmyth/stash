import { NotFoundError, ValidationError } from "./errors.js";
import {
  requireAuthToken,
  validateHandle,
  validateListVisibility,
  validateRankedConfig,
  validateSection,
  validateSlug,
} from "./validators.js";
import { mapListItemRow, mapListRow, mapProfileRow } from "./models.js";

function requireUuid(input, field) {
  const value = String(input || "").trim();
  if (!value) throw new ValidationError(`${field} is required.`, { field });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ValidationError(`${field} must be a UUID.`, { field });
  }
  return value;
}

function requireUrl(input) {
  const url = String(input || "").trim();
  if (!url) throw new ValidationError("url is required.", { field: "url" });
  if (!/^https?:\/\//i.test(url)) {
    throw new ValidationError("url must start with http:// or https://", { field: "url" });
  }
  return url;
}

export function createSocialService(rest) {
  if (!rest) throw new Error("createSocialService requires a REST client");

  const getProfileByHandle = async (handle, { authToken } = {}) => {
    const normalizedHandle = validateHandle(handle);
    const row = await rest.selectOne(
      "profiles",
      {
        select: "id,handle,display_name,bio,avatar_url,is_public,created_at,updated_at",
        filters: { handle: `eq.${normalizedHandle}` },
      },
      { authToken }
    );
    return mapProfileRow(row);
  };

  const getPublicListsByUser = async ({ handle, userId }, { authToken } = {}) => {
    let resolvedUserId = userId ? requireUuid(userId, "user_id") : "";

    if (!resolvedUserId) {
      const profile = await getProfileByHandle(handle, { authToken });
      if (!profile) return [];
      resolvedUserId = profile.user_id;
    }

    const rows = await rest.select(
      "lists",
      {
        select:
          "id,owner_user_id,section,title,subtitle,slug,cover_image_url,visibility,is_ranked,ranked_size,pinned_order,save_count,view_count,last_saved_at,last_viewed_at,created_at,updated_at",
        filters: {
          owner_user_id: `eq.${resolvedUserId}`,
          visibility: "eq.public",
        },
        order: [
          { column: "pinned_order", ascending: true, nulls: "nullslast" },
          { column: "created_at", ascending: false },
        ],
      },
      { authToken }
    );
    return rows.map(mapListRow);
  };

  const getListByHandleAndSlug = async (handle, slug, { authToken } = {}) => {
    const normalizedHandle = validateHandle(handle);
    const normalizedSlug = validateSlug(slug);

    const profileRow = await rest.selectOne(
      "profiles",
      { select: "id", filters: { handle: `eq.${normalizedHandle}` } },
      { authToken }
    );
    const ownerId = profileRow?.id;
    if (!ownerId) return null;

    const listRow = await rest.selectOne(
      "lists",
      {
        select:
          "id,owner_user_id,section,title,subtitle,slug,cover_image_url,visibility,is_ranked,ranked_size,pinned_order,save_count,view_count,last_saved_at,last_viewed_at,created_at,updated_at",
        filters: { owner_user_id: `eq.${ownerId}`, slug: `eq.${normalizedSlug}` },
      },
      { authToken }
    );
    if (!listRow) return null;

    const itemRows = await rest.select(
      "list_items",
      {
        select:
          "id,list_id,item_id,url,title_snapshot,image_snapshot,domain_snapshot,price_snapshot,rating_snapshot,meta_json,rank_index,note,created_at",
        filters: { list_id: `eq.${listRow.id}` },
        order: [{ column: "rank_index", ascending: true }],
      },
      { authToken }
    );

    return { list: mapListRow(listRow), items: itemRows.map(mapListItemRow) };
  };

  const followUser = async ({ handle, userId }, { authToken } = {}) => {
    requireAuthToken(authToken);
    let followingUserId = userId ? requireUuid(userId, "user_id") : "";
    if (!followingUserId) {
      const profile = await getProfileByHandle(handle, { authToken });
      if (!profile?.user_id) throw new NotFoundError("User not found.");
      followingUserId = profile.user_id;
    }
    await rest.insert("follows", { following_user_id: followingUserId }, { authToken });
    return { ok: true };
  };

  const unfollowUser = async ({ userId }, { authToken } = {}) => {
    requireAuthToken(authToken);
    const followingUserId = requireUuid(userId, "user_id");
    await rest.remove(
      "follows",
      { following_user_id: `eq.${followingUserId}` },
      { authToken }
    );
    return { ok: true };
  };

  const saveList = async ({ listId }, { authToken } = {}) => {
    requireAuthToken(authToken);
    const id = requireUuid(listId, "list_id");
    await rest.insert("list_saves", { list_id: id }, { authToken });
    return { ok: true };
  };

  const unsaveList = async ({ listId }, { authToken } = {}) => {
    requireAuthToken(authToken);
    const id = requireUuid(listId, "list_id");
    await rest.remove("list_saves", { list_id: `eq.${id}` }, { authToken });
    return { ok: true };
  };

  const createList = async (input, { authToken } = {}) => {
    requireAuthToken(authToken);
    const section = validateSection(input?.section);
    const visibility = validateListVisibility(input?.visibility);
    const title = String(input?.title || "").trim();
    if (!title) throw new ValidationError("title is required.", { field: "title" });
    const slug = validateSlug(input?.slug);
    const subtitle = input?.subtitle == null ? null : String(input.subtitle).trim() || null;
    const coverImageUrl =
      input?.cover_image_url == null ? null : String(input.cover_image_url).trim() || null;
    const pinnedOrder = input?.pinned_order == null ? null : Number(input.pinned_order);

    const rankedConfig = validateRankedConfig({
      isRanked: input?.is_ranked,
      rankedSize: input?.ranked_size,
    });

    const [row] = await rest.insert(
      "lists",
      {
        section,
        title,
        subtitle,
        slug,
        cover_image_url: coverImageUrl,
        visibility,
        pinned_order: Number.isFinite(pinnedOrder) ? Math.trunc(pinnedOrder) : null,
        ...rankedConfig,
      },
      { authToken }
    );
    return mapListRow(row);
  };

  const updateList = async (listId, input, { authToken } = {}) => {
    requireAuthToken(authToken);
    const id = requireUuid(listId, "list_id");

    const patch = {};
    if (input?.section != null) patch.section = validateSection(input.section);
    if (input?.visibility != null) patch.visibility = validateListVisibility(input.visibility);
    if (input?.title != null) {
      const nextTitle = String(input.title || "").trim();
      if (!nextTitle) throw new ValidationError("title cannot be empty.", { field: "title" });
      patch.title = nextTitle;
    }
    if (input?.subtitle !== undefined) {
      patch.subtitle = input.subtitle == null ? null : String(input.subtitle).trim() || null;
    }
    if (input?.slug != null) patch.slug = validateSlug(input.slug);
    if (input?.cover_image_url !== undefined) {
      patch.cover_image_url =
        input.cover_image_url == null ? null : String(input.cover_image_url).trim() || null;
    }
    if (input?.pinned_order !== undefined) {
      const nextPinned = input.pinned_order == null ? null : Number(input.pinned_order);
      patch.pinned_order = Number.isFinite(nextPinned) ? Math.trunc(nextPinned) : null;
    }
    if (input?.is_ranked !== undefined || input?.ranked_size !== undefined) {
      Object.assign(
        patch,
        validateRankedConfig({
          isRanked: input?.is_ranked,
          rankedSize: input?.ranked_size,
        })
      );
    }

    const rows = await rest.update("lists", { id: `eq.${id}` }, patch, { authToken });
    const row = rows[0] || null;
    if (!row) throw new NotFoundError("List not found.");
    return mapListRow(row);
  };

  const deleteList = async (listId, { authToken } = {}) => {
    requireAuthToken(authToken);
    const id = requireUuid(listId, "list_id");
    await rest.remove("lists", { id: `eq.${id}` }, { authToken });
    return { ok: true };
  };

  const addListItem = async (listId, input, { authToken } = {}) => {
    requireAuthToken(authToken);
    const id = requireUuid(listId, "list_id");
    const url = requireUrl(input?.url);

    const rankIndex = Number(input?.rank_index);
    if (!Number.isFinite(rankIndex) || Math.trunc(rankIndex) < 1) {
      throw new ValidationError("rank_index must be a positive number.", {
        field: "rank_index",
      });
    }

    const itemId = input?.item_id ? requireUuid(input.item_id, "item_id") : null;
    const note = input?.note == null ? null : String(input.note).trim() || null;

    const [row] = await rest.insert(
      "list_items",
      {
        list_id: id,
        item_id: itemId,
        url,
        title_snapshot: input?.title_snapshot ?? null,
        image_snapshot: input?.image_snapshot ?? null,
        domain_snapshot: input?.domain_snapshot ?? null,
        price_snapshot: input?.price_snapshot ?? null,
        rating_snapshot: input?.rating_snapshot ?? null,
        meta_json: input?.meta_json ?? {},
        rank_index: Math.trunc(rankIndex),
        note,
      },
      { authToken }
    );
    return mapListItemRow(row);
  };

  const updateListItem = async (listItemId, input, { authToken } = {}) => {
    requireAuthToken(authToken);
    const id = requireUuid(listItemId, "list_item_id");

    const patch = {};
    if (input?.rank_index !== undefined) {
      const rankIndex = Number(input?.rank_index);
      if (!Number.isFinite(rankIndex) || Math.trunc(rankIndex) < 1) {
        throw new ValidationError("rank_index must be a positive number.", {
          field: "rank_index",
        });
      }
      patch.rank_index = Math.trunc(rankIndex);
    }
    if (input?.note !== undefined) patch.note = input.note == null ? null : String(input.note).trim() || null;
    if (input?.title_snapshot !== undefined) patch.title_snapshot = input.title_snapshot ?? null;
    if (input?.image_snapshot !== undefined) patch.image_snapshot = input.image_snapshot ?? null;
    if (input?.domain_snapshot !== undefined) patch.domain_snapshot = input.domain_snapshot ?? null;
    if (input?.price_snapshot !== undefined) patch.price_snapshot = input.price_snapshot ?? null;
    if (input?.rating_snapshot !== undefined) patch.rating_snapshot = input.rating_snapshot ?? null;
    if (input?.meta_json !== undefined) patch.meta_json = input.meta_json ?? {};

    const rows = await rest.update("list_items", { id: `eq.${id}` }, patch, { authToken });
    const row = rows[0] || null;
    if (!row) throw new NotFoundError("List item not found.");
    return mapListItemRow(row);
  };

  const reorderListItems = async (listId, itemIds, { authToken } = {}) => {
    requireAuthToken(authToken);
    const id = requireUuid(listId, "list_id");
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      throw new ValidationError("item_ids must be a non-empty array.", { field: "item_ids" });
    }
    const normalizedIds = itemIds.map((itemId) => requireUuid(itemId, "item_id"));
    await rest.rpc("reorder_list_items", { list_id: id, item_ids: normalizedIds }, { authToken });
    return { ok: true };
  };

  const removeListItem = async (listItemId, { authToken } = {}) => {
    requireAuthToken(authToken);
    const id = requireUuid(listItemId, "list_item_id");
    await rest.remove("list_items", { id: `eq.${id}` }, { authToken });
    return { ok: true };
  };

  const recordListView = async ({ listId, referrer = null }, { authToken } = {}) => {
    const id = requireUuid(listId, "list_id");
    const payload = { list_id: id };
    if (referrer) payload.referrer = String(referrer).slice(0, 2048);

    await rest.insert("list_views", payload, { authToken });
    return { ok: true };
  };

  return {
    getProfileByHandle,
    getPublicListsByUser,
    getListByHandleAndSlug,
    followUser,
    unfollowUser,
    saveList,
    unsaveList,
    createList,
    updateList,
    deleteList,
    addListItem,
    updateListItem,
    reorderListItems,
    removeListItem,
    recordListView,
  };
}
