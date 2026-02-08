export function mapProfileRow(row) {
  if (!row) return null;
  return {
    user_id: row.id,
    handle: row.handle ?? null,
    display_name: row.display_name ?? null,
    bio: row.bio ?? null,
    avatar_url: row.avatar_url ?? null,
    is_public: row.is_public ?? true,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export function mapListRow(row) {
  if (!row) return null;
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
    save_count: row.save_count ?? 0,
    view_count: row.view_count ?? 0,
    last_saved_at: row.last_saved_at ?? null,
    last_viewed_at: row.last_viewed_at ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export function mapListItemRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    list_id: row.list_id,
    item_id: row.item_id ?? null,
    url: row.url,
    title_snapshot: row.title_snapshot ?? null,
    image_snapshot: row.image_snapshot ?? null,
    domain_snapshot: row.domain_snapshot ?? null,
    price_snapshot: row.price_snapshot ?? null,
    rating_snapshot: row.rating_snapshot ?? null,
    meta_json: row.meta_json || {},
    rank_index: row.rank_index,
    note: row.note ?? null,
    created_at: row.created_at ?? null,
  };
}

