import { Link, useParams } from "react-router-dom";
import { useTrips } from "../hooks/useTrips";

function fallbackTitleForUrl(url) {
  const match = url?.match(/\/rooms\/(\d+)/i);
  return match ? `Airbnb room ${match[1]}` : "Airbnb room";
}

export default function ShareTrip() {
  const { shareId } = useParams();
  const { trips } = useTrips();

  const trip = trips.find((t) => t.shareId === shareId);

  if (!trip) {
    return (
      <div className="page">
        <div className="card glow">
          <h1>
            Share <span>Link</span>
          </h1>

          <div className="content">
            <p className="muted">That share link doesn’t exist (or was disabled).</p>
            <div className="navRow">
              <Link className="miniBtn linkBtn" to="/trips">
                ← Trips
              </Link>
              <Link className="miniBtn linkBtn" to="/">
                Extractor
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card glow">
        <h1>
          {trip.name} <span>Shared</span>
        </h1>

        <div className="content">
          {trip.items.length === 0 ? (
            <p className="muted">No links saved yet.</p>
          ) : (
            <div className="itemList">
              {trip.items.map((item) => (
                <div key={item.id} className="itemCard">
                  <div className="itemTop">
                    <a
                      className="itemLink"
                      href={item.airbnbUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {(item.title || "").trim() || fallbackTitleForUrl(item.airbnbUrl)}
                    </a>

                    <div className="itemActions">
                      <a
                        className="miniBtn linkBtn"
                        href={item.airbnbUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                      <button
                        className="miniBtn"
                        type="button"
                        onClick={() => navigator.clipboard.writeText(item.airbnbUrl)}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
