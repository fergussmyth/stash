import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import PublicListCard from "../components/PublicListCard";
import { fetchTrendingLists } from "../lib/socialDiscovery";
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
  const { trips } = useTrips();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sectionFilter, setSectionFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [lists, setLists] = useState([]);
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
                    <PublicListCard key={list.id} list={list} handle={list.owner_handle} />
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
