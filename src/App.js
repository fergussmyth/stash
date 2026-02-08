import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Home from "./pages/Home";
import Trips from "./pages/Trips";
import TripDetail from "./pages/TripDetail";
import ShareTrip from "./pages/ShareTrip";
import Review from "./pages/Review";
import { TripsProvider } from "./hooks/useTrips";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import PublicList from "./pages/PublicList";
import MyLists from "./pages/MyLists";
import ListEditor from "./pages/ListEditor";
import ExtensionSettings from "./pages/ExtensionSettings";
import userIcon from "./assets/icons/user.png";
import stashLogo from "./assets/icons/stash-favicon.png";
import { supabase } from "./lib/supabaseClient";

function AppShell() {
  const location = useLocation();
  const {
    user,
    loading,
    rememberedProfile,
    rememberCurrentUser,
    clearRememberedProfile,
    resumeSession,
  } = useAuth();
  const navigate = useNavigate();
  const [showRememberPrompt, setShowRememberPrompt] = useState(false);
  const hideNav =
    location.pathname.startsWith("/share/") ||
    location.pathname === "/trips" ||
    location.pathname.startsWith("/trips/") ||
    location.pathname === "/review" ||
    location.pathname === "/profile" ||
    location.pathname.startsWith("/lists") ||
    location.pathname.startsWith("/@") ||
    location.pathname === "/" ||
    location.pathname === "/login";

  const publicOnly =
    location.pathname === "/" ||
    location.pathname === "/login" ||
    location.pathname.startsWith("/share/") ||
    location.pathname.startsWith("/@");

  const showAuthGate = !loading && !user && !publicOnly;

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const shouldPrompt = window.localStorage.getItem("stashShowRememberPrompt") === "true";
    setShowRememberPrompt(shouldPrompt);
  }, [user]);

  return (
    <>
      {!hideNav && (
        <div className="topNav">
          <div className="topNavInner">
            <Link className="topNavBrand" to="/" aria-label="Stash home">
              <img className="logo logo-icon" src={stashLogo} alt="Stash logo" />
              <span>Stash</span>
            </Link>
            <div className="topNavLinks">
              {user ? (
                <>
                  <Link className="topNavLink" to="/trips">
                    Stashes
                  </Link>
                  <Link className="topNavLink" to="/review">
                    Review
                  </Link>
                  <Link className="topNavLink iconLink" to="/profile" aria-label="Profile">
                    <img className="topNavIcon" src={userIcon} alt="" aria-hidden="true" />
                  </Link>
                </>
              ) : (
                <Link className="topNavLink" to="/login">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {showAuthGate && (
        <div className="authGateOverlay" role="dialog" aria-modal="true">
          <div className="authGateModal">
            <button
              className="authGateClose"
              type="button"
              onClick={() => navigate("/", { replace: true })}
              aria-label="Close"
            >
              ×
            </button>
            {rememberedProfile ? (
              <>
                <div className="authGateAvatar" aria-hidden="true">
                  {rememberedProfile.avatar_url ? (
                    <img src={rememberedProfile.avatar_url} alt="" />
                  ) : (
                    <span className="authGateAvatarText">
                      {(rememberedProfile.name || "U").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="authGateTitle">
                  Continue as {rememberedProfile.name || "User"}
                </div>
                {rememberedProfile.email && (
                  <div className="authGateSubtitle">{rememberedProfile.email}</div>
                )}
                <button
                  className="authGatePrimary"
                  type="button"
                  onClick={() => {
                    const resumed = resumeSession();
                    if (!resumed) {
                      navigate("/login", {
                        state: { prefillEmail: rememberedProfile.email || "" },
                      });
                    }
                  }}
                >
                  Continue
                </button>
                <button
                  className="authGateSecondary"
                  type="button"
                  onClick={() => {
                    clearRememberedProfile();
                    supabase.auth.signOut();
                    navigate("/login");
                  }}
                >
                  Use another profile
                </button>
                <button
                  className="authGateSecondary"
                  type="button"
                  onClick={() => navigate("/", { replace: true })}
                >
                  Back to home
                </button>
                <button
                  className="authGateSecondary"
                  type="button"
                  onClick={() => {
                    clearRememberedProfile();
                    supabase.auth.signOut();
                    navigate("/", { replace: true });
                  }}
                >
                  Forget this device
                </button>
              </>
            ) : (
              <>
                <div className="authGateAvatar" aria-hidden="true" />
                <div className="authGateTitle">Get more from Stash</div>
                <div className="authGateSubtitle">
                  Sign up to save, compare, and organize your collections.
                </div>
                <button
                  className="authGatePrimary"
                  type="button"
                  onClick={() => navigate("/login")}
                >
                  Sign up / Log in
                </button>
                <button
                  className="authGateSecondary"
                  type="button"
                  onClick={() => navigate("/", { replace: true })}
                >
                  Back to home
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {user && showRememberPrompt && (
        <div className="rememberOverlay" role="dialog" aria-modal="true">
          <div className="rememberModal">
            <div className="rememberIcon" aria-hidden="true">
              <span>🔒</span>
            </div>
            <div className="rememberTitle">Save your login info?</div>
            <div className="rememberSubtitle">
              We can save your login info on this browser so you don’t need to enter it again.
            </div>
            <button
              className="rememberPrimary"
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.localStorage.setItem("stashRememberMe", "true");
                  window.localStorage.setItem("stashShowRememberPrompt", "false");
                }
                rememberCurrentUser();
                setShowRememberPrompt(false);
              }}
            >
              Save info
            </button>
            <button
              className="rememberSecondary"
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.localStorage.setItem("stashShowRememberPrompt", "false");
                  window.localStorage.setItem("stashRememberMe", "false");
                  window.localStorage.removeItem("stashRememberedProfile");
                }
                clearRememberedProfile();
                setShowRememberPrompt(false);
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/trips" element={<Trips />} />
        <Route path="/trips/:id" element={<TripDetail />} />
        <Route path="/review" element={<Review />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/lists" element={<MyLists />} />
        <Route path="/lists/new" element={<ListEditor />} />
        <Route path="/lists/:id/edit" element={<ListEditor />} />
        <Route path="/:handle/:listSlug" element={<PublicList />} />
        <Route path="/:handle" element={<PublicProfile />} />
        <Route path="/settings/extension" element={<ExtensionSettings />} />
        <Route path="/share/:shareId" element={<ShareTrip />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TripsProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </TripsProvider>
    </AuthProvider>
  );
}
