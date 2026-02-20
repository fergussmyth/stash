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
  const subtitle = String(list.subtitle || "").trim();

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
  const listTitle = String(list.title || "Untitled list");

  const cardContent = (
    <div className={`profileShowcaseCardMedia ${compact ? "compact" : ""}`} style={{ backgroundImage: coverBackground }}>
      {isImageCover && (
        <img
          src={coverImageUrl}
          alt=""
          loading="lazy"
          onLoad={() => setCoverLoaded(true)}
          onError={() => setCoverLoaded(true)}
          style={{ opacity: coverLoaded ? 1 : 0, transition: "opacity 0.25s ease" }}
        />
      )}
      <div className="profileShowcaseCardShade" />
      <div className="profileShowcaseCardBody">
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
        <div className="profileShowcaseCardTitle">{listTitle}</div>
        <div className={`profileShowcaseCardMeta publicProfileCardMeta ${subtitle ? "" : "isFallback"}`}>
          {subtitle || "Public collection"}
        </div>
        <div className="profileShowcaseCardFooter">
          <span className="profileShowcaseCardTag">{sectionLabel(list.section)}</span>
          <span className="profileShowcaseCardCount">{saveCount.toLocaleString()} saves</span>
        </div>
      </div>
    </div>
  );

  const canSave = typeof onSave === "function";

  if (to && !canSave) {
    return (
      <Link className={`profileShowcaseCard publicProfileCardLink ${compact ? "compact" : ""}`} to={to} aria-label={listTitle}>
        {cardContent}
      </Link>
    );
  }

  if (to && canSave) {
    return (
      <article className={`profileShowcaseCard publicListCard withActions ${compact ? "compact" : ""}`} aria-label={listTitle}>
        <Link className="publicProfileCardLink" to={to} aria-label={listTitle}>
          {cardContent}
        </Link>
        <div className="publicListCardActions">
          <button className={isSaved ? "miniBtn active" : "miniBtn blue"} type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Working..." : isSaved ? "Saved" : "Save"}
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
    <article className={`profileShowcaseCard publicListCard withActions ${compact ? "compact" : ""}`} aria-label={listTitle}>
      <div className="publicProfileCardLink">{cardContent}</div>
      {canSave ? (
        <div className="publicListCardActions">
          <button className={isSaved ? "miniBtn active" : "miniBtn blue"} type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Working..." : isSaved ? "Saved" : "Save"}
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
