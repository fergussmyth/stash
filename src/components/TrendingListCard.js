import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import saveIcon from "../assets/icons/save-.png";
import saveFilledIcon from "../assets/icons/save-filled.png";

function makeFallbackGradient(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const colors = ["#020617", "#0f172a", "#10223f", "#1e293b", "#172554", "#0f3d3e"];
  const pick = (offset) => colors[Math.abs(hash + offset) % colors.length];
  return `linear-gradient(140deg, ${pick(0)} 0%, ${pick(2)} 52%, ${pick(4)} 100%)`;
}

function getTrendingBadge(list = {}) {
  if (list?.is_ranked && Number(list?.ranked_size) === 10) return "Top 10";
  if (list?.is_ranked) return "Top 5";
  return "Trending";
}

function formatSaveCount(input) {
  const count = Number(input || 0);
  if (!Number.isFinite(count)) return "0 saves";
  return `${count.toLocaleString()} ${count === 1 ? "save" : "saves"}`;
}

export default function TrendingListCard({
  list,
  handle,
  isSaved = false,
  isSaving = false,
  onSave = null,
  onViewSaved = null,
}) {
  const [coverLoaded, setCoverLoaded] = useState(false);

  const ownerHandle = String(handle || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
  const ownerAvatarUrl = String(list?.owner_avatar_url || "").trim();
  const ownerDisplayName = String(list?.owner_display_name || ownerHandle || "Stash user");
  const listTitle = String(list?.title || list?.name || "Untitled collection");
  const to = ownerHandle && list?.slug ? `/@${ownerHandle}/${list.slug}` : "";

  const coverImageUrl = String(list?.cover_image_url || list?.preview_image_url || "").trim();
  const coverSeed = useMemo(() => `${list?.id || ""}-${listTitle}`, [list?.id, listTitle]);
  const fallbackGradient = useMemo(() => makeFallbackGradient(coverSeed), [coverSeed]);

  const isGradientCover =
    coverImageUrl.startsWith("linear-gradient") || coverImageUrl.startsWith("radial-gradient");
  const isImageCover =
    !!coverImageUrl && !isGradientCover && !coverImageUrl.startsWith("data:");
  const coverBackground = isGradientCover ? coverImageUrl || fallbackGradient : fallbackGradient;
  const badgeLabel = getTrendingBadge(list);
  const canSave = typeof onSave === "function";

  const visualLayer = (
    <div
      className={`trendingListCardMedia ${coverLoaded ? "isLoaded" : ""}`}
      style={{ backgroundImage: coverBackground }}
      aria-hidden="true"
    >
      {isImageCover ? (
        <img
          src={coverImageUrl}
          alt=""
          loading="lazy"
          onLoad={() => setCoverLoaded(true)}
          onError={() => setCoverLoaded(true)}
        />
      ) : null}
      <div className="trendingListCardShade" />
      <span className="trendingListCardBadge">{badgeLabel}</span>
    </div>
  );

  const overlayCopy = (
    <>
      <div className="trendingListCardOverlay">
        <div className="trendingListCardTitle" title={listTitle}>
          {listTitle}
        </div>
        <div className="trendingListCardCreatorRow">
          <span className="trendingListCardCreatorAvatar" aria-hidden="true">
            {ownerAvatarUrl ? (
              <img src={ownerAvatarUrl} alt="" />
            ) : (
              <span>{ownerDisplayName.charAt(0).toUpperCase()}</span>
            )}
          </span>
          <span className="trendingListCardCreatorHandle">{ownerDisplayName}</span>
        </div>
        <div className="trendingListCardMeta">Saved · {formatSaveCount(list?.save_count)}</div>
      </div>
    </>
  );

  const actionLayer = canSave ? (
    <div className="trendingListCardActionsOverlay">
      <button
        className={`trendingListCardSaveBtn ${isSaved ? "isSaved" : ""}`}
        type="button"
        onClick={onSave}
        disabled={isSaving}
        aria-label={isSaved ? "Unsave collection" : "Save collection"}
      >
        <img src={isSaved ? saveFilledIcon : saveIcon} alt="" aria-hidden="true" />
      </button>
    </div>
  ) : null;

  if (to && !canSave) {
    return (
      <Link className="collectionCard trendingListCard" to={to} state={{ fromExplore: true }} aria-label={listTitle}>
        <span className="trendingListCardMain">
          {visualLayer}
          {overlayCopy}
        </span>
      </Link>
    );
  }

  if (to) {
    return (
      <article className="collectionCard trendingListCard withActions" aria-label={listTitle}>
        <Link className="trendingListCardMain" to={to} state={{ fromExplore: true }} aria-label={listTitle}>
          {visualLayer}
          {overlayCopy}
        </Link>
        {actionLayer}
      </article>
    );
  }

  return (
    <article className="collectionCard trendingListCard withActions" aria-label={listTitle}>
      <span className="trendingListCardMain">
        {visualLayer}
        {overlayCopy}
      </span>
      {actionLayer}
    </article>
  );
}
