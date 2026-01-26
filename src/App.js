import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Trips from "./pages/Trips";
import TripDetail from "./pages/TripDetail";
import ShareTrip from "./pages/ShareTrip";
import { TripsProvider } from "./hooks/useTrips";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { supabase } from "./lib/supabaseClient";
import Login from "./pages/Login";

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
            <button className="topNavLink" type="button" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
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
