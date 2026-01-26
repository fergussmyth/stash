import { Link } from "react-router-dom";
import { useTrips } from "../hooks/useTrips";

import { useState } from "react";

function cleanAirbnbUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function extractRoomIdFromUrl(url) {
  const cleaned = cleanAirbnbUrl(url);
  const match = cleaned.match(/\/rooms\/(\d+)/i);
  return match ? match[1] : null;
}

function fallbackTitleForUrl(url) {
  const roomId = extractRoomIdFromUrl(url);
  return roomId ? `Airbnb room ${roomId}` : "Airbnb room";
}

export default function Trips() {
  const { trips, createTrip, deleteTrip, user, loading, localImportAvailable, importLocalTrips } =
    useTrips();

  return (
    <div className="page">
      <div className="card glow">
        <h1>
          Your <span>Trips</span>
        </h1>

        <div className="content">
          {!user && (
            <div className="muted">
              Sign in to create and sync trips across devices.
            </div>
          )}

          {user && localImportAvailable && (
            <div className="importBox">
              <div className="importText">Local trips found on this device.</div>
              <button className="miniBtn" type="button" onClick={importLocalTrips}>
                Import local trips to cloud
              </button>
            </div>
          )}

          <div className="tripCreate">
            <TripCreate createTrip={createTrip} disabled={!user} />
          </div>

          <div className="tripList">
            {loading ? (
              <p className="muted">Loading trips...</p>
            ) : trips.length === 0 ? (
              <p className="muted">No trips yet. Create one and start saving links.</p>
            ) : (
              trips.map((t) => (
                <div key={t.id} className="tripCard">
                  <div className="tripMeta">
                    <div className="tripName">{t.name}</div>
                    <div className="tripCount">{t.items.length} saved</div>
                  </div>

                  {t.items.length > 0 && (
                    <div className="tripItemsPreview">
                      {t.items.slice(0, 3).map((item) => (
                        <a
                          key={item.id}
                          className="tripItemLink"
                          href={item.airbnbUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {(item.title || "").trim() || fallbackTitleForUrl(item.airbnbUrl)}
                        </a>
                      ))}
                      {t.items.length > 3 && (
                        <span className="tripItemMore">+{t.items.length - 3} more</span>
                      )}
                    </div>
                  )}

                  <div className="actions">
                    <Link className="secondary-btn linkBtn" to={`/trips/${t.id}`}>
                      Open
                    </Link>
                    <button className="secondary-btn" onClick={() => deleteTrip(t.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="navRow">
            <Link className="miniBtn linkBtn" to="/">
              ← Back to Extractor
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function TripCreate({ createTrip, disabled }) {
  const [name, setName] = useState("");

  async function handleCreate() {
    const id = await createTrip(name);
    if (!id) return;
    setName("");
  }

  return (
    <div className="createTripRow">
      <input
        className="input"
        placeholder="New trip name (e.g. Paris weekend)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={disabled}
      />
      <button className="secondary-btn" onClick={handleCreate} disabled={disabled}>
        Create
      </button>
    </div>
  );
}
