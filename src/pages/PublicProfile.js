import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import PublicListCard from "../components/PublicListCard";
import { hydrateListPreviewImages } from "../lib/socialDiscovery";
import { getPublicCollectionsByHandle } from "../lib/publishedCollections";
import stashLogo from "../assets/icons/stash-favicon.png";
import userIcon from "../assets/icons/user.png";

function normalizeHandleParam(input = "") {
  return String(input || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function displayNameForProfile(profile) {
  if (!profile) return "";
  return profile.display_name || profile.handle || "Stash user";
}

export default function PublicProfile() {
  const params = useParams();
  const rawHandle = params.handle || "";
  const isPublicHandlePath = String(rawHandle || "").trim().startsWith("@");
  const handle = normalizeHandleParam(rawHandle);
  const { user, loading: authLoading } = useAuth();
  const viewerUserId = user?.id || null;
  const { trips } = useTrips();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [profile, setProfile] = useState(null);
  const [lists, setLists] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingLists, setLoadingLists] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const [checkingFollow, setCheckingFollow] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followWorking, setFollowWorking] = useState(false);
  const [followError, setFollowError] = useState("");

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
      .sort((a, b) => (a.pinned_order ?? 9999) - (b.pinned_order ?? 9999))
      .slice(0, 3);
  }, [lists]);

  const latestLists = useMemo(() => {
    const pinnedIds = new Set(pinnedLists.map((l) => l.id));
    return lists.filter((l) => !pinnedIds.has(l.id));
  }, [lists, pinnedLists]);

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    setProfile(null);
    setLists([]);
    setLoadingProfile(true);
    setLoadingLists(true);
    setNotFound(false);
    setLoadError("");
    setFollowError("");
    setIsFollowing(false);
    setCheckingFollow(false);

    async function load() {
      if (!isPublicHandlePath || !handle) {
        if (!active) return;
        setNotFound(true);
        setLoadingProfile(false);
        setLoadingLists(false);
        return;
      }

      const collectionsResult = await getPublicCollectionsByHandle({
        handleInput: handle,
        viewerUserId,
        limit: 80,
      });

      if (!active) return;
      if (collectionsResult.status === "not_found" || !collectionsResult.profile) {
        setNotFound(true);
        setLoadingProfile(false);
        setLoadingLists(false);
        return;
      }

      const profileData = collectionsResult.profile;
      setProfile(profileData);
      setLoadingProfile(false);

      if (collectionsResult.status === "error") {
        setLoadError("Could not load public collections right now.");
        setLists([]);
      } else {
        const hydratedLists = await hydrateListPreviewImages(collectionsResult.collections || []);
        if (!active) return;
        setLists(hydratedLists);
      }
      setLoadingLists(false);

      if (viewerUserId && viewerUserId !== profileData.id) {
        setCheckingFollow(true);
        const { data: followData, error: followLookupError } = await supabase
          .from("follows")
          .select("following_user_id")
          .eq("follower_user_id", viewerUserId)
          .eq("following_user_id", profileData.id)
          .limit(1);

        if (!active) return;
        if (!followLookupError) {
          setIsFollowing((followData || []).length > 0);
        }
        setCheckingFollow(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [authLoading, handle, isPublicHandlePath, viewerUserId]);

  async function toggleFollow() {
    if (!profile || !user || user.id === profile.id) return;
    if (followWorking) return;
    setFollowWorking(true);
    setFollowError("");

    if (isFollowing) {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_user_id", user.id)
        .eq("following_user_id", profile.id);
      if (error) {
        setFollowError("Could not unfollow right now.");
      } else {
        setIsFollowing(false);
        setToastMsg("Unfollowed");
        setTimeout(() => setToastMsg(""), 1500);
      }
      setFollowWorking(false);
      return;
    }

    const { error } = await supabase.from("follows").insert({
      following_user_id: profile.id,
    });
    if (error) {
      setFollowError("Could not follow right now.");
    } else {
      setIsFollowing(true);
      setToastMsg("Following");
      setTimeout(() => setToastMsg(""), 1500);
    }
    setFollowWorking(false);
  }

  return (
    <div className="page publicProfilePage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
      <AppShell
        sidebar={
          <SidebarNav
            brandIcon={
              <img className="sidebarBrandIcon" src={stashLogo} alt="" aria-hidden="true" />
            }
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
            title="Profile"
            subtitle={handle ? `@${handle}` : "Public profile"}
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

        <section className="panel p-5 collectionsPanel listPanel fullWidth">
          {notFound ? (
            <div className="collectionsEmpty">
              <div className="collectionsEmptyIcon" aria-hidden="true">
                ?
              </div>
              <div className="collectionsEmptyTitle">Profile not found</div>
              <div className="collectionsEmptyText">That profile isn’t available.</div>
              <div className="navRow">
                <Link className="miniBtn linkBtn" to="/">
                  Back home
                </Link>
              </div>
            </div>
          ) : loadingProfile ? (
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
              <div className="collectionsGrid">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="publicListSkeleton" />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="publicProfileHeader">
                <div className="publicProfileIdentity">
                  <div className="publicProfileAvatar" aria-hidden="true">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" />
                    ) : (
                      <span className="publicProfileAvatarText">
                        {displayNameForProfile(profile).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="publicProfileCopy">
                    <div className="publicProfileNameRow">
                      <div className="publicProfileName">{displayNameForProfile(profile)}</div>
                      {profile?.handle ? (
                        <div className="publicProfileHandle">@{profile.handle}</div>
                      ) : null}
                    </div>
                    {profile?.bio ? (
                      <div className="publicProfileBio">{profile.bio}</div>
                    ) : (
                      <div className="publicProfileBio muted">No bio yet.</div>
                    )}
                    {followError && <div className="publicProfileError">{followError}</div>}
                  </div>
                </div>

                {user && profile && user.id !== profile.id ? (
                  <div className="publicProfileActions">
                    <button
                      className={isFollowing ? "miniBtn" : "miniBtn blue"}
                      type="button"
                      onClick={toggleFollow}
                      disabled={followWorking || checkingFollow}
                    >
                      {checkingFollow
                        ? "…"
                        : followWorking
                        ? "Working…"
                        : isFollowing
                        ? "Following"
                        : "Follow"}
                    </button>
                  </div>
                ) : null}
              </div>

              {loadError && <div className="warning">{loadError}</div>}

              {loadingLists ? (
                <div className="collectionsGrid">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="publicListSkeleton" />
                  ))}
                </div>
              ) : lists.length === 0 ? (
                <div className="collectionsEmpty">
                  <div className="collectionsEmptyIcon" aria-hidden="true">
                    ✦
                  </div>
                  <div className="collectionsEmptyTitle">No public lists yet</div>
                  <div className="collectionsEmptyText">Check back soon.</div>
                </div>
              ) : (
                <>
                  {pinnedLists.length > 0 && (
                    <div className="publicProfileSection">
                      <div className="publicProfileSectionHeader">
                        <div className="listTitle">Pinned lists</div>
                      </div>
                      <div className="collectionsGrid">
                        {pinnedLists.map((list) => (
                          <PublicListCard key={list.id} list={list} handle={handle} />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="publicProfileSection">
                    <div className="publicProfileSectionHeader">
                      <div className="listTitle">Latest public lists</div>
                    </div>
                    <div className="collectionsGrid">
                      {latestLists.map((list) => (
                        <PublicListCard key={list.id} list={list} handle={handle} />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </AppShell>
    </div>
  );
}
