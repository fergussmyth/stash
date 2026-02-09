import { useMemo, useState } from "react";

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

function sectionLabel(section = "") {
  const normalized = String(section || "").toLowerCase();
  if (normalized === "travel") return "Travel";
  if (normalized === "fashion") return "Fashion";
  return "Ideas";
}

export default function CollectionCard({
  trip,
  coverImageUrl,
  coverImageSource,
  isEditing,
  editingName,
  onEditingNameChange,
  onRenameSave,
  onRenameCancel,
  menuOpen,
  onToggleMenu,
  onShare,
  onChangeSection,
  onTogglePin,
  onDelete,
  onPublish,
  onOpen,
  onStartRename,
  formatLastUpdated,
  IconEdit,
  pinIcon,
}) {
  const section = String(trip.type || "general").toLowerCase();
  const sectionOptions = [
    { value: "general", label: "Ideas" },
    { value: "travel", label: "Travel" },
    { value: "fashion", label: "Fashion" },
  ];
  const [coverLoaded, setCoverLoaded] = useState(false);
  const linkCount = trip.items?.length || 0;
  const coverSeed = useMemo(() => `${trip.id || ""}-${trip.name || ""}`, [trip.id, trip.name]);
  const fallbackGradient = useMemo(() => makeFallbackGradient(coverSeed), [coverSeed]);
  const isGradientCover =
    coverImageSource === "gradient" ||
    (coverImageUrl || "").startsWith("linear-gradient") ||
    (coverImageUrl || "").startsWith("radial-gradient");
  const isImageCover =
    !!coverImageUrl && !isGradientCover && !(coverImageUrl || "").startsWith("data:");
  const coverBackground = isGradientCover
    ? coverImageUrl || fallbackGradient
    : fallbackGradient;
  const decisionBadge =
    trip.decisionStatus === "in_progress"
      ? "In progress"
      : trip.decisionStatus === "decided"
      ? "Decided"
      : "";

  return (
    <div
      className={`collectionCard ${trip.pinned ? "pinned" : ""} ${
        menuOpen ? "menuOpen" : ""
      } ${isEditing ? "isEditing" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (isEditing) return;
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (isEditing) return;
          onOpen();
        }
      }}
    >
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
        <div className="collectionCardShade" />
        {!isEditing ? (
          <>
            <div className="collectionCardTopRow">
              {trip.pinned ? (
                <button
                  className="tripPinBtn"
                  type="button"
                  aria-label="Unpin collection"
                  title="Unpin collection"
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePin();
                  }}
                >
                  <img className="tripPinIcon" src={pinIcon} alt="" aria-hidden="true" />
                </button>
              ) : (
                <span className="collectionCardTopSpacer" aria-hidden="true" />
              )}
              <div className="collectionCardTopActions">
                <button
                  className="iconBtn bare collectionCardEditBtn"
                  type="button"
                  aria-label="Edit collection"
                  title="Edit"
                  onClick={(event) => {
                    event.stopPropagation();
                    onStartRename();
                  }}
                >
                  <IconEdit className="quickActionIcon" />
                </button>
                <div className="tripMenuWrap" onClick={(event) => event.stopPropagation()}>
                  <button
                    className="tripMenuBtn"
                    type="button"
                    aria-label="Collection options"
                    onClick={onToggleMenu}
                  >
                    ⋮
                  </button>
                  {menuOpen && (
                    <div className="tripMenu" role="menu">
                      <button className="tripMenuItem" type="button" onClick={onStartRename}>
                        Edit
                      </button>
                      <button className="tripMenuItem" type="button" onClick={onShare}>
                        Share
                      </button>
                      {typeof onChangeSection === "function" ? (
                        <>
                          <div className="tripMenuSectionLabel">Move to section</div>
                          {sectionOptions.map((option) => (
                            <button
                              key={option.value}
                              className={`tripMenuItem ${section === option.value ? "active" : ""}`}
                              type="button"
                              disabled={section === option.value}
                              onClick={() => onChangeSection(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </>
                      ) : null}
                      {typeof onPublish === "function" ? (
                        <button className="tripMenuItem" type="button" onClick={onPublish}>
                          Publish
                        </button>
                      ) : null}
                      <button className="tripMenuItem danger" type="button" onClick={onDelete}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="collectionCardOverlay">
              <div className="tripNameRow">
                <div className="tripName">{trip.name}</div>
                <span className="tripCategory">{sectionLabel(trip.type)}</span>
                {decisionBadge && (
                  <span
                    className={`decisionBadge ${
                      trip.decisionStatus === "decided" ? "decided" : "progress"
                    }`}
                  >
                    {decisionBadge}
                  </span>
                )}
              </div>
              <div className="collectionCardOverlayMeta">
                {linkCount} link{linkCount === 1 ? "" : "s"} · last updated {formatLastUpdated(trip)}
              </div>
            </div>
          </>
        ) : null}
      </div>
      {isEditing ? (
        <div className="collectionCardEditPanel">
          <div className="tripRenameRow">
            <input
              className="input tripRenameInput"
              value={editingName}
              onChange={(event) => onEditingNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onRenameSave();
                }
                if (event.key === "Escape") {
                  onRenameCancel();
                }
              }}
            />
            <div className="tripRenameActions">
              <button
                className="tripRenameIcon save"
                type="button"
                onClick={onRenameSave}
                title="Save name"
                aria-label="Save name"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M5 12l4 4 10-10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                className="tripRenameIcon cancel"
                type="button"
                onClick={onRenameCancel}
                title="Cancel changes"
                aria-label="Cancel changes"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M6 6l12 12M18 6l-12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
