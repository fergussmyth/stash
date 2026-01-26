import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Trips from "./pages/Trips";
import TripDetail from "./pages/TripDetail";
import ShareTrip from "./pages/ShareTrip";
import { TripsProvider } from "./hooks/useTrips";

function AppShell() {
  const location = useLocation();
  const hideNav = location.pathname.startsWith("/share/");

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
        </div>
      )}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/trips" element={<Trips />} />
        <Route path="/trips/:id" element={<TripDetail />} />
        <Route path="/share/:shareId" element={<ShareTrip />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <TripsProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </TripsProvider>
  );
}
