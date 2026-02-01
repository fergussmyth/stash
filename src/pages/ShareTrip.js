import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function humanizeSlugTitle(pathname = "", hostname = "") {
  const cleanPath = (pathname || "").replace(/\/+$/, "");
  if (!cleanPath || cleanPath === "/") return hostname.replace(/^www\./, "");
  const parts = cleanPath.split("/").filter(Boolean);
  let slug = parts[parts.length - 1] || "";
  const prdIndex = parts.findIndex((p) => p.toLowerCase() === "prd");
  if (prdIndex > 0) {
    slug = parts[prdIndex - 1] || slug;
  }
  if (/^\d+$/.test(slug)) return hostname.replace(/^www\./, "");
  const words = slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return hostname.replace(/^www\./, "");
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

function fallbackTitleForUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("airbnb.")) {
      const match = url?.match(/\/rooms\/(\d+)/i);
      return match ? `Airbnb room ${match[1]}` : "Airbnb room";
    }
    return humanizeSlugTitle(parsed.pathname, parsed.hostname);
  } catch {
    return "Saved link";
  }
}

function getDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function buildMetadataChips(metadata = {}) {
  const chips = [];
  if (metadata.rating != null) chips.push(`⭐ ${metadata.rating}`);
  if (metadata.beds != null) chips.push(`${metadata.beds} beds`);
  if (metadata.bedrooms != null) chips.push(`${metadata.bedrooms} bedrooms`);
  if (metadata.bathrooms != null) chips.push(`${metadata.bathrooms} bathrooms`);
  if (metadata.guests != null) chips.push(`${metadata.guests} guests`);
  return chips;
}

function formatSharedBy(displayName) {
  if (displayName) return displayName;
  return "a Stash user";
}

function titleCase(input = "") {
  return input
    .trim()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ""))
    .join(" ");
}

function decodeHtmlEntities(text = "") {
  if (!text) return "";
  if (typeof document === "undefined") return text;
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

function splitTitleParts(title, fallbackUrl) {
  const base = decodeHtmlEntities((title || "").trim()) || fallbackTitleForUrl(fallbackUrl);
  const parts = base.split(/\s*[•·]\s*/);
  if (parts.length <= 1) {
    return { main: base, meta: [] };
  }
  return { main: parts[0], meta: parts.slice(1) };
}

function splitMetaParts(parts = []) {
  let rating = "";
  const chips = [];
  for (const part of parts) {
    const trimmed = (part || "").trim();
    if (!trimmed) continue;
    if (!rating && /^[⭐★]\s*\d/.test(trimmed)) {
      rating = trimmed.replace(/^[⭐★]\s*/, "");
      continue;
    }
    chips.push(trimmed);
  }
  return { rating, chips };
}

export default function ShareTrip() {
  const { shareId } = useParams();
  const [trip, setTrip] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ownerDisplayName, setOwnerDisplayName] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadSharedTrip() {
      setLoading(true);
      setLoadError("");
      const { data: tripData, error } = await supabase
        .from("trips")
        .select("id,name,owner_id,share_id,is_shared")
        .eq("share_id", shareId)
        .eq("is_shared", true)
        .single();

      if (!mounted) return;

      if (error || !tripData) {
        if (error) {
          setLoadError(error.message || "Shared collection unavailable.");
        }
        setTrip(null);
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from("trip_items")
        .select("*")
        .eq("trip_id", tripData.id)
        .order("added_at", { ascending: false });

      if (!mounted) return;
      if (itemsError) {
        setLoadError(itemsError.message || "Shared items unavailable.");
      }

      setTrip({
        id: tripData.id,
        name: tripData.name,
      });
      if (tripData.owner_id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", tripData.owner_id)
          .single();
        if (!mounted) return;
        setOwnerDisplayName(profileData?.display_name || "");
      }
      setItems(
        (itemsData || []).map((item) => ({
          id: item.id,
          url: item.url,
          airbnbUrl: item.url,
          domain: item.domain,
          metadata: item.metadata || {},
          title: item.title,
          note: item.note,
        }))
      );
      setLoading(false);
    }

    loadSharedTrip();
    return () => {
      mounted = false;
    };
  }, [shareId]);

  if (!trip && !loading) {
    return (
      <div className="page">
        <div className="card glow">
          <h1>
            Share <span>Link</span>
          </h1>

          <div className="content">
            <p className="muted">That share link doesn’t exist (or was disabled).</p>
            {loadError && <p className="warning">{loadError}</p>}
            <div className="navRow">
              <Link className="miniBtn linkBtn" to="/">
                Stash
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card glow">
        <h1>
          {trip?.name || "Collection"} <span>Shared</span>
        </h1>
        {!loading && trip && (
          <div className="sharedByLine">
            Shared by {titleCase(formatSharedBy(ownerDisplayName))}
          </div>
        )}

        <div className="content">
          {loadError && <p className="warning">{loadError}</p>}
          {!loading && trip && <div className="readOnlyBadge">Read-only</div>}
          {loading ? (
            <p className="muted">Loading shared collection...</p>
          ) : items.length === 0 ? (
            <p className="muted">Nothing here yet — stash something.</p>
          ) : (
            <div className="itemList">
              {items.map((item) => (
                <div key={item.id} className="itemCard">
                  <div className="itemTop">
                    {(() => {
                      const titleParts = splitTitleParts(item.title, item.airbnbUrl);
                      const { rating, chips } = splitMetaParts(titleParts.meta);
                      const metadataChips = buildMetadataChips(item.metadata);
                      const domainChip = item.domain || getDomain(item.airbnbUrl);
                      const displayChips =
                        metadataChips.length > 0
                          ? metadataChips
                          : domainChip
                            ? [domainChip]
                            : [];
                      return (
                        <div className="itemTitleBlock">
                          <a
                            className="itemTitleLink"
                            href={item.airbnbUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {titleParts.main}
                          </a>
                          {(rating || chips.length > 0 || displayChips.length > 0) && (
                            <div className="itemMetaRow">
                              {rating && <span className="ratingPill">⭐ {rating}</span>}
                              {chips.length > 0 && (
                                <div className="metaChips">
                                  {chips.map((part) => (
                                    <span key={part} className="metaChip">
                                      {part}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {displayChips.length > 0 && (
                                <div className="metaChips">
                                  {displayChips.map((part) => (
                                    <span key={part} className="metaChip">
                                      {part}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
