import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import PublicListCard from "../components/PublicListCard";
import { fetchTrendingLists } from "../lib/socialDiscovery";
import { getSavedListsByIds, savePublicListToStash } from "../lib/socialSave";
import stashLogo from "../assets/icons/stash-favicon.png";
import userIcon from "../assets/icons/user.png";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "travel", label: "Travel" },
  { value: "fashion", label: "Fashion" },
  { value: "general", label: "General" },
];

export default function Explore() {
  const { user } = useAuth();
  const { trips, createTrip, deleteTrip, reloadTripItems } = useTrips();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sectionFilter, setSectionFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [lists, setLists] = useState([]);
  const [saveStateByListId, setSaveStateByListId] = useState({});
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dataSource, setDataSource] = useState("");
  const requestIdRef = useRef(0);

  const categoryCounts = useMemo(
    () =>
      ["general", "travel", "fashion"].reduce((acc, category) => {
        acc[category] = trips.filter((trip) => (trip.type || "general") === category).length;
        return acc;
      }, {}),
    [trips]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchValue(searchInput.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function setToast(message) {
    setToastMsg(message);
    setTimeout(() => setToastMsg(""), 1700);
  }

  useEffect(() => {
    let active = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingLists(true);
    setLoadError("");

    fetchTrendingLists({
      section: sectionFilter,
      search: searchValue,
      limit: 24,
      offset: 0,
    })
      .then((result) => {
        if (!active || requestIdRef.current !== requestId) return;
        setLists(result.lists || []);
        setHasMore(!!result.hasMore);
        setDataSource(result.source || "");
      })
      .catch(() => {
        if (!active || requestIdRef.current !== requestId) return;
        setLists([]);
        setHasMore(false);
        setLoadError("Could not load explore lists right now.");
      })
      .finally(() => {
        if (!active || requestIdRef.current !== requestId) return;
        setLoadingLists(false);
      });

    return () => {
      active = false;
    };
  }, [sectionFilter, searchValue]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const offset = lists.length;
    try {
      const result = await fetchTrendingLists({
        section: sectionFilter,
        search: searchValue,
        limit: 24,
        offset,
      });
      const incoming = result.lists || [];
      setLists((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        const merged = [...prev];
        for (const row of incoming) {
          if (!row?.id || seen.has(row.id)) continue;
          seen.add(row.id);
          merged.push(row);
        }
        return merged;
      });
      setHasMore(!!result.hasMore);
      setDataSource(result.source || dataSource);
    } catch {
      setLoadError("Could not load more lists.");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    let active = true;
    const viewerUserId = user?.id || "";
    const ids = [...new Set((lists || []).map((row) => row.id).filter(Boolean))];
    if (!viewerUserId || !ids.length) {
      if (!viewerUserId) {
        setSaveStateByListId({});
      }
      return () => {
        active = false;
      };
    }

    getSavedListsByIds({ viewerUserId, listIds: ids }).then(({ map }) => {
      if (!active) return;
      setSaveStateByListId((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          const existing = next[id] || {};
          if (existing.saving) continue;
          const saved = map.has(id);
          const savedTripId = map.get(id)?.savedTripId || "";
          next[id] = {
            saved,
            savedTripId,
            saving: false,
          };
        }
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [user?.id, lists]);

  async function viewSavedList(list) {
    const listId = list?.id || "";
    if (!listId) return;
    const savedTripId = saveStateByListId[listId]?.savedTripId || "";
    if (savedTripId) {
      navigate(`/trips/${savedTripId}`);
      return;
    }
    if (!user?.id) {
      navigate("/login");
      return;
    }
    if (saveStateByListId[listId]?.saving) return;

    setSaveStateByListId((prev) => ({
      ...prev,
      [listId]: {
        saved: true,
        savedTripId: "",
        ...(prev[listId] || {}),
        saving: true,
      },
    }));

    const result = await savePublicListToStash({
      viewerUserId: user.id,
      list,
      ownerHandle: list.owner_handle || "",
      createTrip,
      deleteTrip,
      reloadTripItems,
    });

    if (result.status === "saved" || result.status === "already_saved") {
      const nextTripId = result.savedTripId || "";
      setSaveStateByListId((prev) => ({
        ...prev,
        [listId]: {
          saved: true,
          savedTripId: nextTripId,
          saving: false,
        },
      }));
      if (result.status === "saved" && result.insertedSaveRow) {
        setLists((prev) =>
          prev.map((row) =>
            row.id === listId
              ? { ...row, save_count: Number(row.save_count || 0) + 1 }
              : row
          )
        );
      }
      if (nextTripId) {
        navigate(`/trips/${nextTripId}`);
        return;
      }
      navigate("/trips");
      return;
    }

    setSaveStateByListId((prev) => ({
      ...prev,
      [listId]: {
        ...(prev[listId] || {}),
        saving: false,
      },
    }));
    setToast(result.message || "Couldn’t open saved copy.");
    navigate("/trips");
  }

  async function handleSaveList(list) {
    if (!list?.id) return;
    const listId = list.id;
    if (!user?.id) {
      navigate("/login");
      return;
    }

    const state = saveStateByListId[listId] || {};
    if (state.saving) return;
    if (state.saved) {
      await viewSavedList(list);
      return;
    }

    setSaveStateByListId((prev) => ({
      ...prev,
      [listId]: {
        saved: false,
        savedTripId: "",
        ...(prev[listId] || {}),
        saving: true,
      },
    }));

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
        setLists((prev) =>
          prev.map((row) =>
            row.id === listId
              ? { ...row, save_count: Number(row.save_count || 0) + 1 }
              : row
          )
        );
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
        saved: false,
        savedTripId: "",
        ...(prev[listId] || {}),
        saving: false,
      },
    }));
    setToast(result.message || "Couldn’t save right now.");
  }

  const subtitle = searchValue
    ? `Results for "${searchValue}"`
    : "Trending public lists across Stash.";
  const sectionLabel = FILTERS.find((item) => item.value === sectionFilter)?.label || "All";

  return (
    <div className="page explorePage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
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
            subtitle={subtitle}
            searchValue={searchInput}
            onSearchChange={setSearchInput}
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
        <section className="panel p-5 collectionsPanel listPanel fullWidth">
          <div className="panelContent">
            <div className="exploreFilters" role="tablist" aria-label="Explore filters">
              {FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  className={`miniBtn ${sectionFilter === filter.value ? "blue" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={sectionFilter === filter.value}
                  onClick={() => setSectionFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="exploreMeta">
              <div className="listTitle">{sectionLabel} lists</div>
              {dataSource === "fallback" ? (
                <div className="fieldHelp">Showing newest-ranked fallback while trend data warms up.</div>
              ) : null}
            </div>

            {loadError && <div className="warning">{loadError}</div>}

            {loadingLists ? (
              <div className="collectionsGrid">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="publicListSkeleton" />
                ))}
              </div>
            ) : lists.length === 0 ? (
              <div className="collectionsEmpty">
                <div className="collectionsEmptyIcon" aria-hidden="true">
                  ✦
                </div>
                <div className="collectionsEmptyTitle">No lists found</div>
                <div className="collectionsEmptyText">
                  Try another search or filter.
                </div>
              </div>
            ) : (
              <>
                <div className="collectionsGrid">
                  {lists.map((list) => (
                    <PublicListCard
                      key={list.id}
                      list={list}
                      handle={list.owner_handle}
                      isSaved={!!saveStateByListId[list.id]?.saved}
                      isSaving={!!saveStateByListId[list.id]?.saving}
                      onSave={() => handleSaveList(list)}
                      onViewSaved={() => viewSavedList(list)}
                    />
                  ))}
                </div>
                {hasMore ? (
                  <div className="exploreLoadMoreRow">
                    <button className="miniBtn blue" type="button" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
      </AppShell>
    </div>
  );
}
