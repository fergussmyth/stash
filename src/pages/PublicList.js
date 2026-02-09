import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import { savePublicListToStash, unsavePublicListFromStash, getSavedListsByIds } from "../lib/socialSave";
import { getPublishedCollectionByHandleAndSlug } from "../lib/publishedCollections";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import stashLogo from "../assets/icons/stash-favicon.png";
import userIcon from "../assets/icons/user.png";
import shareIcon from "../assets/icons/share.png";
import saveIcon from "../assets/icons/save-.png";
import saveFilledIcon from "../assets/icons/save-filled.png";

function normalizeHandleParam(input = "") {
  return String(input || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function normalizeSlugParam(input = "") {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

function displayNameForProfile(profile) {
  if (!profile) return "";
  return profile.display_name || "Stash user";
}

function sectionLabel(section = "") {
  const normalized = String(section || "").toLowerCase();
  if (normalized === "travel") return "Travel";
  if (normalized === "fashion") return "Fashion";
  return "General";
}

function visibilityLabel(value = "") {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "public") return "Public";
  if (normalized === "unlisted") return "Unlisted";
  return "Private";
}

function makeCoverGradient(seed) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  const colors = ["#0f172a", "#1e293b", "#0b3b5e", "#1f2a44", "#2b3655", "#0f3d3e"];
  const pick = (offset) => colors[Math.abs(hash + offset) % colors.length];
  return `linear-gradient(135deg, ${pick(0)} 0%, ${pick(2)} 50%, ${pick(4)} 100%)`;
}

function getDomain(url = "") {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function parseMeta(meta) {
  if (!meta) return null;
  if (typeof meta === "object") return meta;
  try {
    return JSON.parse(String(meta));
  } catch {
    return null;
  }
}

function firstNonEmpty(values = []) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function extractImageFromMeta(meta) {
  const parsed = parseMeta(meta);
  if (!parsed || typeof parsed !== "object") return "";

  const direct = firstNonEmpty([
    parsed.image,
    parsed.image_url,
    parsed.imageUrl,
    parsed.imageURL,
    parsed.preview_image,
    parsed.previewImage,
    parsed.og_image,
    parsed.ogImage,
    parsed.thumbnail,
    parsed.thumbnail_url,
    parsed.thumbnailUrl,
    parsed.photo,
    parsed.photo_url,
    parsed.photoUrl,
  ]);
  if (direct) return direct;

  if (Array.isArray(parsed.images)) {
    for (const image of parsed.images) {
      if (typeof image === "string" && image.trim()) return image.trim();
      if (image && typeof image === "object") {
        const nested = firstNonEmpty([image.url, image.src, image.image, image.image_url]);
        if (nested) return nested;
      }
    }
  }

  if (parsed.og && typeof parsed.og === "object") {
    const ogImage = firstNonEmpty([parsed.og.image, parsed.og.image_url, parsed.og.imageUrl]);
    if (ogImage) return ogImage;
  }

  return "";
}

function resolveItemImage(item) {
  const direct = String(item?.image_snapshot || item?.image_url || "").trim();
  if (direct) return direct;
  const meta = extractImageFromMeta(item?.meta_json || item?.metadata);
  if (meta) return meta;
  return String(item?.favicon_snapshot || item?.favicon_url || "").trim();
}

function formatRating(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num % 1 === 0 ? String(num) : num.toFixed(1);
}

function buildMetaChips(item) {
  const chips = [];
  const meta = parseMeta(item?.meta_json || item?.metadata);
  const price = item?.price_snapshot || meta?.price || meta?.source_price_snapshot;
  if (price) chips.push(String(price));

  const location =
    meta?.location ||
    meta?.neighborhood ||
    meta?.city ||
    meta?.region ||
    meta?.area ||
    meta?.place ||
    meta?.destination;
  if (location && typeof location === "string") chips.push(location);

  const rating =
    item?.rating_snapshot ||
    meta?.rating ||
    meta?.ratingValue ||
    meta?.review_rating ||
    meta?.source_rating_snapshot;
  const normalizedRating = formatRating(rating);
  if (normalizedRating) chips.push(`★ ${normalizedRating}`);

  return chips;
}

function splitInlineTitleMeta(rawTitle = "") {
  const normalized = String(rawTitle || "").trim();
  if (!normalized) return { title: "", chips: [] };

  const parts = normalized
    .split(/[·•]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { title: normalized, chips: [] };
  }

  return {
    title: parts[0] || normalized,
    chips: parts.slice(1),
  };
}

function dedupeChips(chips = []) {
  const seen = new Set();
  const result = [];
  for (const chip of chips) {
    const value = String(chip || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function isAirbnbFallbackTitle(title = "", url = "", domain = "") {
  const normalizedTitle = String(title || "").trim().toLowerCase();
  const normalizedUrl = String(url || "").toLowerCase();
  const normalizedDomain = String(domain || "").toLowerCase();
  const looksLikeAirbnb =
    normalizedDomain.includes("airbnb.") || normalizedUrl.includes("airbnb.");
  if (!looksLikeAirbnb) return false;
  return /^airbnb room(?:\s+\d+)?$/.test(normalizedTitle);
}

async function fetchResolvedAirbnbTitle(url = "") {
  const cleanedUrl = String(url || "").trim();
  if (!cleanedUrl) return "";

  try {
    const titleResponse = await fetch("/fetch-airbnb-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: cleanedUrl }),
    });
    const titleData = await titleResponse.json();
    const directTitle = String(titleData?.title || "").trim();
    if (directTitle) return directTitle;
  } catch {
    // best effort fallback below
  }

  try {
    const previewResponse = await fetch("/fetch-link-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: cleanedUrl }),
    });
    const previewData = await previewResponse.json();
    const previewTitle = String(previewData?.title || "").trim();
    if (previewTitle) return previewTitle;
  } catch {
    // no-op
  }

  return "";
}

export default function PublicList() {
  const params = useParams();
  const rawHandle = params.handle || "";
  const rawSlug = params.listSlug || "";
  const isPublicHandlePath = String(rawHandle || "").trim().startsWith("@");
  const handle = normalizeHandleParam(rawHandle);
  const listSlug = normalizeSlugParam(rawSlug);

  const { user, loading: authLoading } = useAuth();
  const viewerUserId = user?.id || null;
  const { trips, createTrip, deleteTrip, reloadTripItems } = useTrips();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [profile, setProfile] = useState(null);
  const [collection, setCollection] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingCollection, setLoadingCollection] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const [isSaved, setIsSaved] = useState(false);
  const [checkingSaved, setCheckingSaved] = useState(false);
  const [saveWorking, setSaveWorking] = useState(false);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [resolvedTitleByItemId, setResolvedTitleByItemId] = useState({});
  const [resolvedPreviewByItemId, setResolvedPreviewByItemId] = useState({});

  const categoryCounts = useMemo(
    () =>
      ["general", "travel", "fashion"].reduce((acc, category) => {
        acc[category] = trips.filter((trip) => (trip.type || "general") === category).length;
        return acc;
      }, {}),
    [trips]
  );

  const isOwner = !!viewerUserId && !!profile?.id && viewerUserId === profile.id;
  const listTitle = collection?.title || "Collection";
  const listSubtitle = collection?.subtitle || "";
  const section = collection?.section || "general";
  const listVisibility = collection?.visibility || "private";
  const showRank = !!collection?.is_ranked;
  const rankedSize = collection?.ranked_size || null;
  const saveCount = Number(collection?.save_count || 0);
  const fromExplore = location.state?.fromExplore === true;
  const backTo = fromExplore ? "/explore" : user ? "/trips" : "/explore";
  const backLabel = fromExplore ? "Explore" : user ? "Collections" : "Explore";

  const coverSeed = useMemo(
    () => `${collection?.id || ""}-${collection?.title || ""}-${profile?.id || ""}`,
    [collection?.id, collection?.title, profile?.id]
  );
  const fallbackGradient = useMemo(() => makeCoverGradient(coverSeed), [coverSeed]);
  const firstItemCoverImage = useMemo(() => {
    for (const item of items || []) {
      const image = resolveItemImage(item);
      if (image) return image;
    }
    return "";
  }, [items]);
  const coverImageUrl = collection?.cover_image_url || firstItemCoverImage || "";
  const isGradientCover =
    (coverImageUrl || "").startsWith("linear-gradient") ||
    (coverImageUrl || "").startsWith("radial-gradient");
  const isImageCover =
    !!coverImageUrl && !isGradientCover && !(coverImageUrl || "").startsWith("data:");
  const coverBackground = isGradientCover && coverImageUrl ? coverImageUrl : fallbackGradient;

  function setToast(message) {
    setToastMsg(message);
    setTimeout(() => setToastMsg(""), 1500);
  }

  async function copyTextWithFallback(value = "") {
    const text = String(value || "").trim();
    if (!text) return false;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // continue to legacy fallback
      }
    }

    try {
      const input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      input.style.pointerEvents = "none";
      input.style.top = "-9999px";
      document.body.appendChild(input);
      input.select();
      input.setSelectionRange(0, text.length);
      const copied = document.execCommand("copy");
      document.body.removeChild(input);
      return !!copied;
    } catch {
      return false;
    }
  }

  async function shareLink({ title = "", text = "", url = "", onUnavailable = null } = {}) {
    const shareUrl = String(url || "").trim();
    if (!shareUrl) return;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    const copied = await copyTextWithFallback(shareUrl);
    if (copied) {
      setToast("Link copied");
      return;
    }

    if (typeof onUnavailable === "function") {
      onUnavailable();
      return;
    }

    try {
      window.prompt("Copy this link", shareUrl);
    } catch {
      // no-op
    }
    setToast("Share unavailable on this device");
  }

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    setProfile(null);
    setCollection(null);
    setItems([]);
    setLoadingCollection(true);
    setNotFound(false);
    setLoadError("");
    setIsSaved(false);
    setCheckingSaved(false);
    setToastMsg("");
    setCoverLoaded(false);
    setResolvedTitleByItemId({});
    setResolvedPreviewByItemId({});

    async function load() {
      if (!isPublicHandlePath || !handle || !listSlug) {
        if (!active) return;
        setNotFound(true);
        setLoadingCollection(false);
        return;
      }

      const result = await getPublishedCollectionByHandleAndSlug({
        handleInput: handle,
        slugInput: listSlug,
        viewerUserId,
        trackView: true,
        referrer: typeof window !== "undefined" ? window.location.pathname : "",
      });

      if (!active) return;
      if (result.status !== "ok" || !result.collection || !result.profile) {
        setNotFound(true);
        setLoadingCollection(false);
        return;
      }

      setProfile(result.profile);
      setCollection(result.collection);
      setItems(result.items || []);
      setLoadingCollection(false);

      const canonicalSlug = String(result.collection.slug || "").trim();
      if (canonicalSlug && canonicalSlug !== listSlug) {
        navigate(`/@${handle}/${canonicalSlug}`, { replace: true });
      }

      if (viewerUserId) {
        setCheckingSaved(true);
        const savedLookup = await getSavedListsByIds({
          viewerUserId,
          listIds: [result.collection.id],
        });
        if (!active) return;
        const savedEntry = savedLookup.map.get(result.collection.id);
        if (savedEntry) {
          setIsSaved(true);
        }
        setCheckingSaved(false);
      }

      if (result.error) {
        setLoadError("Could not load all collection details.");
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [authLoading, handle, isPublicHandlePath, listSlug, navigate, viewerUserId]);

  useEffect(() => {
    let active = true;
    const candidates = (items || [])
      .map((item) => {
        const domain = item.domain_snapshot || item.domain || getDomain(item.url || "");
        const baseTitle = item.title_snapshot || item.title || domain || "Saved link";
        if (!isAirbnbFallbackTitle(baseTitle, item.url, domain)) return null;
        return { id: item.id, url: item.url, baseTitle };
      })
      .filter(Boolean);

    if (!candidates.length) return () => {
      active = false;
    };

    Promise.all(
      candidates.map(async (candidate) => {
        const resolvedTitle = await fetchResolvedAirbnbTitle(candidate.url);
        if (!resolvedTitle) return null;
        if (resolvedTitle.trim().toLowerCase() === String(candidate.baseTitle).trim().toLowerCase()) {
          return null;
        }
        return { id: candidate.id, title: resolvedTitle };
      })
    ).then((rows) => {
      if (!active) return;
      const next = {};
      for (const row of rows) {
        if (!row?.id || !row?.title) continue;
        next[row.id] = row.title;
      }
      if (Object.keys(next).length) {
        setResolvedTitleByItemId((prev) => ({ ...prev, ...next }));
      }
    });

    return () => {
      active = false;
    };
  }, [items]);

  useEffect(() => {
    let active = true;
    const candidates = (items || [])
      .map((item) => {
        const existingImage = resolveItemImage(item);
        if (existingImage) return null;
        const url = String(item?.url || "").trim();
        if (!url) return null;
        return { id: item.id, url, domain: item.domain_snapshot || item.domain || getDomain(url), baseTitle: item.title_snapshot || item.title || "" };
      })
      .filter(Boolean);

    if (!candidates.length) {
      return () => {
        active = false;
      };
    }

    Promise.all(
      candidates.map(async (candidate) => {
        try {
          const response = await fetch("/fetch-link-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: candidate.url }),
          });
          const data = await response.json();
          const imageUrl = String(data?.imageUrl || "").trim();
          const title = String(data?.title || "").trim();
          return {
            id: candidate.id,
            imageUrl,
            title:
              title && isAirbnbFallbackTitle(candidate.baseTitle, candidate.url, candidate.domain)
                ? title
                : "",
          };
        } catch {
          return null;
        }
      })
    ).then((rows) => {
      if (!active) return;
      const nextPreview = {};
      const nextTitles = {};
      for (const row of rows) {
        if (!row?.id) continue;
        if (row.imageUrl) nextPreview[row.id] = row.imageUrl;
        if (row.title) nextTitles[row.id] = row.title;
      }
      if (Object.keys(nextPreview).length) {
        setResolvedPreviewByItemId((prev) => ({ ...prev, ...nextPreview }));
      }
      if (Object.keys(nextTitles).length) {
        setResolvedTitleByItemId((prev) => ({ ...prev, ...nextTitles }));
      }
    });

    return () => {
      active = false;
    };
  }, [items]);

  async function toggleSave() {
    if (!collection) return;
    if (!viewerUserId) {
      navigate("/login");
      return;
    }
    if (saveWorking) return;
    if (isSaved) {
      setSaveWorking(true);
      try {
        const result = await unsavePublicListFromStash({
          viewerUserId,
          listId: collection.id,
          deleteTrip,
        });
        if (result.status === "unsaved" || result.status === "not_saved") {
          setIsSaved(false);
          if (result.status === "unsaved") {
            setCollection((prev) =>
              prev ? { ...prev, save_count: Math.max(Number(prev.save_count || 0) - 1, 0) } : prev
            );
            setToast("Removed from your Stash");
          } else {
            setToast("Not saved");
          }
          return;
        }
        setToast(result.message || "Couldn’t remove save right now.");
      } finally {
        setSaveWorking(false);
      }
      return;
    }

    setSaveWorking(true);
    try {
      const result = await savePublicListToStash({
        viewerUserId,
        list: collection,
        ownerHandle: profile?.handle || handle || "",
        listItems: items,
        createTrip,
        deleteTrip,
        reloadTripItems,
      });

      if (result.status === "saved") {
        setIsSaved(true);
        if (result.insertedSaveRow) {
          setCollection((prev) =>
            prev ? { ...prev, save_count: Number(prev.save_count || 0) + 1 } : prev
          );
        }
        setToast("Saved to your Stash");
        return;
      }

      if (result.status === "already_saved") {
        setIsSaved(true);
        setToast("Saved to your Stash");
        return;
      }

      setToast(result.message || "Couldn’t save right now.");
    } finally {
      setSaveWorking(false);
    }
  }

  async function handleShare() {
    if (!collection) return;
    const pathHandle = profile?.handle || handle;
    const pathSlug = collection?.slug || listSlug;
    const shareUrl = `${window.location.origin}/@${pathHandle}/${pathSlug}`;
    await shareLink({
      title: listTitle,
      text: listSubtitle || `${listTitle} by @${pathHandle}`,
      url: shareUrl,
    });
  }

  async function handleItemShare(event, itemUrl, itemTitle) {
    event.preventDefault();
    const normalizedUrl = String(itemUrl || "").trim();
    if (!normalizedUrl) return;

    await shareLink({
      title: itemTitle || "Shared link",
      text: listTitle,
      url: normalizedUrl,
      onUnavailable: () => {
        window.open(normalizedUrl, "_blank", "noopener,noreferrer");
      },
    });
  }

  return (
    <div className="page publicListPage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
      <AppShell
        sidebar={
          <SidebarNav
            brandIcon={<img className="sidebarBrandIcon" src={stashLogo} alt="" aria-hidden="true" />}
            activeSection={null}
            categoryCounts={categoryCounts}
            onSelectSection={(category) => {
              navigate(`/trips?category=${category}`);
              setSidebarOpen(false);
            }}
            onNavigate={() => setSidebarOpen(false)}
          />
        }
        topbar={
          <TopBar
            title="Collection"
            subtitle={profile ? displayNameForProfile(profile) : "Shared collection"}
            searchValue=""
            onSearchChange={() => {}}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            actions={
              user ? (
                <Link className="topbarIconBtn" to="/profile" aria-label="Profile">
                  <img className="topbarAvatar" src={userIcon} alt="" aria-hidden="true" />
                </Link>
              ) : (
                <Link className="topbarPill subtle" to="/login">
                  Sign in
                </Link>
              )
            }
          />
        }
        isSidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      >
        {toastMsg && <div className="toast">{toastMsg}</div>}

        <section className="panel p-5 collectionsPanel listPanel fullWidth publicListPanel">
          {notFound ? (
            <div className="collectionsEmpty">
              <div className="collectionsEmptyIcon" aria-hidden="true">
                ?
              </div>
              <div className="collectionsEmptyTitle">Collection not found</div>
              <div className="collectionsEmptyText">That page isn’t available.</div>
              <div className="navRow">
                <Link className="miniBtn linkBtn" to={handle ? `/@${handle}` : "/"}>
                  {handle ? "Back to profile" : "Back home"}
                </Link>
              </div>
            </div>
          ) : loadingCollection ? (
            <>
              <div className="publicProfileHeader skeleton">
                <div className="publicProfileIdentity">
                  <div className="publicProfileAvatarSkeleton" aria-hidden="true" />
                  <div className="publicProfileSkeletonCopy" aria-hidden="true">
                    <div className="publicProfileSkeletonLine wide" />
                    <div className="publicProfileSkeletonLine" />
                    <div className="publicProfileSkeletonLine wide" />
                  </div>
                </div>
              </div>
              <div className="publicListItems">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="publicListItemSkeleton" />
                ))}
              </div>
            </>
          ) : (
            <>
              {loadError && <div className="warning">{loadError}</div>}

              <div className="publicListHero">
                <div className={`detailCoverMedia ${coverLoaded ? "isLoaded" : ""}`} style={{ backgroundImage: coverBackground }}>
                  {isImageCover ? (
                    <img
                      className="detailCoverImage"
                      src={coverImageUrl}
                      alt=""
                      loading="lazy"
                      onLoad={() => setCoverLoaded(true)}
                      onError={() => setCoverLoaded(true)}
                    />
                  ) : null}
                  <div className="detailCoverOverlay" aria-hidden="true" />
                  <div className="publicListCoverTopRow">
                    <Link className="publicListBackLink" to={backTo}>
                      <span aria-hidden="true">←</span>
                      <span>{backLabel}</span>
                    </Link>
                    <div className="publicListCoverTopRight">
                      <Link
                        className="publicListCoverOwnerLink"
                        to={`/@${profile?.handle || handle}`}
                        aria-label="View creator profile"
                      >
                        <span className="publicListCoverOwnerAvatar" aria-hidden="true">
                          {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt="" />
                          ) : (
                            <span>{displayNameForProfile(profile).charAt(0).toUpperCase()}</span>
                          )}
                        </span>
                      </Link>
                      <button className="publicListCoverShareBtn" type="button" onClick={handleShare} aria-label="Share collection">
                        <img className="publicListShareBtnIcon" src={shareIcon} alt="" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="publicListCoverInfo">
                    <div className="publicListHeaderTitleRow publicListCoverTitleRow">
                      <h1 className="listTitle">{listTitle}</h1>
                      <span className="tripCategory">{sectionLabel(section)}</span>
                      {isOwner ? (
                        <span className={`visibilityPill ${listVisibility}`}>{visibilityLabel(listVisibility)}</span>
                      ) : null}
                    </div>
                    {listSubtitle ? <div className="publicListSubtitle publicListCoverSubtitle">{listSubtitle}</div> : null}
                    <div className="tripMetaLine publicListCoverMeta">
                      {items.length} items · Saved by {saveCount}
                      {showRank && rankedSize ? ` · Top ${rankedSize}` : ""}
                    </div>
                  </div>
                  <button
                    className={`publicListCoverSaveBtn publicListCoverSaveCorner ${isSaved ? "isSaved" : ""}`}
                    type="button"
                    onClick={toggleSave}
                    disabled={saveWorking || checkingSaved}
                    aria-label={isSaved ? "Unsave collection" : "Save collection"}
                  >
                    <img
                      className="publicListCoverSaveIcon"
                      src={isSaved ? saveFilledIcon : saveIcon}
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                </div>

              </div>

              <div className="publicListItems">
                {items.length === 0 ? (
                  <div className="collectionsEmpty">
                    <div className="collectionsEmptyIcon" aria-hidden="true">
                      ✦
                    </div>
                    <div className="collectionsEmptyTitle">No items yet</div>
                    <div className="collectionsEmptyText">This collection is still being curated.</div>
                  </div>
                ) : (
                  items.map((item, index) => {
                    const domain = item.domain_snapshot || item.domain || getDomain(item.url || "");
                    const rawTitle = resolvedTitleByItemId[item.id] || item.title_snapshot || item.title || domain || "Saved link";
                    const splitTitle = splitInlineTitleMeta(rawTitle);
                    const chips = dedupeChips([...buildMetaChips(item), ...splitTitle.chips]);
                    const chipsPreview = chips.slice(0, 3);
                    const imageUrl = resolveItemImage(item) || resolvedPreviewByItemId[item.id] || "";

                    return (
                      <article key={item.id} className="publicListItemCard">
                        <div className="publicListItemMediaWrap">
                          <div className="publicListItemMedia" aria-hidden="true">
                            {imageUrl ? (
                              <img
                                className={imageUrl.includes("favicon") ? "faviconFallback" : ""}
                                src={imageUrl}
                                alt=""
                                loading="lazy"
                              />
                            ) : (
                              <span className="listItemThumbFallback" />
                            )}
                          </div>
                          {showRank ? <div className="publicListRank">{index + 1}</div> : null}
                          <div className="publicListItemActions">
                            <a
                              className="publicListItemShareLink"
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Share link"
                              onClick={(event) =>
                                handleItemShare(event, item.url, splitTitle.title || domain || "Saved link")
                              }
                            >
                              <img className="publicListShareActionIcon" src={shareIcon} alt="" aria-hidden="true" />
                            </a>
                          </div>
                          <div className="publicListItemOverlay">
                            <div className="publicListItemTitle" title={splitTitle.title || domain || "Saved link"}>
                              {splitTitle.title || domain || "Saved link"}
                            </div>
                            <div className="publicListItemMetaRow">
                              {domain ? <span className="domainPill">{domain}</span> : null}
                              {chipsPreview.map((chip) => (
                                <span key={`${item.id}-${chip}`} className="metaPill">
                                  {chip}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        {item.note ? <div className="publicListItemNote">{item.note}</div> : null}
                      </article>
                    );
                  })
                )}
              </div>
            </>
          )}
        </section>
      </AppShell>
    </div>
  );
}
