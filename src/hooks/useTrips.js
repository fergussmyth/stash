import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./useAuth";

const STORAGE_KEY = "airbnb_trip_shortlists_v1";
const TripsContext = createContext(null);

function makeShareId(length = 12) {
  const base =
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36);
  return base.replace(/[^a-z0-9]/gi, "").slice(0, length);
}

function titleCase(input = "") {
  return input
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function safeParse(json, fallback) {
  try {
    const parsed = JSON.parse(json);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function TripsProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [localImportAvailable, setLocalImportAvailable] = useState(false);
  const [localTripsCache, setLocalTripsCache] = useState([]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = safeParse(raw, []);
    const localTrips = Array.isArray(data) ? data : [];
    setLocalTripsCache(localTrips);
  }, []);

  useEffect(() => {
    setLocalImportAvailable(!!user && localTripsCache.length > 0);
  }, [user, localTripsCache]);

  const tripsById = useMemo(() => {
    const map = new Map();
    for (const t of trips) map.set(t.id, t);
    return map;
  }, [trips]);

  async function loadTrips() {
    if (!user) {
      setTrips([]);
      return;
    }
    setLoading(true);

    let { data: tripsData, error: tripsError } = await supabase
      .from("trips")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (tripsError) {
      // eslint-disable-next-line no-console
      console.error("Failed to load trips:", tripsError.message);
      const retry = await supabase
        .from("trips")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });
      if (retry.error) {
        // eslint-disable-next-line no-console
        console.error("Retry load trips failed:", retry.error.message);
        setTrips([]);
        setLoading(false);
        return;
      }
      tripsData = retry.data;
      tripsError = null;
    }

    const tripIds = tripsData.map((t) => t.id);
    let itemsData = [];

    if (tripIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("trip_items")
        .select("*")
        .in("trip_id", tripIds)
        .order("added_at", { ascending: false });

      if (itemsError) {
        // eslint-disable-next-line no-console
        console.error("Failed to load items:", itemsError.message);
      } else {
        itemsData = items || [];
      }
    }

    const itemsByTrip = new Map();
    for (const item of itemsData) {
      const list = itemsByTrip.get(item.trip_id) || [];
      list.push({
        id: item.id,
        url: item.url,
        airbnbUrl: item.url,
        originalUrl: item.original_url,
        domain: item.domain,
        platform: item.platform,
        itemType: item.item_type,
        imageUrl: item.image_url,
        faviconUrl: item.favicon_url,
        metadata: item.metadata || {},
        pinned: !!item.pinned,
        archived: !!item.archived,
        title: item.title,
        note: item.note,
        sourceText: item.source_text,
        addedAt: item.added_at ? new Date(item.added_at).getTime() : 0,
      });
      itemsByTrip.set(item.trip_id, list);
    }

    const mapped = tripsData.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type || "travel",
      pinned: !!t.pinned,
      icon: t.icon || null,
      color: t.color || null,
      createdAt: t.created_at,
      items: itemsByTrip.get(t.id) || [],
      shareId: t.share_id || "",
      isShared: !!t.is_shared,
      ownerDisplayName: "",
    }));

    setTrips(mapped);
    setLoading(false);
  }

  useEffect(() => {
    if (authLoading) return;
    loadTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  async function createTrip(name, type = "travel") {
    const trimmed = (name || "").trim();
    if (!trimmed || !user) return null;
    const normalized = titleCase(trimmed);
    const normalizedType = (type || "travel").trim() || "travel";

    const { data, error } = await supabase
      .from("trips")
      .insert({ owner_id: user.id, name: normalized, type: normalizedType })
      .select("*")
      .single();

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create trip:", error.message);
      return null;
    }

    const trip = {
      id: data.id,
      name: data.name,
      type: data.type || "travel",
      pinned: !!data.pinned,
      icon: data.icon || null,
      color: data.color || null,
      createdAt: data.created_at,
      items: [],
      shareId: data.share_id || "",
      isShared: !!data.is_shared,
    };
    setTrips((prev) => [trip, ...prev]);
    return trip.id;
  }

  async function renameTrip(tripId, name) {
    const trimmed = (name || "").trim();
    if (!trimmed || !user) return;
    const normalized = titleCase(trimmed);
    const { error } = await supabase
      .from("trips")
      .update({ name: normalized })
      .eq("id", tripId)
      .eq("owner_id", user.id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to rename trip:", error.message);
      return;
    }
    setTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, name: normalized } : t)));
  }

  async function deleteTrip(tripId) {
    if (!user) return;
    await supabase.from("trip_items").delete().eq("trip_id", tripId);
    const { error } = await supabase.from("trips").delete().eq("id", tripId).eq("owner_id", user.id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete trip:", error.message);
      return;
    }
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
  }

  async function addItemToTrip(tripId, item) {
    if (!user) return;
    const existingTrip = tripsById.get(tripId);
    if (!existingTrip) return;
    const incomingUrl = item.url || item.airbnbUrl;
    if (!incomingUrl) return;
    const exists = existingTrip.items.some((i) => (i.url || i.airbnbUrl) === incomingUrl);
    if (exists) return;

    const { data, error } = await supabase
      .from("trip_items")
      .insert({
        trip_id: tripId,
        url: incomingUrl,
        original_url: item.originalUrl || null,
        domain: item.domain || null,
        platform: item.platform || null,
        item_type: item.itemType || "link",
        image_url: item.imageUrl || null,
        favicon_url: item.faviconUrl || null,
        metadata: item.metadata || {},
        pinned: !!item.pinned,
        archived: !!item.archived,
        title: item.title,
        note: item.note,
        source_text: item.sourceText,
        added_at: new Date(item.addedAt || Date.now()).toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to add item:", error.message);
      return;
    }

    const mapped = {
      id: data.id,
      url: data.url,
      airbnbUrl: data.url,
      originalUrl: data.original_url,
      domain: data.domain,
      platform: data.platform,
      itemType: data.item_type,
      imageUrl: data.image_url,
      faviconUrl: data.favicon_url,
      metadata: data.metadata || {},
      pinned: !!data.pinned,
      archived: !!data.archived,
      title: data.title,
      note: data.note,
      sourceText: data.source_text,
      addedAt: data.added_at ? new Date(data.added_at).getTime() : Date.now(),
    };

    setTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, items: [mapped, ...t.items] } : t))
    );
  }

  async function removeItem(tripId, itemId) {
    if (!user) return;
    const { error } = await supabase.from("trip_items").delete().eq("id", itemId);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to remove item:", error.message);
      return;
    }
    setTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, items: t.items.filter((i) => i.id !== itemId) } : t))
    );
  }

  async function updateItemNote(tripId, itemId, note) {
    if (!user) return;
    const { error } = await supabase.from("trip_items").update({ note }).eq("id", itemId);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update note:", error.message);
      return;
    }
    setTrips((prev) =>
      prev.map((t) =>
        t.id === tripId
          ? { ...t, items: t.items.map((i) => (i.id === itemId ? { ...i, note } : i)) }
          : t
      )
    );
  }

  async function updateItemTitle(tripId, itemId, title) {
    if (!user) return;
    const { error } = await supabase.from("trip_items").update({ title }).eq("id", itemId);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update title:", error.message);
      return;
    }
    setTrips((prev) =>
      prev.map((t) =>
        t.id === tripId
          ? { ...t, items: t.items.map((i) => (i.id === itemId ? { ...i, title } : i)) }
          : t
      )
    );
  }

  async function enableShare(tripId) {
    if (!user) return;
    const shareId = makeShareId(12);
    const { error } = await supabase
      .from("trips")
      .update({ is_shared: true, share_id: shareId })
      .eq("id", tripId)
      .eq("owner_id", user.id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to enable share:", error.message);
      return null;
    }
    setTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, shareId, isShared: true } : t))
    );
    return shareId;
  }

  async function disableShare(tripId) {
    if (!user) return;
    const { error } = await supabase
      .from("trips")
      .update({ is_shared: false, share_id: null })
      .eq("id", tripId)
      .eq("owner_id", user.id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to disable share:", error.message);
      return;
    }
    setTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, shareId: "", isShared: false } : t))
    );
  }

  async function toggleTripPinned(tripId, nextPinned) {
    if (!user) return;
    const { error } = await supabase
      .from("trips")
      .update({ pinned: !!nextPinned })
      .eq("id", tripId)
      .eq("owner_id", user.id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update pin:", error.message);
      return;
    }
    setTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, pinned: !!nextPinned } : t))
    );
  }

  async function toggleItemPinned(tripId, itemId, nextPinned) {
    if (!user) return;
    const { error } = await supabase
      .from("trip_items")
      .update({ pinned: !!nextPinned })
      .eq("id", itemId);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update item pin:", error.message);
      return;
    }
    setTrips((prev) =>
      prev.map((t) =>
        t.id === tripId
          ? {
              ...t,
              items: t.items.map((i) => (i.id === itemId ? { ...i, pinned: !!nextPinned } : i)),
            }
          : t
      )
    );
  }

  async function importLocalTrips() {
    if (!user || localTripsCache.length === 0) return;

    for (const localTrip of localTripsCache) {
      const { data: tripData, error: tripError } = await supabase
        .from("trips")
        .insert({
          owner_id: user.id,
          name: localTrip.name || "Collection",
          is_shared: !!localTrip.shareId,
          share_id: localTrip.shareId || null,
          type: localTrip.type || "travel",
        })
        .select("*")
        .single();

      if (tripError) {
        // eslint-disable-next-line no-console
        console.error("Import trip failed:", tripError.message);
        continue;
      }

      const items = (localTrip.items || []).map((item) => ({
        trip_id: tripData.id,
        url: item.airbnbUrl || item.url,
        original_url: item.originalUrl || item.airbnbUrl || item.url || null,
        domain: item.domain || null,
        platform: item.platform || null,
        item_type: item.itemType || "link",
        image_url: item.imageUrl || null,
        favicon_url: item.faviconUrl || null,
        metadata: item.metadata || {},
        pinned: !!item.pinned,
        archived: !!item.archived,
        title: item.title,
        note: item.note,
        source_text: item.sourceText,
        added_at: new Date(item.addedAt || Date.now()).toISOString(),
      }));

      if (items.length > 0) {
        const { error: itemsError } = await supabase.from("trip_items").insert(items);
        if (itemsError) {
          // eslint-disable-next-line no-console
          console.error("Import items failed:", itemsError.message);
        }
      }
    }

    localStorage.removeItem(STORAGE_KEY);
    setLocalTripsCache([]);
    setLocalImportAvailable(false);
    loadTrips();
  }

  const value = {
    trips,
    tripsById,
    loading,
    user,
    createTrip,
    renameTrip,
    deleteTrip,
    addItemToTrip,
    removeItem,
    updateItemNote,
    updateItemTitle,
    enableShare,
    disableShare,
    toggleTripPinned,
    toggleItemPinned,
    localImportAvailable,
    importLocalTrips,
  };

  return <TripsContext.Provider value={value}>{children}</TripsContext.Provider>;
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error("useTrips must be used inside <TripsProvider>");
  return ctx;
}
