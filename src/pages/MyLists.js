import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import stashLogo from "../assets/icons/stash-favicon.png";
import userIcon from "../assets/icons/user.png";

function MyListCard({ list }) {
  const [coverLoaded, setCoverLoaded] = useState(false);
  const coverSeed = useMemo(() => `${list.id || ""}-${list.title || ""}`, [list.id, list.title]);
  const fallbackGradient = useMemo(() => makeFallbackGradient(coverSeed), [coverSeed]);

  const coverImageUrl = list.cover_image_url || "";
  const isGradientCover =
    (coverImageUrl || "").startsWith("linear-gradient") ||
    (coverImageUrl || "").startsWith("radial-gradient");
  const isImageCover =
    !!coverImageUrl && !isGradientCover && !(coverImageUrl || "").startsWith("data:");
  const coverBackground = isGradientCover ? coverImageUrl || fallbackGradient : fallbackGradient;
  const saveCount = Number(list.save_count || 0);

  return (
    <Link className="collectionCard publicListCard" to={`/lists/${list.id}/edit`}>
      <div
        className={`collectionCardCover ${coverLoaded ? "isLoaded" : ""}`}
        style={{ backgroundImage: coverBackground }}
        aria-hidden="true"
      >
        {isImageCover && (
          <img
            src={coverImageUrl}
            alt=""
            loading="lazy"
            onLoad={() => setCoverLoaded(true)}
            onError={() => setCoverLoaded(true)}
          />
        )}
      </div>
      <div className="collectionCardBody">
        <div className="publicListTitleRow">
          <div className="tripName">{list.title || "Untitled list"}</div>
          <span className="tripCategory">{sectionLabel(list.section)}</span>
        </div>
        {list.subtitle ? <div className="publicListSubtitle">{list.subtitle}</div> : null}
        <div className="tripMetaLine">
          {visibilityLabel(list.visibility)}
          {list.pinned_order != null ? ` · Pinned #${list.pinned_order}` : ""}
          {` · Saved by ${saveCount}`}
          {list.is_ranked && list.ranked_size ? ` · Top ${list.ranked_size}` : ""}
        </div>
      </div>
    </Link>
  );
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

function makeFallbackGradient(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const colors = ["#0f172a", "#1e293b", "#0b3b5e", "#1f2a44", "#2b3655", "#0f3d3e"];
  const pick = (offset) => colors[Math.abs(hash + offset) % colors.length];
  return `linear-gradient(135deg, ${pick(0)} 0%, ${pick(2)} 50%, ${pick(4)} 100%)`;
}

export default function MyLists() {
  const { user, loading: authLoading } = useAuth();
  const viewerUserId = user?.id || null;
  const { trips } = useTrips();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [lists, setLists] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadError, setLoadError] = useState("");

  const categoryCounts = useMemo(
    () =>
      ["general", "travel", "fashion"].reduce((acc, category) => {
        acc[category] = trips.filter((trip) => (trip.type || "general") === category).length;
        return acc;
      }, {}),
    [trips]
  );

  const pinnedLists = useMemo(() => {
    return lists
      .filter((l) => l.pinned_order != null)
      .sort((a, b) => (a.pinned_order ?? 9999) - (b.pinned_order ?? 9999));
  }, [lists]);

  const otherLists = useMemo(() => {
    const pinnedIds = new Set(pinnedLists.map((l) => l.id));
    return lists.filter((l) => !pinnedIds.has(l.id));
  }, [lists, pinnedLists]);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setLists([]);
    setLoadError("");
    setLoadingLists(true);

    async function load() {
      if (!viewerUserId) {
        if (!active) return;
        setLists([]);
        setLoadingLists(false);
        return;
      }

      const { data, error } = await supabase
        .from("lists")
        .select(
          "id,section,title,subtitle,slug,cover_image_url,visibility,is_ranked,ranked_size,pinned_order,save_count,view_count,created_at,updated_at"
        )
        .eq("owner_user_id", viewerUserId)
        .order("updated_at", { ascending: false })
        .limit(100);

      if (!active) return;
      if (error) {
        setLoadError("Could not load your lists right now.");
        setLists([]);
      } else {
        setLists(data || []);
      }
      setLoadingLists(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [authLoading, viewerUserId]);

  return (
    <div className="page listsPage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
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
            title="Lists"
            subtitle="Curate public lists for your profile."
            searchValue=""
            onSearchChange={() => {}}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            actions={
              viewerUserId ? (
                <>
                  <Link className="topbarPill" to="/lists/new">
                    New List
                  </Link>
                  <Link className="topbarIconBtn" to="/profile" aria-label="Profile">
                    <img className="topbarAvatar" src={userIcon} alt="" aria-hidden="true" />
                  </Link>
                </>
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
            <div className="listHeaderRow">
              <div className="listTitleRow">
                <div className="listTitle">Your lists</div>
              </div>
              <div className="listHeaderActions">
                {viewerUserId ? (
                  <Link className="miniBtn blue linkBtn" to="/lists/new">
                    New List
                  </Link>
                ) : null}
              </div>
            </div>

            {loadError && <div className="warning">{loadError}</div>}

            {loadingLists ? (
              <div className="collectionsGrid">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="publicListSkeleton" />
                ))}
              </div>
            ) : !viewerUserId ? (
              <div className="collectionsEmpty">
                <div className="collectionsEmptyIcon" aria-hidden="true">
                  ✦
                </div>
                <div className="collectionsEmptyTitle">Sign in to create lists</div>
                <div className="collectionsEmptyText">Curate public lists you can share.</div>
                <div className="navRow">
                  <Link className="miniBtn linkBtn" to="/login">
                    Sign in
                  </Link>
                </div>
              </div>
            ) : lists.length === 0 ? (
              <div className="collectionsEmpty">
                <div className="collectionsEmptyIcon" aria-hidden="true">
                  ✦
                </div>
                <div className="collectionsEmptyTitle">No lists yet</div>
                <div className="collectionsEmptyText">Create your first public list.</div>
                <div className="navRow">
                  <Link className="miniBtn blue linkBtn" to="/lists/new">
                    New List
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {pinnedLists.length > 0 && (
                  <div className="publicProfileSection">
                    <div className="publicProfileSectionHeader">
                      <div className="listTitle">Pinned</div>
                    </div>
                    <div className="collectionsGrid">
                      {pinnedLists.map((l) => (
                        <MyListCard key={l.id} list={l} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="publicProfileSection">
                  <div className="publicProfileSectionHeader">
                    <div className="listTitle">{pinnedLists.length > 0 ? "All lists" : "Lists"}</div>
                  </div>
                  <div className="collectionsGrid">
                    {otherLists.map((l) => (
                      <MyListCard key={l.id} list={l} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </AppShell>
    </div>
  );
}
