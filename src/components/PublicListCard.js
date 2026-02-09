import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
  return "General";
}

export default function PublicListCard({
  list,
  handle,
  isSaved = false,
  isSaving = false,
  showCreator = false,
  compact = false,
  onSave = null,
  onViewSaved = null,
}) {
  const [coverLoaded, setCoverLoaded] = useState(false);
  const coverImageUrl = list.cover_image_url || list.preview_image_url || "";
  const coverSeed = useMemo(() => `${list.id || ""}-${list.title || ""}`, [list.id, list.title]);
  const fallbackGradient = useMemo(() => makeFallbackGradient(coverSeed), [coverSeed]);

  const isGradientCover =
    (coverImageUrl || "").startsWith("linear-gradient") ||
    (coverImageUrl || "").startsWith("radial-gradient");
  const isImageCover = !!coverImageUrl && !isGradientCover && !(coverImageUrl || "").startsWith("data:");
  const coverBackground = isGradientCover ? coverImageUrl || fallbackGradient : fallbackGradient;
  const saveCount = Number(list.save_count || 0);

  const ownerHandle = String(handle || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
  const to = ownerHandle && list?.slug ? `/@${ownerHandle}/${list.slug}` : "";
  const ownerAvatarUrl = String(list?.owner_avatar_url || "").trim();
  const ownerDisplayName = String(list?.owner_display_name || ownerHandle || "Stash user");

  const cardContent = (
    <>
      <div
        className={`collectionCardCover ${compact ? "compact" : ""} ${coverLoaded ? "isLoaded" : ""}`}
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
        {showCreator ? (
          <div className="publicListCreatorRow">
            <span className="publicListCreatorAvatar" aria-hidden="true">
              {ownerAvatarUrl ? (
                <img src={ownerAvatarUrl} alt="" />
              ) : (
                <span>{ownerDisplayName.charAt(0).toUpperCase()}</span>
              )}
            </span>
            <span className="publicListCreatorMeta">
              <span className="publicListCreatorHandle">{ownerDisplayName}</span>
            </span>
          </div>
        ) : null}
        <div className="publicListTitleRow">
          <div className="tripName">{list.title || "Untitled list"}</div>
          <span className="tripCategory">{sectionLabel(list.section)}</span>
        </div>
        {list.subtitle ? <div className="publicListSubtitle">{list.subtitle}</div> : null}
        <div className="tripMetaLine">
          Saved by {saveCount}
          {list.is_ranked && list.ranked_size ? ` · Top ${list.ranked_size}` : ""}
        </div>
      </div>
    </>
  );

  const canSave = typeof onSave === "function";

  if (to && !canSave) {
    return (
      <Link
        className={`collectionCard publicListCard ${compact ? "compact" : ""}`}
        to={to}
        aria-label={list.title || "List"}
      >
        {cardContent}
      </Link>
    );
  }

  if (to && canSave) {
    return (
      <article
        className={`collectionCard publicListCard withActions ${compact ? "compact" : ""}`}
        aria-label={list.title || "List"}
      >
        <Link className="publicListCardMain" to={to} aria-label={list.title || "List"}>
          {cardContent}
        </Link>
        <div className="publicListCardActions">
          <button className={isSaved ? "miniBtn active" : "miniBtn blue"} type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Working…" : isSaved ? "Saved" : "Save"}
          </button>
          {isSaved && typeof onViewSaved === "function" ? (
            <button className="miniBtn" type="button" onClick={onViewSaved} disabled={isSaving}>
              View in my Stash
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article
      className={`collectionCard publicListCard withActions ${compact ? "compact" : ""}`}
      aria-label={list.title || "List"}
    >
      <div className="publicListCardMain">{cardContent}</div>
      {canSave ? (
        <div className="publicListCardActions">
          <button className={isSaved ? "miniBtn active" : "miniBtn blue"} type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Working…" : isSaved ? "Saved" : "Save"}
          </button>
          {isSaved && typeof onViewSaved === "function" ? (
            <button className="miniBtn" type="button" onClick={onViewSaved} disabled={isSaving}>
              View in my Stash
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
