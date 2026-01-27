import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Trips from "./pages/Trips";
import TripDetail from "./pages/TripDetail";
import ShareTrip from "./pages/ShareTrip";
import { TripsProvider } from "./hooks/useTrips";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import userIcon from "./assets/icons/user.png";

function AppShell() {
  const location = useLocation();
  const hideNav = location.pathname.startsWith("/share/");
  const { user } = useAuth();

  return (
    <>
      {!hideNav && (
        <div className="topNav">
          <Link className="topNavLink" to="/">
            Extractor
          </Link>
          <Link className="topNavLink" to="/trips">
            Trips
          </Link>
          {user ? (
            <Link className="topNavLink iconLink" to="/profile" aria-label="Profile">
              <img className="topNavIcon" src={userIcon} alt="" aria-hidden="true" />
            </Link>
          ) : (
            <Link className="topNavLink" to="/login">
              Sign in
            </Link>
          )}
        </div>
      )}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/trips" element={<Trips />} />
        <Route path="/trips/:id" element={<TripDetail />} />
        <Route path="/profile" element={<Profile />} />
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
