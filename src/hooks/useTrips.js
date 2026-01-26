import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "airbnb_trip_shortlists_v1";
const TripsContext = createContext(null);

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function makeShareId() {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  ).replace(/[^a-z0-9]/gi, "");
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
  const [trips, setTrips] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  // load once on app start
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = safeParse(raw, []);
    setTrips(Array.isArray(data) ? data : []);
    setHydrated(true);
  }, []);

  // persist whenever trips changes
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
  }, [trips, hydrated]);

  // (optional but nice) keep in sync across tabs/windows
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== STORAGE_KEY) return;
      const data = safeParse(e.newValue, []);
      setTrips(Array.isArray(data) ? data : []);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const tripsById = useMemo(() => {
    const map = new Map();
    for (const t of trips) map.set(t.id, t);
    return map;
  }, [trips]);

  function createTrip(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    const normalized = titleCase(trimmed);

    const trip = {
      id: uid(),
      name: normalized,
      createdAt: Date.now(),
      items: [],
    };
    setTrips((prev) => [trip, ...prev]);
    return trip.id;
  }

  function deleteTrip(tripId) {
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
  }

  function addItemToTrip(tripId, item) {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t;

        const exists = t.items.some((i) => i.airbnbUrl === item.airbnbUrl);
        if (exists) return t;

        return { ...t, items: [item, ...t.items] };
      })
    );
  }

  function enableShare(tripId) {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t;
        if (t.shareId) return t;
        return { ...t, shareId: makeShareId() };
      })
    );
  }

  function disableShare(tripId) {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t;
        const { shareId, ...rest } = t;
        return { ...rest };
      })
    );
  }

  function removeItem(tripId, itemId) {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t;
        return { ...t, items: t.items.filter((i) => i.id !== itemId) };
      })
    );
  }

  function updateItemNote(tripId, itemId, note) {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t;
        return {
          ...t,
          items: t.items.map((i) => (i.id === itemId ? { ...i, note } : i)),
        };
      })
    );
  }

  function updateItemTitle(tripId, itemId, title) {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t;
        return {
          ...t,
          items: t.items.map((i) => (i.id === itemId ? { ...i, title } : i)),
        };
      })
    );
  }

  function clearAll() {
    setTrips([]);
  }

  const value = {
    trips,
    tripsById,
    createTrip,
    deleteTrip,
    addItemToTrip,
    removeItem,
    updateItemNote,
    updateItemTitle,
    enableShare,
    disableShare,
    clearAll,
  };

  return <TripsContext.Provider value={value}>{children}</TripsContext.Provider>;
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error("useTrips must be used inside <TripsProvider>");
  return ctx;
}
