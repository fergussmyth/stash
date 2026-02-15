import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import stashLogo from "../assets/icons/stash-favicon.png";
import settingsIcon from "../assets/icons/settings.png";

const SECTION_LABELS = {
  general: "Ideas",
  travel: "Travel",
  fashion: "Fashion",
};

function makeFallbackGradient(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const colors = ["#0f172a", "#1b2a4a", "#0b3b5e", "#1f2a44", "#21436d", "#103a3f"];
  const pick = (offset) => colors[Math.abs(hash + offset) % colors.length];
  return `linear-gradient(140deg, ${pick(0)} 0%, ${pick(2)} 55%, ${pick(4)} 100%)`;
}

function isGradientCover(value = "") {
  const normalized = String(value || "").trim();
  return normalized.startsWith("linear-gradient") || normalized.startsWith("radial-gradient");
}

function normalizeSection(section = "") {
  const normalized = String(section || "").trim().toLowerCase();
  if (normalized === "travel") return "travel";
  if (normalized === "fashion") return "fashion";
  return "general";
}

function formatRelativeTime(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "recently";

  const diffMs = Math.max(0, Date.now() - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diffMs < minute) return "just now";
  if (diffMs < hour) {
    const mins = Math.max(1, Math.round(diffMs / minute));
    return `${mins}m ago`;
  }
  if (diffMs < day) {
    const hours = Math.max(1, Math.round(diffMs / hour));
    return `${hours}h ago`;
  }
  if (diffMs < week) {
    const days = Math.max(1, Math.round(diffMs / day));
    return `${days}d ago`;
  }
  const weeks = Math.max(1, Math.round(diffMs / week));
  return `${weeks}w ago`;
}

function sortTripsByNewest(trips) {
  return [...trips].sort((a, b) => {
    const aTime = Date.parse(a.createdAt || "") || 0;
    const bTime = Date.parse(b.createdAt || "") || 0;
    return bTime - aTime;
  });
}

function displayNameForProfile(profile, user) {
  if (profile?.display_name) return profile.display_name;
  if (user?.email) return user.email.split("@")[0];
  return "Stash user";
}

function initialForProfile(profile, user) {
  const source = displayNameForProfile(profile, user);
  return source.charAt(0).toUpperCase() || "S";
}

function ProfileAvatar({ profile, user, className, textClassName }) {
  if (profile?.avatar_url) {
    return <img className={className} src={profile.avatar_url} alt="" aria-hidden="true" />;
  }

  return (
    <span className={textClassName} aria-hidden="true">
      {initialForProfile(profile, user)}
    </span>
  );
}

function ProfileListRow({ person }) {
  const name = person?.display_name || person?.handle || "Stash user";
  const handleText = person?.handle ? `@${person.handle}` : "No handle";

  return (
    <div className="profileShowcasePersonRow">
      <div className="profileShowcasePersonIdentity">
        <span className="profileShowcasePersonAvatar" aria-hidden="true">
          {person?.avatar_url ? (
            <img src={person.avatar_url} alt="" />
          ) : (
            <span className="profileShowcasePersonInitial">{name.charAt(0).toUpperCase()}</span>
          )}
        </span>
        <div className="profileShowcasePersonCopy">
          <div className="profileShowcasePersonName">{name}</div>
          <div className="profileShowcasePersonHandle">{handleText}</div>
        </div>
      </div>
      {person?.handle ? (
        <Link className="profileShowcaseFollowBtn" to={`/@${person.handle}`}>
          View
        </Link>
      ) : (
        <span className="profileShowcaseFollowBtn disabled">Member</span>
      )}
    </div>
  );
}

export default function Profile() {
  const { user, loading } = useAuth();
  const { trips } = useTrips();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileBusy, setProfileBusy] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [activeTab, setActiveTab] = useState("collections");
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [saveCount, setSaveCount] = useState(0);
  const [followingProfiles, setFollowingProfiles] = useState([]);
  const [followerProfiles, setFollowerProfiles] = useState([]);

  const categoryCounts = useMemo(
    () =>
      ["general", "travel", "fashion"].reduce((acc, category) => {
        acc[category] = trips.filter((trip) => normalizeSection(trip.type) === category).length;
        return acc;
      }, {}),
    [trips]
  );

  const sortedTrips = useMemo(() => sortTripsByNewest(trips), [trips]);

  const collectionsForTab = useMemo(() => {
    if (activeTab === "saves") {
      return sortedTrips
        .filter((trip) => Number(trip.saveCount || 0) > 0)
        .sort((a, b) => Number(b.saveCount || 0) - Number(a.saveCount || 0));
    }
    return sortedTrips;
  }, [activeTab, sortedTrips]);

  const activityItems = useMemo(() => {
    return sortedTrips.slice(0, 5).map((trip) => ({
      id: trip.id,
      title: trip.isShared ? `Shared ${trip.name}` : `Updated ${trip.name}`,
      subtitle: `${trip.items?.length || 0} links`,
      when: formatRelativeTime(trip.createdAt),
      mediaUrl: trip.coverImageUrl || "",
    }));
  }, [sortedTrips]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    let mounted = true;

    async function loadProfile() {
      setProfileBusy(true);
      setProfileError("");

      try {
        const [profileResult, followersResult, followingResult, savesResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("display_name, handle, bio, avatar_url")
            .eq("id", user.id)
            .single(),
          supabase
            .from("follows")
            .select("follower_user_id, created_at", { count: "exact" })
            .eq("following_user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(12),
          supabase
            .from("follows")
            .select("following_user_id, created_at", { count: "exact" })
            .eq("follower_user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(12),
          supabase
            .from("list_saves")
            .select("list_id", { count: "exact", head: true })
            .eq("user_id", user.id),
        ]);

        if (!mounted) return;

        if (profileResult.error) {
          setProfileError("Could not load profile details right now.");
        }

        setProfile(profileResult.data || null);

        const followersRows = followersResult.data || [];
        const followingRows = followingResult.data || [];

        setFollowerCount(
          typeof followersResult.count === "number" ? followersResult.count : followersRows.length
        );
        setFollowingCount(
          typeof followingResult.count === "number" ? followingResult.count : followingRows.length
        );
        setSaveCount(typeof savesResult.count === "number" ? savesResult.count : 0);

        const followerIds = followersRows
          .map((row) => row.follower_user_id)
          .filter(Boolean);
        const followingIds = followingRows
          .map((row) => row.following_user_id)
          .filter(Boolean);

        const allIds = Array.from(new Set([...followerIds, ...followingIds]));
        if (allIds.length === 0) {
          setFollowerProfiles([]);
          setFollowingProfiles([]);
          return;
        }

        const { data: peopleRows, error: peopleError } = await supabase
          .from("profiles")
          .select("id, display_name, handle, avatar_url")
          .in("id", allIds);

        if (!mounted) return;

        if (peopleError) {
          setFollowerProfiles([]);
          setFollowingProfiles([]);
          return;
        }

        const peopleMap = new Map((peopleRows || []).map((row) => [row.id, row]));
        setFollowerProfiles(followerIds.map((id) => peopleMap.get(id)).filter(Boolean));
        setFollowingProfiles(followingIds.map((id) => peopleMap.get(id)).filter(Boolean));
      } finally {
        if (mounted) {
          setProfileBusy(false);
        }
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [loading, navigate, user]);

  if (loading) {
    return (
      <div className="page profilePage profileShowcasePage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
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
              subtitle="Your collections and social activity"
              searchValue=""
              onSearchChange={() => {}}
              onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
              actions={
                <Link className="topbarIconBtn" to="/profile/settings" aria-label="Profile settings">
                  <img
                    className="profileSettingsCogIcon"
                    src={settingsIcon}
                    alt=""
                    aria-hidden="true"
                  />
                </Link>
              }
            />
          }
          isSidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        >
          <div className="panel p-5">
            <p className="muted">Loading profile...</p>
          </div>
        </AppShell>
      </div>
    );
  }

  if (!user) return null;

  const displayName = displayNameForProfile(profile, user);
  const handleText = profile?.handle ? `@${profile.handle}` : "@stash";
  const bio = profile?.bio || "Organizing inspiration, plans, and shared collections.";

  const tabs = [
    { id: "collections", label: "Collections" },
    { id: "saves", label: "Saves" },
    { id: "activity", label: "Activity" },
    { id: "followers", label: "Followers" },
  ];

  return (
    <div className="page profilePage profileShowcasePage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
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
            title="Profile"
            subtitle="Your collections and social activity"
            searchValue=""
            onSearchChange={() => {}}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            actions={
              <Link className="topbarIconBtn" to="/profile/settings" aria-label="Profile settings">
                <img
                  className="profileSettingsCogIcon"
                  src={settingsIcon}
                  alt=""
                  aria-hidden="true"
                />
              </Link>
            }
          />
        }
        isSidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      >
        <section className="panel p-5 profileShowcasePanel">
          {profileError && <div className="warning">{profileError}</div>}

          <div className="profileShowcaseLayout">
            <div className="profileShowcaseMain">
              <section className="profileShowcaseHero">
                <div className="profileShowcaseIdentity">
                  <div className="profileShowcaseAvatarWrap" aria-hidden="true">
                    <ProfileAvatar
                      profile={profile}
                      user={user}
                      className="profileShowcaseAvatarImage"
                      textClassName="profileShowcaseAvatarText"
                    />
                  </div>

                  <div className="profileShowcaseCopy">
                    <h1 className="profileShowcaseName">{displayName}</h1>
                    <div className="profileShowcaseHandle">{handleText}</div>
                    <p className="profileShowcaseBio">{bio}</p>

                    <div className="profileShowcaseStats" aria-label="Profile stats">
                      <div className="profileShowcaseStat">
                        <span className="profileShowcaseStatValue">{followingCount}</span>
                        <span className="profileShowcaseStatLabel">Following</span>
                      </div>
                      <div className="profileShowcaseStat">
                        <span className="profileShowcaseStatValue">{followerCount}</span>
                        <span className="profileShowcaseStatLabel">Followers</span>
                      </div>
                      <div className="profileShowcaseStat">
                        <span className="profileShowcaseStatValue">{trips.length}</span>
                        <span className="profileShowcaseStatLabel">Collections</span>
                      </div>
                      <div className="profileShowcaseStat">
                        <span className="profileShowcaseStatValue">{saveCount}</span>
                        <span className="profileShowcaseStatLabel">Saves</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="profileShowcaseTabs" role="tablist" aria-label="Profile sections">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={`profileShowcaseTab ${activeTab === tab.id ? "isActive" : ""}`}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </section>

              {activeTab === "collections" || activeTab === "saves" ? (
                collectionsForTab.length > 0 ? (
                  <section className="profileShowcaseGrid" aria-label="Collections">
                    {collectionsForTab.map((trip) => {
                      const section = normalizeSection(trip.type);
                      const coverImage = String(trip.coverImageUrl || "").trim();
                      const fallbackGradient = makeFallbackGradient(`${trip.id}-${trip.name || "trip"}`);
                      const gradientCover =
                        isGradientCover(coverImage) || String(trip.coverImageSource || "").trim() === "gradient";
                      const imageCover = !!coverImage && !gradientCover && !coverImage.startsWith("data:");
                      const coverBackground = gradientCover ? coverImage || fallbackGradient : fallbackGradient;

                      return (
                        <button
                          key={trip.id}
                          className="profileShowcaseCard"
                          type="button"
                          onClick={() => navigate(`/trips/${trip.id}`)}
                        >
                          <div className="profileShowcaseCardMedia" style={{ backgroundImage: coverBackground }}>
                            {imageCover ? <img src={coverImage} alt="" loading="lazy" /> : null}
                            <div className="profileShowcaseCardShade" />
                            <div className="profileShowcaseCardBody">
                              <div className="profileShowcaseCardTitle">{trip.name || "Untitled collection"}</div>
                              <div className="profileShowcaseCardMeta">
                                {trip.items?.length || 0} links - {formatRelativeTime(trip.createdAt)}
                              </div>
                              <div className="profileShowcaseCardFooter">
                                <span className="profileShowcaseCardTag">{SECTION_LABELS[section]}</span>
                                <span className="profileShowcaseCardCount">{Number(trip.saveCount || 0)} saves</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </section>
                ) : (
                  <div className="profileShowcaseEmpty">
                    {activeTab === "saves"
                      ? "No saved collections yet."
                      : "No collections yet. Start by creating one from your Collections page."}
                  </div>
                )
              ) : null}

              {activeTab === "activity" ? (
                activityItems.length > 0 ? (
                  <section className="profileShowcaseStack" aria-label="Activity list">
                    {activityItems.map((item) => (
                      <div key={item.id} className="profileShowcaseStackItem">
                        <div className="profileShowcaseStackTitle">{item.title}</div>
                        <div className="profileShowcaseStackMeta">{item.subtitle}</div>
                        <div className="profileShowcaseStackTime">{item.when}</div>
                      </div>
                    ))}
                  </section>
                ) : (
                  <div className="profileShowcaseEmpty">No recent activity.</div>
                )
              ) : null}

              {activeTab === "followers" ? (
                followerProfiles.length > 0 ? (
                  <section className="profileShowcaseStack" aria-label="Followers list">
                    {followerProfiles.map((person) => (
                      <ProfileListRow key={person.id} person={person} />
                    ))}
                  </section>
                ) : (
                  <div className="profileShowcaseEmpty">No followers yet.</div>
                )
              ) : null}
            </div>

            <aside className="profileShowcaseRail" aria-label="Profile sidebar">
              <section className="profileShowcaseRailCard">
                <div className="profileShowcaseRailHeader">
                  <h2>Activity</h2>
                  <span>{activityItems.length}</span>
                </div>
                {profileBusy ? (
                  <div className="profileShowcaseRailEmpty">Loading...</div>
                ) : activityItems.length > 0 ? (
                  <div className="profileShowcaseRailList">
                    {activityItems.slice(0, 4).map((item) => {
                      const mediaUrl = String(item.mediaUrl || "").trim();
                      const gradientThumb = isGradientCover(mediaUrl);
                      const imageThumb = !!mediaUrl && !gradientThumb;
                      return (
                        <div key={item.id} className="profileShowcaseRailItem">
                          <div
                            className="profileShowcaseRailThumb"
                            aria-hidden="true"
                            style={gradientThumb ? { backgroundImage: mediaUrl, backgroundSize: "cover" } : undefined}
                          >
                            {imageThumb ? <img src={mediaUrl} alt="" /> : <span>{initialForProfile(profile, user)}</span>}
                          </div>
                          <div className="profileShowcaseRailCopy">
                            <div className="profileShowcaseRailTitle">{item.title}</div>
                            <div className="profileShowcaseRailMeta">{item.when}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="profileShowcaseRailEmpty">No recent updates.</div>
                )}
              </section>

              <section className="profileShowcaseRailCard">
                <div className="profileShowcaseRailHeader">
                  <h2>Following</h2>
                  <span>{followingCount}</span>
                </div>
                {profileBusy ? (
                  <div className="profileShowcaseRailEmpty">Loading...</div>
                ) : followingProfiles.length > 0 ? (
                  <div className="profileShowcaseRailPeople">
                    {followingProfiles.slice(0, 4).map((person) => (
                      <ProfileListRow key={person.id} person={person} />
                    ))}
                  </div>
                ) : (
                  <div className="profileShowcaseRailEmpty">You are not following anyone yet.</div>
                )}
              </section>
            </aside>
          </div>
        </section>
      </AppShell>
    </div>
  );
}
