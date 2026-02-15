import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import TrendingListCard from "../components/TrendingListCard";
import { fetchNewestPublicLists, fetchTrendingLists } from "../lib/socialDiscovery";
import { fetchCreators } from "../lib/socialCreators";
import {
  getSavedListsByIds,
  savePublicListToStash,
  unsavePublicListFromStash,
} from "../lib/socialSave";
import { supabase } from "../lib/supabaseClient";
import stashLogo from "../assets/icons/stash-favicon.png";
import userIcon from "../assets/icons/user.png";
import saveIcon from "../assets/icons/save-.png";
import saveFilledIcon from "../assets/icons/save-filled.png";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "travel", label: "Travel" },
  { value: "fashion", label: "Fashion" },
  { value: "general", label: "General" },
];

const TRENDING_LIMIT = 12;
const NEW_LIMIT = 24;
const CREATOR_VISIBLE_STEP = 8;

const COMPACT_NUMBER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function mergeUniqueLists(prevRows = [], nextRows = []) {
  const seen = new Set(prevRows.map((row) => row.id));
  const merged = [...prevRows];
  for (const row of nextRows) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

function normalizeHandle(value = "") {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function makeFallbackGradient(seed = "") {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const colors = ["#0b1020", "#10162b", "#172448", "#102f46", "#1a1f35", "#2b1f3f"];
  const pick = (offset) => colors[Math.abs(hash + offset) % colors.length];
  return `linear-gradient(135deg, ${pick(0)} 0%, ${pick(2)} 52%, ${pick(4)} 100%)`;
}

function isGradientCover(value = "") {
  const normalized = String(value || "").trim();
  return normalized.startsWith("linear-gradient") || normalized.startsWith("radial-gradient");
}

function formatSavedCount(value) {
  const count = Number(value || 0);
  if (!Number.isFinite(count) || count <= 0) return "0 saves";
  if (count < 1000) return `${count.toLocaleString()} saves`;
  return `${COMPACT_NUMBER.format(count).toLowerCase()} saves`;
}

function getTrendingBadge(list = {}) {
  if (list?.is_ranked && Number(list?.ranked_size) === 10) return "Top 10";
  if (list?.is_ranked) return "Top 5";
  return "";
}

function ExploreFeedCard({
  list,
  isSaved = false,
  isSaving = false,
  onSave = null,
}) {
  const ownerHandle = normalizeHandle(list?.owner_handle || "stash");
  const ownerDisplayName = String(list?.owner_display_name || ownerHandle || "Stash user").trim() || "Stash user";
  const ownerAvatarUrl = String(list?.owner_avatar_url || "").trim();
  const destination = ownerHandle && list?.slug ? `/@${ownerHandle}/${list.slug}` : "";
  const title = String(list?.title || list?.name || "Untitled collection").trim() || "Untitled collection";
  const subtitle = String(list?.subtitle || "").trim();
  const canSave = typeof onSave === "function";

  const rawCover = String(list?.cover_image_url || list?.preview_image_url || "").trim();
  const gradientCover = isGradientCover(rawCover);
  const imageCover = !!rawCover && !gradientCover && !rawCover.startsWith("data:");
  const fallbackGradient = makeFallbackGradient(`${list?.id || ""}-${title}`);
  const mediaBackground = gradientCover ? rawCover || fallbackGradient : fallbackGradient;

  const badgeLabel = getTrendingBadge(list);
  const content = (
    <>
      <span
        className={`exploreFeedCardMedia ${imageCover ? "hasImage" : ""}`}
        style={{ backgroundImage: mediaBackground }}
        aria-hidden="true"
      >
        {imageCover ? <img src={rawCover} alt="" loading="lazy" /> : null}
        <span className="exploreFeedCardShade" />
      </span>

      {badgeLabel ? <span className="exploreFeedCardBadge">{badgeLabel}</span> : null}

      <span className="exploreFeedCardBody">
        <span className="exploreFeedCardCreator">
          <span className="exploreFeedCardAvatar" aria-hidden="true">
            {ownerAvatarUrl ? <img src={ownerAvatarUrl} alt="" /> : <span>{ownerDisplayName.charAt(0).toUpperCase()}</span>}
          </span>
          <span className="exploreFeedCardCreatorMeta">
            <span className="exploreFeedCardCreatorName">{ownerDisplayName}</span>
          </span>
        </span>

        <span className="exploreFeedCardTitle" title={title}>
          {title}
        </span>

        {subtitle ? <span className="exploreFeedCardSubtitle">{subtitle}</span> : null}

        <span className="exploreFeedCardMetaRow">
          <span className="exploreFeedCardSavedPill">Saved</span>
          <span>{formatSavedCount(list?.save_count)}</span>
        </span>
      </span>
    </>
  );

  const saveControl = canSave ? (
    <button
      className={`exploreFeedSaveBtn ${isSaved ? "isSaved" : ""}`}
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSave();
      }}
      disabled={isSaving}
      aria-label={isSaved ? "Unsave collection" : "Save collection"}
    >
      <img src={isSaved ? saveFilledIcon : saveIcon} alt="" aria-hidden="true" />
    </button>
  ) : null;

  if (destination && canSave) {
    return (
      <article className="exploreFeedCard" aria-label={title}>
        <Link className="exploreFeedCardLink" to={destination} state={{ fromExplore: true }}>
          {content}
        </Link>
        {saveControl}
      </article>
    );
  }

  if (destination) {
    return (
      <article className="exploreFeedCard" aria-label={title}>
        <Link className="exploreFeedCardLink" to={destination} state={{ fromExplore: true }}>
          {content}
        </Link>
        {saveControl}
      </article>
    );
  }

  return (
    <article className="exploreFeedCard" aria-label={title}>
      <div className="exploreFeedCardLink">{content}</div>
      {saveControl}
    </article>
  );
}

export default function Explore() {
  const { user } = useAuth();
  const { trips, createTrip, deleteTrip, reloadTripItems } = useTrips();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [followingPanelOpen, setFollowingPanelOpen] = useState(false);
  const [sectionFilter, setSectionFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [creatorSearchInput, setCreatorSearchInput] = useState("");
  const [creatorVisibleCount, setCreatorVisibleCount] = useState(CREATOR_VISIBLE_STEP);
  const [toastMsg, setToastMsg] = useState("");

  const [trendingLists, setTrendingLists] = useState([]);
  const [newLists, setNewLists] = useState([]);

  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingNew, setLoadingNew] = useState(true);
  const [loadingMoreNew, setLoadingMoreNew] = useState(false);
  const [hasMoreNew, setHasMoreNew] = useState(false);
  const [loadError, setLoadError] = useState("");

  const requestIdRef = useRef(0);
  const trendingScrollerRef = useRef(null);
  const creatorSearchInputRef = useRef(null);

  const [creators, setCreators] = useState([]);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [creatorLoadError, setCreatorLoadError] = useState("");
  const [followedCreatorIds, setFollowedCreatorIds] = useState([]);
  const [loadingCreatorFollows, setLoadingCreatorFollows] = useState(false);
  const [followWorkingByCreatorId, setFollowWorkingByCreatorId] = useState({});
  const [followErrorByCreatorId, setFollowErrorByCreatorId] = useState({});
  const [saveStateByListId, setSaveStateByListId] = useState({});

  const categoryCounts = useMemo(
    () =>
      ["general", "travel", "fashion"].reduce((acc, category) => {
        acc[category] = trips.filter((trip) => (trip.type || "general") === category).length;
        return acc;
      }, {}),
    [trips]
  );

  const creatorSearchValue = useMemo(() => creatorSearchInput.trim().toLowerCase(), [creatorSearchInput]);

  const filteredCreators = useMemo(() => {
    if (!creatorSearchValue) return creators;
    return creators.filter((creator) => {
      const displayName = String(creator?.displayName || "").toLowerCase();
      const handle = normalizeHandle(creator?.handle || "");
      return displayName.includes(creatorSearchValue) || handle.includes(creatorSearchValue);
    });
  }, [creators, creatorSearchValue]);

  const creatorsToRender = useMemo(
    () => filteredCreators.slice(0, creatorVisibleCount),
    [filteredCreators, creatorVisibleCount]
  );
  const followedCreatorIdSet = useMemo(() => new Set(followedCreatorIds), [followedCreatorIds]);
  const creatorGroupsToRender = useMemo(
    () =>
      [
        {
          key: "following",
          label: "Following",
          creators: creatorsToRender.filter((creator) => followedCreatorIdSet.has(creator.id)),
        },
        {
          key: "suggested",
          label: "Suggested",
          creators: creatorsToRender.filter((creator) => !followedCreatorIdSet.has(creator.id)),
        },
      ].filter((group) => group.creators.length > 0),
    [creatorsToRender, followedCreatorIdSet]
  );
  const hasMoreCreators = creatorsToRender.length < filteredCreators.length;

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchValue(searchInput.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setCreatorVisibleCount(CREATOR_VISIBLE_STEP);
  }, [creatorSearchValue]);

  useEffect(() => {
    if (!followingPanelOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setFollowingPanelOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(() => {
      creatorSearchInputRef.current?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(frame);
    };
  }, [followingPanelOpen]);

  function setToast(message) {
    setToastMsg(message);
    setTimeout(() => setToastMsg(""), 1700);
  }

  function updateListSaveCount(listId, delta) {
    const apply = (rows = []) =>
      rows.map((row) =>
        row.id === listId
          ? {
              ...row,
              save_count: Math.max(Number(row.save_count || 0) + delta, 0),
            }
          : row
      );
    setTrendingLists((prev) => apply(prev));
    setNewLists((prev) => apply(prev));
  }

  useEffect(() => {
    let active = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingTrending(true);
    setLoadingNew(true);
    setLoadError("");

    Promise.all([
      fetchTrendingLists({
        section: sectionFilter,
        search: searchValue,
        limit: TRENDING_LIMIT,
        offset: 0,
      }),
      fetchNewestPublicLists({
        section: sectionFilter,
        search: searchValue,
        limit: NEW_LIMIT,
        offset: 0,
      }),
    ])
      .then(([trendingResult, newestResult]) => {
        if (!active || requestIdRef.current !== requestId) return;
        startTransition(() => {
          setTrendingLists(trendingResult.lists || []);
          setNewLists(newestResult.lists || []);
          setHasMoreNew(!!newestResult.hasMore);
          if (newestResult.error || trendingResult.error) {
            setLoadError("Could not load explore collections right now.");
          }
        });
      })
      .catch(() => {
        if (!active || requestIdRef.current !== requestId) return;
        startTransition(() => {
          setTrendingLists([]);
          setNewLists([]);
          setHasMoreNew(false);
          setLoadError("Could not load explore collections right now.");
        });
      })
      .finally(() => {
        if (!active || requestIdRef.current !== requestId) return;
        startTransition(() => {
          setLoadingTrending(false);
          setLoadingNew(false);
        });
      });

    return () => {
      active = false;
    };
  }, [sectionFilter, searchValue]);

  useEffect(() => {
    let active = true;
    const viewerUserId = user?.id || "";
    const ids = [
      ...new Set(
        [...trendingLists, ...newLists]
          .map((row) => row?.id)
          .filter(Boolean)
      ),
    ];

    if (!viewerUserId || !ids.length) {
      if (!viewerUserId) setSaveStateByListId({});
      return () => {
        active = false;
      };
    }

    getSavedListsByIds({ viewerUserId, listIds: ids }).then(({ map }) => {
      if (!active) return;
      startTransition(() => {
        setSaveStateByListId((prev) => {
          const next = { ...prev };
          for (const id of ids) {
            const current = next[id] || {};
            if (current.saving) continue;
            next[id] = {
              saved: map.has(id),
              savedTripId: map.get(id)?.savedTripId || "",
              saving: false,
            };
          }
          return next;
        });
      });
    });

    return () => {
      active = false;
    };
  }, [user?.id, trendingLists, newLists]);

  async function handleToggleSaveList(list) {
    const listId = String(list?.id || "");
    if (!listId) return;
    if (!user?.id) {
      navigate("/login");
      return;
    }

    const current = saveStateByListId[listId] || {};
    if (current.saving) return;

    setSaveStateByListId((prev) => ({
      ...prev,
      [listId]: {
        ...(prev[listId] || {}),
        saving: true,
      },
    }));

    if (current.saved) {
      const result = await unsavePublicListFromStash({
        viewerUserId: user.id,
        listId,
        deleteTrip,
      });

      if (result.status === "unsaved" || result.status === "not_saved") {
        setSaveStateByListId((prev) => ({
          ...prev,
          [listId]: {
            saved: false,
            savedTripId: "",
            saving: false,
          },
        }));
        if (result.status === "unsaved") {
          updateListSaveCount(listId, -1);
        }
        setToast("Removed from your Stash");
        return;
      }

      setSaveStateByListId((prev) => ({
        ...prev,
        [listId]: {
          ...(prev[listId] || {}),
          saving: false,
        },
      }));
      setToast(result.message || "Couldn’t remove save right now.");
      return;
    }

    const result = await savePublicListToStash({
      viewerUserId: user.id,
      list,
      ownerHandle: list.owner_handle || "",
      createTrip,
      deleteTrip,
      reloadTripItems,
    });

    if (result.status === "saved") {
      setSaveStateByListId((prev) => ({
        ...prev,
        [listId]: {
          saved: true,
          savedTripId: result.savedTripId || "",
          saving: false,
        },
      }));
      if (result.insertedSaveRow) {
        updateListSaveCount(listId, 1);
      }
      setToast("Saved to your Stash");
      return;
    }

    if (result.status === "already_saved") {
      setSaveStateByListId((prev) => ({
        ...prev,
        [listId]: {
          saved: true,
          savedTripId: result.savedTripId || "",
          saving: false,
        },
      }));
      setToast("Already saved");
      return;
    }

    setSaveStateByListId((prev) => ({
      ...prev,
      [listId]: {
        ...(prev[listId] || {}),
        saving: false,
      },
    }));
    setToast(result.message || "Couldn’t save right now.");
  }

  async function loadMoreNew() {
    if (loadingMoreNew || !hasMoreNew) return;
    setLoadingMoreNew(true);
    try {
      const result = await fetchNewestPublicLists({
        section: sectionFilter,
        search: searchValue,
        limit: NEW_LIMIT,
        offset: newLists.length,
      });
      if (result.error) {
        setLoadError("Could not load more right now.");
        setLoadingMoreNew(false);
        return;
      }
      startTransition(() => {
        setNewLists((prev) => mergeUniqueLists(prev, result.lists || []));
        setHasMoreNew(!!result.hasMore);
      });
    } catch {
      setLoadError("Could not load more right now.");
    } finally {
      setLoadingMoreNew(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoadingCreators(true);
    setCreatorLoadError("");

    fetchCreators({
      limit: 18,
      excludeUserId: user?.id || "",
    })
      .then(({ creators: rows, error }) => {
        if (!active) return;
        if (error) {
          startTransition(() => {
            setCreators([]);
            setCreatorLoadError("Could not load creators right now.");
          });
          return;
        }
        startTransition(() => {
          setCreators(rows || []);
        });
      })
      .catch(() => {
        if (!active) return;
        startTransition(() => {
          setCreators([]);
          setCreatorLoadError("Could not load creators right now.");
        });
      })
      .finally(() => {
        if (!active) return;
        startTransition(() => {
          setLoadingCreators(false);
        });
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    const scroller = trendingScrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ left: 0, behavior: "auto" });
  }, [sectionFilter, searchValue]);

  useEffect(() => {
    let active = true;
    const viewerUserId = user?.id || "";
    const creatorIds = creators.map((creator) => creator.id).filter(Boolean);
    if (!viewerUserId || !creatorIds.length) {
      setFollowedCreatorIds([]);
      setLoadingCreatorFollows(false);
      return () => {
        active = false;
      };
    }

    setLoadingCreatorFollows(true);
    supabase
      .from("follows")
      .select("following_user_id")
      .eq("follower_user_id", viewerUserId)
      .in("following_user_id", creatorIds)
      .then(({ data, error }) => {
        if (!active) return;
        startTransition(() => {
          if (error) {
            setFollowedCreatorIds([]);
          } else {
            setFollowedCreatorIds((data || []).map((row) => row.following_user_id).filter(Boolean));
          }
          setLoadingCreatorFollows(false);
        });
      });

    return () => {
      active = false;
    };
  }, [creators, user?.id]);

  async function handleToggleFollowCreator(creator) {
    const creatorId = String(creator?.id || "");
    if (!creatorId) return;
    if (!user?.id) {
      navigate("/login");
      return;
    }
    if (creatorId === user.id) return;
    if (followWorkingByCreatorId[creatorId]) return;

    const isFollowing = followedCreatorIds.includes(creatorId);
    setFollowErrorByCreatorId((prev) => ({ ...prev, [creatorId]: "" }));
    setFollowWorkingByCreatorId((prev) => ({ ...prev, [creatorId]: true }));

    if (isFollowing) {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_user_id", user.id)
        .eq("following_user_id", creatorId);
      if (error) {
        setFollowErrorByCreatorId((prev) => ({ ...prev, [creatorId]: "Could not unfollow right now." }));
      } else {
        setFollowedCreatorIds((prev) => prev.filter((id) => id !== creatorId));
        setToast("Unfollowed");
      }
      setFollowWorkingByCreatorId((prev) => ({ ...prev, [creatorId]: false }));
      return;
    }

    const { error } = await supabase.from("follows").insert({
      following_user_id: creatorId,
    });
    if (error) {
      setFollowErrorByCreatorId((prev) => ({ ...prev, [creatorId]: "Could not follow right now." }));
    } else {
      setFollowedCreatorIds((prev) => (prev.includes(creatorId) ? prev : [...prev, creatorId]));
    }
    setFollowWorkingByCreatorId((prev) => ({ ...prev, [creatorId]: false }));
  }

  return (
    <div
      className={`page explorePage collectionsShell min-h-screen app-bg text-[rgb(var(--text))] ${
        user ? "isSignedIn" : "isSignedOut"
      }`}
    >
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
            title="Explore"
            subtitle="Discover lists curated by others"
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            actions={
              <>
                <button
                  className="topbarPill subtle exploreFollowingToggle"
                  type="button"
                  onClick={() => setFollowingPanelOpen(true)}
                  aria-haspopup="dialog"
                  aria-controls="explore-following-drawer"
                  aria-expanded={followingPanelOpen}
                >
                  Following
                </button>
                {user ? (
                  <>
                    <button className="topbarIconBtn exploreTopbarIconOnly" type="button" aria-label="Notifications">
                      <svg className="topbarBellIcon" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M18 9a6 6 0 10-12 0v4l-2 3h16l-2-3zM10 19a2 2 0 004 0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <Link className="topbarIconBtn exploreTopbarIconOnly" to="/profile" aria-label="Profile">
                      <img className="topbarAvatar" src={userIcon} alt="" aria-hidden="true" />
                    </Link>
                  </>
                ) : (
                  <Link className="topbarPill subtle" to="/login">
                    Sign in
                  </Link>
                )}
              </>
            }
          />
        }
        isSidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      >
        {toastMsg ? <div className="toast">{toastMsg}</div> : null}

        <section className="exploreFeedPanel">
          <div className="exploreLayout">
            <main className="exploreMain">
              <div className="exploreFilters" role="tablist" aria-label="Explore filters">
                {FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    className={`miniBtn exploreFilterPill ${sectionFilter === filter.value ? "isActive" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={sectionFilter === filter.value}
                    onClick={() => setSectionFilter(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {loadError ? <div className="warning">{loadError}</div> : null}

              <section className="exploreSectionBlock">
                <div className="exploreSectionHead">
                  <div className="listTitle">Trending</div>
                </div>

                <div className="trendingWrap">
                  {loadingTrending ? (
                    <div ref={trendingScrollerRef} className="trendingRow skeletonRow" aria-hidden="true">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <div key={`trend-skeleton-${index}`} className="trendingListSkeleton" />
                      ))}
                    </div>
                  ) : trendingLists.length === 0 ? (
                    <div className="collectionsEmpty compact">
                      <div className="collectionsEmptyTitle">No trending collections yet</div>
                      <div className="collectionsEmptyText">Try another section or search term.</div>
                    </div>
                  ) : (
                    <div ref={trendingScrollerRef} className="trendingRow" role="list" aria-label="Trending collections">
                      {trendingLists.map((list) => (
                        <TrendingListCard
                          key={`trending-${list.id}`}
                          list={list}
                          handle={list.owner_handle}
                          isSaved={!!saveStateByListId[list.id]?.saved}
                          isSaving={!!saveStateByListId[list.id]?.saving}
                          onSave={() => handleToggleSaveList(list)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <div className="exploreLowerLayout">
                <section className="exploreNewColumn">
                  <div className="exploreSectionHead newSection">
                    <div className="listTitle">New this week</div>
                  </div>

                  {loadingNew ? (
                    <div className="exploreDiscoveryGrid" aria-hidden="true">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={`new-skeleton-${index}`} className="exploreFeedCardSkeleton" />
                      ))}
                    </div>
                  ) : newLists.length === 0 ? (
                    <div className="collectionsEmpty compact">
                      <div className="collectionsEmptyTitle">No new collections found</div>
                      <div className="collectionsEmptyText">Try a different filter or clear search.</div>
                    </div>
                  ) : (
                    <>
                      <div className="exploreDiscoveryGrid">
                        {newLists.map((list) => (
                          <ExploreFeedCard
                            key={`new-${list.id}`}
                            list={list}
                            isSaved={!!saveStateByListId[list.id]?.saved}
                            isSaving={!!saveStateByListId[list.id]?.saving}
                            onSave={() => handleToggleSaveList(list)}
                          />
                        ))}
                      </div>

                      {hasMoreNew ? (
                        <div className="exploreLoadMoreRow">
                          <button className="miniBtn blue" type="button" onClick={loadMoreNew} disabled={loadingMoreNew}>
                            {loadingMoreNew ? "Loading..." : "Load more"}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>
              </div>
            </main>
          </div>
        </section>

        <div
          className={`exploreFollowingOverlay ${followingPanelOpen ? "isOpen" : ""}`}
          role="presentation"
          onClick={() => setFollowingPanelOpen(false)}
        />

        <aside
          id="explore-following-drawer"
          className={`exploreFollowingDrawer ${followingPanelOpen ? "isOpen" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Following creators"
          aria-hidden={!followingPanelOpen}
        >
          <div className="exploreFollowingHead">
            <div className="listTitle">Following</div>
            <button
              className="exploreFollowingClose"
              type="button"
              onClick={() => setFollowingPanelOpen(false)}
              aria-label="Close following panel"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <div className="exploreFollowingSearchRow">
            <label className="visuallyHidden" htmlFor="explore-creator-search">
              Search creators
            </label>
            <span className="exploreFollowingSearchIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="presentation">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M20 20l-3.1-3.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <input
              id="explore-creator-search"
              ref={creatorSearchInputRef}
              className="exploreFollowingSearchInput"
              type="search"
              placeholder="Search creators"
              value={creatorSearchInput}
              onChange={(event) => setCreatorSearchInput(event.target.value)}
            />
          </div>

          <div className="exploreFollowingBody">
            {loadingCreators ? (
              <div className="exploreSidebarLoading" aria-hidden="true">
                <div className="exploreSidebarLoadingRow" />
                <div className="exploreSidebarLoadingRow" />
                <div className="exploreSidebarLoadingRow" />
              </div>
            ) : creators.length === 0 ? (
              <div className="exploreSidebarEmpty">No creators yet</div>
            ) : creatorsToRender.length === 0 ? (
              <div className="exploreSidebarEmpty">No creators match your search.</div>
            ) : (
              <div className="exploreCreatorList">
                {creatorGroupsToRender.map((group) => (
                  <section key={`creator-group-${group.key}`} className="exploreCreatorGroup">
                    <div className="exploreCreatorGroupTitle">{group.label}</div>
                    {group.creators.map((creator) => {
                      const isFollowing = followedCreatorIdSet.has(creator.id);
                      const followWorking = !!followWorkingByCreatorId[creator.id];
                      const followError = followErrorByCreatorId[creator.id] || "";
                      const displayName = creator.displayName || creator.handle || "Stash user";
                      const creatorHandle = normalizeHandle(creator.handle || "");
                      const creatorRouteKey = creatorHandle || String(creator.id || "").trim();
                      const creatorHref = creatorRouteKey ? `/@${creatorRouteKey}` : "/explore";
                      return (
                        <div key={`creator-${creator.id}`} className="exploreCreatorBlock">
                          <div className="exploreCreatorRow">
                            <Link
                              className="exploreCreatorIdentity"
                              to={creatorHref}
                              onClick={() => setFollowingPanelOpen(false)}
                            >
                              <span className="exploreCreatorAvatar" aria-hidden="true">
                                {creator.avatarUrl ? (
                                  <img src={creator.avatarUrl} alt="" />
                                ) : (
                                  <span>{displayName.charAt(0).toUpperCase()}</span>
                                )}
                              </span>
                              <span className="exploreCreatorCopy">
                                <span className="exploreCreatorName">{displayName}</span>
                                {creatorHandle ? <span className="exploreCreatorHandle">@{creatorHandle}</span> : null}
                              </span>
                            </Link>
                            <button
                              className={`miniBtn exploreFollowBtn ${isFollowing ? "isFollowing" : ""}`}
                              type="button"
                              onClick={() => handleToggleFollowCreator(creator)}
                              disabled={followWorking || loadingCreatorFollows}
                            >
                              {followWorking ? "..." : isFollowing ? "Following" : "Follow"}
                            </button>
                          </div>
                          {followError ? <div className="exploreCreatorError">{followError}</div> : null}
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}

            {creatorLoadError ? <div className="exploreSidebarError">{creatorLoadError}</div> : null}
          </div>

          {hasMoreCreators ? (
            <div className="exploreFollowingFooter">
              <button
                className="miniBtn"
                type="button"
                onClick={() => setCreatorVisibleCount((prev) => prev + CREATOR_VISIBLE_STEP)}
              >
                View all
              </button>
            </div>
          ) : null}
        </aside>
      </AppShell>
    </div>
  );
}
