import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import stashLogo from "../assets/icons/stash-favicon.png";
import userIcon from "../assets/icons/user.png";

function normalizeHandleParam(input = "") {
  return String(input || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function normalizeSlugParam(input = "") {
  return String(input || "").trim().toLowerCase();
}

function displayNameForProfile(profile) {
  if (!profile) return "";
  return profile.display_name || profile.handle || "Stash user";
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
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
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

function formatRating(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num % 1 === 0 ? String(num) : num.toFixed(1);
}

function getMetaObject(meta) {
  if (!meta) return null;
  if (typeof meta === "object") return meta;
  try {
    return JSON.parse(String(meta));
  } catch {
    return null;
  }
}

function buildMetaChips(item) {
  const chips = [];
  if (item.price_snapshot) chips.push(String(item.price_snapshot));
  const meta = getMetaObject(item.meta_json);
  if (meta && typeof meta === "object") {
    const location =
      meta.location ||
      meta.neighborhood ||
      meta.city ||
      meta.region ||
      meta.area ||
      meta.place ||
      meta.destination;
    if (location && typeof location === "string") chips.push(location);
  }
  return chips;
}

function IconCopy(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <rect x="9" y="9" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="4" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconExternal(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M14 4h6v6M10 14l10-10M5 9v10h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconArrowUp(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 5l-6 6M12 5l6 6M12 5v14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconArrowDown(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 19l-6-6M12 19l6-6M12 5v14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconNote(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M6 4h8l4 4v12H6zM14 4v4h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 12h8M8 16h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function PublicList() {
  const params = useParams();
  const rawHandle = params.handle || "";
  const rawSlug = params.listSlug || "";
  const handle = normalizeHandleParam(rawHandle);
  const listSlug = normalizeSlugParam(rawSlug);

  const { user, loading: authLoading } = useAuth();
  const viewerUserId = user?.id || null;
  const { trips } = useTrips();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [profile, setProfile] = useState(null);
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const [isSaved, setIsSaved] = useState(false);
  const [checkingSaved, setCheckingSaved] = useState(false);
  const [saveWorking, setSaveWorking] = useState(false);

  const [reorderWorking, setReorderWorking] = useState(false);
  const [workingItemId, setWorkingItemId] = useState("");
  const [expandedNotes, setExpandedNotes] = useState(new Set());

  const viewTrackedRef = useRef(new Set());
  const [coverLoaded, setCoverLoaded] = useState(false);

  const categoryCounts = useMemo(
    () =>
      ["general", "travel", "fashion"].reduce((acc, category) => {
        acc[category] = trips.filter((trip) => (trip.type || "general") === category).length;
        return acc;
      }, {}),
    [trips]
  );

  const isOwner = !!viewerUserId && !!profile?.id && viewerUserId === profile.id;
  const listTitle = list?.title || "List";
  const listSubtitle = list?.subtitle || "";
  const section = list?.section || "general";
  const listVisibility = list?.visibility || "private";
  const showRank = !!list?.is_ranked;
  const rankedSize = list?.ranked_size || null;
  const saveCount = Number(list?.save_count || 0);

  const coverSeed = useMemo(
    () => `${list?.id || ""}-${list?.title || ""}-${profile?.id || ""}`,
    [list?.id, list?.title, profile?.id]
  );
  const fallbackGradient = useMemo(() => makeCoverGradient(coverSeed), [coverSeed]);
  const coverImageUrl = list?.cover_image_url || items?.[0]?.image_snapshot || "";
  const isGradientCover =
    (coverImageUrl || "").startsWith("linear-gradient") || (coverImageUrl || "").startsWith("radial-gradient");
  const isImageCover =
    !!coverImageUrl && !isGradientCover && !(coverImageUrl || "").startsWith("data:");
  const coverBackground = isGradientCover && coverImageUrl ? coverImageUrl : fallbackGradient;

  function setToast(message) {
    setToastMsg(message);
    setTimeout(() => setToastMsg(""), 1500);
  }

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    setProfile(null);
    setList(null);
    setItems([]);
    setLoadingList(true);
    setLoadingItems(true);
    setNotFound(false);
    setLoadError("");
    setToastMsg("");
    setIsSaved(false);
    setCheckingSaved(false);
    setCoverLoaded(false);

    async function load() {
      if (!handle || !listSlug) {
        if (!active) return;
        setNotFound(true);
        setLoadingList(false);
        setLoadingItems(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id,handle,display_name,avatar_url,is_public")
        .eq("handle", handle)
        .single();

      if (!active) return;
      if (profileError || !profileData) {
        setNotFound(true);
        setLoadingList(false);
        setLoadingItems(false);
        return;
      }

      setProfile(profileData);

      const { data: listData, error: listError } = await supabase
        .from("lists")
        .select(
          "id,owner_user_id,section,title,subtitle,slug,cover_image_url,visibility,is_ranked,ranked_size,pinned_order,save_count,view_count,created_at,updated_at"
        )
        .eq("owner_user_id", profileData.id)
        .eq("slug", listSlug)
        .single();

      if (!active) return;
      if (listError || !listData) {
        setNotFound(true);
        setLoadingList(false);
        setLoadingItems(false);
        return;
      }

      setList(listData);
      setLoadingList(false);

      const { data: itemsData, error: itemsError } = await supabase
        .from("list_items")
        .select(
          "id,list_id,item_id,url,title_snapshot,image_snapshot,domain_snapshot,price_snapshot,rating_snapshot,meta_json,rank_index,note,created_at"
        )
        .eq("list_id", listData.id)
        .order("rank_index", { ascending: true })
        .limit(300);

      if (!active) return;
      if (itemsError) {
        setLoadError("Could not load this list right now.");
        setItems([]);
      } else {
        setItems(itemsData || []);
      }
      setLoadingItems(false);

      if (viewerUserId) {
        setCheckingSaved(true);
        const { data: saveRows, error: saveLookupError } = await supabase
          .from("list_saves")
          .select("list_id")
          .eq("user_id", viewerUserId)
          .eq("list_id", listData.id)
          .limit(1);

        if (!active) return;
        if (!saveLookupError) {
          setIsSaved((saveRows || []).length > 0);
        }
        setCheckingSaved(false);
      }

      const viewKey = `${viewerUserId || "anon"}:${listData.id}`;
      if (!viewTrackedRef.current.has(viewKey)) {
        viewTrackedRef.current.add(viewKey);
        const referrer = typeof document !== "undefined" ? document.referrer || null : null;
        supabase.from("list_views").insert({ list_id: listData.id, referrer }).then(() => {});
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [authLoading, handle, listSlug, viewerUserId]);

  async function toggleSave() {
    if (!list) return;
    if (!viewerUserId) {
      navigate("/login");
      return;
    }
    if (saveWorking) return;
    setSaveWorking(true);

    if (isSaved) {
      const { error } = await supabase
        .from("list_saves")
        .delete()
        .eq("user_id", viewerUserId)
        .eq("list_id", list.id);
      if (error) {
        setToast("Couldn’t unsave right now.");
      } else {
        setIsSaved(false);
        setList((prev) => (prev ? { ...prev, save_count: Math.max(0, Number(prev.save_count || 0) - 1) } : prev));
        setToast("Removed");
      }
      setSaveWorking(false);
      return;
    }

    const { error } = await supabase.from("list_saves").insert({ list_id: list.id });
    if (error) {
      setToast("Couldn’t save right now.");
    } else {
      setIsSaved(true);
      setList((prev) => (prev ? { ...prev, save_count: Number(prev.save_count || 0) + 1 } : prev));
      setToast("Saved");
    }
    setSaveWorking(false);
  }

  async function handleShare() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: listTitle,
          text: listSubtitle || `${listTitle} by @${handle}`,
          url,
        });
        return;
      } catch {
        // fall back to clipboard
      }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        setToast("Copied!");
      } catch {
        setToast("Couldn’t copy link.");
      }
    }
  }

  async function handleCopyItem(url) {
    if (!url) return;
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(url);
      setToast("Copied!");
    } catch {
      setToast("Couldn’t copy link.");
    }
  }

  function updateLocalItem(itemId, patch) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  }

  function toggleNoteExpanded(itemId, expanded) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (expanded) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  async function saveItemNote(item) {
    if (!isOwner) return;
    if (!item?.id) return;
    setWorkingItemId(item.id);
    const { error } = await supabase
      .from("list_items")
      .update({ note: (item.note || "").trim() || null })
      .eq("id", item.id)
      .eq("list_id", item.list_id);
    if (error) {
      setToast("Couldn’t save note.");
    }
    setWorkingItemId("");
  }

  async function applyReorder(nextItems) {
    if (!isOwner || !list) return;
    if (reorderWorking) return;
    const ids = nextItems.map((it) => it.id);
    setReorderWorking(true);
    const { error } = await supabase.rpc("reorder_list_items", { list_id: list.id, item_ids: ids });
    if (error) {
      setToast("Couldn’t reorder right now.");
      setReorderWorking(false);
      return;
    }
    setItems(nextItems.map((it, index) => ({ ...it, rank_index: index + 1 })));
    setReorderWorking(false);
  }

  function moveItem(itemId, direction) {
    const index = items.findIndex((it) => it.id === itemId);
    if (index === -1) return;
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    applyReorder(next);
  }

  async function removeItem(itemId) {
    if (!isOwner) return;
    if (!itemId) return;
    if (workingItemId) return;
    setWorkingItemId(itemId);
    const { error } = await supabase.from("list_items").delete().eq("id", itemId);
    if (error) {
      setToast("Couldn’t remove item.");
      setWorkingItemId("");
      return;
    }
    const next = items.filter((it) => it.id !== itemId);
    setItems(next);
    if (list?.id && next.length > 0) {
      const { error: reorderError } = await supabase.rpc("reorder_list_items", {
        list_id: list.id,
        item_ids: next.map((it) => it.id),
      });
      if (reorderError) {
        setToast("Removed, but couldn’t reorder.");
      }
    }
    setWorkingItemId("");
  }

  function renderNoteArea(item) {
    const noteValue = item.note || "";
    if (!isOwner) {
      if (!noteValue.trim()) return null;
      return <div className="listItemNoteText">{noteValue}</div>;
    }

    const isExpanded = expandedNotes.has(item.id);
    if (isExpanded) {
      return (
        <textarea
          className="note compact"
          placeholder="Add a note…"
          value={noteValue}
          onChange={(e) => updateLocalItem(item.id, { note: e.target.value })}
          onBlur={() => {
            toggleNoteExpanded(item.id, false);
            saveItemNote(item);
          }}
          disabled={workingItemId === item.id}
        />
      );
    }

    return (
      <button
        className="noteToggle compact"
        type="button"
        onClick={() => toggleNoteExpanded(item.id, true)}
        aria-label={noteValue.trim() ? "Edit note" : "Add note"}
      >
        <IconNote className="noteIcon" />
        <span className="noteToggleText">{noteValue.trim() || "Add note…"}</span>
      </button>
    );
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
            title={loadingList ? "List" : listTitle}
            subtitle={handle ? `@${handle}` : "Public list"}
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

        {notFound ? (
          <section className="panel p-5 collectionsPanel listPanel fullWidth">
            <div className="collectionsEmpty">
              <div className="collectionsEmptyIcon" aria-hidden="true">
                ?
              </div>
              <div className="collectionsEmptyTitle">List not found</div>
              <div className="collectionsEmptyText">That list isn’t available.</div>
              <div className="navRow">
                <Link className="miniBtn linkBtn" to={handle ? `/@${handle}` : "/"}>
                  {handle ? "Back to profile" : "Back home"}
                </Link>
              </div>
            </div>
          </section>
        ) : loadingList ? (
          <section className="panel p-5 collectionsPanel listPanel fullWidth">
            <div className="muted">Loading list…</div>
          </section>
        ) : (
          <div className="detailCollectionCard publicListDetailCard">
            <div
              className={`detailCoverMedia ${coverLoaded ? "isLoaded" : ""}`}
              style={{ backgroundImage: coverBackground }}
            >
              {isImageCover && (
                <img
                  className="detailCoverImage"
                  src={coverImageUrl}
                  alt=""
                  loading="lazy"
                  onLoad={() => setCoverLoaded(true)}
                  onError={() => setCoverLoaded(true)}
                />
              )}
              <div className="detailCoverOverlay" aria-hidden="true" />
            </div>

            <div className="detailCollectionBody">
              <div className="detailHeader hasCover">
                <div className="detailHeaderBar">
                  <Link className="miniBtn linkBtn" to={`/@${handle}`}>
                    ← Profile
                  </Link>
                </div>

                <div className="detailCoverBody">
                  <div className="publicListHeaderTitleRow">
                    <div className="detailCoverTitle">{listTitle}</div>
                    <span className="tripCategory">{sectionLabel(section)}</span>
                    {isOwner ? (
                      <span className={`visibilityPill ${listVisibility}`}>
                        {visibilityLabel(listVisibility)}
                      </span>
                    ) : null}
                  </div>
                  {listSubtitle ? <div className="detailCoverSubtitle">{listSubtitle}</div> : null}

                  <div className="publicListOwnerRow">
                    <Link className="publicListOwnerLink" to={`/@${handle}`}>
                      <span className="publicListOwnerAvatar" aria-hidden="true">
                        {profile?.avatar_url ? (
                          <img src={profile.avatar_url} alt="" />
                        ) : (
                          <span className="publicListOwnerAvatarText">
                            {displayNameForProfile(profile).charAt(0).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="publicListOwnerName">{displayNameForProfile(profile)}</span>
                      {profile?.handle ? <span className="publicListOwnerHandle">@{profile.handle}</span> : null}
                    </Link>
                  </div>

                  <div className="detailCoverMeta">
                    {(items?.length || 0)} item{(items?.length || 0) === 1 ? "" : "s"} · Saved by{" "}
                    {saveCount}
                    {showRank && rankedSize ? ` · Top ${rankedSize}` : ""}
                  </div>
                </div>

                <div className="detailSectionDivider" />

                <div className="publicListHeaderActions">
                  <button
                    className={isSaved ? "miniBtn active" : "miniBtn blue"}
                    type="button"
                    onClick={toggleSave}
                    disabled={saveWorking || checkingSaved}
                  >
                    {checkingSaved ? "…" : saveWorking ? "Working…" : isSaved ? "Saved" : "Save"}
                  </button>
                  <button className="miniBtn" type="button" onClick={handleShare}>
                    Share
                  </button>
                </div>

                {loadError && <div className="warning">{loadError}</div>}
              </div>

              {loadingItems ? (
                <div className="muted">Loading items…</div>
              ) : items.length === 0 ? (
                <div className="collectionsEmpty">
                  <div className="collectionsEmptyIcon" aria-hidden="true">
                    ✦
                  </div>
                  <div className="collectionsEmptyTitle">No items yet</div>
                  <div className="collectionsEmptyText">This list is empty.</div>
                </div>
              ) : (
                <div className="itemList">
                  {items.map((item, index) => {
                    const title = item.title_snapshot || item.url || "Saved link";
                    const domain = item.domain_snapshot || getDomain(item.url || "");
                    const rating = formatRating(item.rating_snapshot);
                    const chips = buildMetaChips(item);
                    const imgUrl = item.image_snapshot || "";
                    const canMoveUp = isOwner && index > 0 && !reorderWorking;
                    const canMoveDown = isOwner && index < items.length - 1 && !reorderWorking;
                    return (
                      <div key={item.id} className="itemCard publicListItemCard">
                        <div className="itemTop">
                          <div className="listItemLead">
                            {showRank ? <div className="rankBadge">{item.rank_index}</div> : null}
                            <div className="listItemThumb" aria-hidden="true">
                              {imgUrl ? <img src={imgUrl} alt="" loading="lazy" /> : <div className="listItemThumbFallback" />}
                            </div>
                          </div>

                          <div className="itemHeaderRow">
                            <div className="itemTitleBlock">
                              <div className="itemTitleRow">
                                <a
                                  className="itemTitleLink titleClampFade"
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={title}
                                >
                                  {title}
                                </a>
                                {domain ? <span className="domainPill">{domain}</span> : null}
                                {rating ? <span className="ratingPill">⭐ {rating}</span> : null}
                              </div>

                              {chips.length > 0 && (
                                <div className="itemMetaRow">
                                  <div className="metaChips">
                                    {chips.map((chip) => (
                                      <span key={chip} className="metaChip">
                                        {chip}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="itemActions itemActionsTop">
                              <a
                                className="iconBtn bare quickActionBtn"
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Open link"
                              >
                                <IconExternal className="quickActionIcon" />
                              </a>
                              <button
                                className="iconBtn bare quickActionBtn"
                                type="button"
                                onClick={() => handleCopyItem(item.url)}
                                aria-label="Copy link"
                              >
                                <IconCopy className="quickActionIcon" />
                              </button>

                              {isOwner ? (
                                <>
                                  <button
                                    className="iconBtn bare quickActionBtn"
                                    type="button"
                                    onClick={() => moveItem(item.id, -1)}
                                    aria-label="Move up"
                                    disabled={!canMoveUp}
                                  >
                                    <IconArrowUp className="quickActionIcon" />
                                  </button>
                                  <button
                                    className="iconBtn bare quickActionBtn"
                                    type="button"
                                    onClick={() => moveItem(item.id, 1)}
                                    aria-label="Move down"
                                    disabled={!canMoveDown}
                                  >
                                    <IconArrowDown className="quickActionIcon" />
                                  </button>
                                  <button
                                    className="iconBtn bare quickActionBtn danger"
                                    type="button"
                                    onClick={() => removeItem(item.id)}
                                    aria-label="Remove item"
                                    disabled={!!workingItemId}
                                  >
                                    <IconTrash className="quickActionIcon" />
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {renderNoteArea(item)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </AppShell>
    </div>
  );
}
