import { useEffect, useMemo, useRef, useState } from "react";
import {
  claimProfileHandle,
  publishCollection,
  saveCollectionPublishDetails,
} from "../lib/publishedCollections";
import { supabase } from "../lib/supabaseClient";
import { slugify } from "../lib/social";

function normalizeVisibility(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "public" || normalized === "unlisted" || normalized === "private") {
    return normalized;
  }
  return "private";
}

function makeCoverGradient(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const colors = ["#0f172a", "#1e293b", "#0b3b5e", "#1f2a44", "#2b3655", "#0f3d3e"];
  const pick = (offset) => colors[Math.abs(hash + offset) % colors.length];
  return `linear-gradient(135deg, ${pick(0)} 0%, ${pick(2)} 50%, ${pick(4)} 100%)`;
}

function domainFromUrl(url = "") {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeRankItem(item = {}, index = 0) {
  const url = String(item.url || item.airbnbUrl || "").trim();
  const title = String(item.title || "").trim() || domainFromUrl(url) || "Saved link";
  const note = String(item.note || "").trim();
  const domain = String(item.domain || "").trim() || domainFromUrl(url);
  const imageUrl = String(item.imageUrl || item.image_url || "").trim();
  return {
    id: String(item.id || `row-${index}`),
    title,
    note,
    domain,
    url,
    imageUrl,
  };
}

function areOrdersEqual(left = [], right = []) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function IconDragDots(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <circle cx="9" cy="6" r="1.5" fill="currentColor" />
      <circle cx="15" cy="6" r="1.5" fill="currentColor" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <circle cx="9" cy="18" r="1.5" fill="currentColor" />
      <circle cx="15" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconCamera(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M5 8h3l1.2-2h5.6L16 8h3v10H5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconToggleCheck(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M5 12.5l4.2 4.2L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PublishCollectionModal({
  open,
  trip,
  viewerUserId,
  initialHandle = "",
  onHandleUpdated,
  onPublished,
  onClose,
}) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverInputOpen, setCoverInputOpen] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState("");
  const [publishToProfile, setPublishToProfile] = useState(true);
  const [isRanked, setIsRanked] = useState(false);
  const [rankedSize, setRankedSize] = useState(5);
  const [rankItems, setRankItems] = useState([]);

  const [dragItemId, setDragItemId] = useState("");
  const [dragOverItemId, setDragOverItemId] = useState("");

  const [editingItemId, setEditingItemId] = useState("");
  const [editingItemTitle, setEditingItemTitle] = useState("");
  const [editingItemNote, setEditingItemNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [profileHandle, setProfileHandle] = useState("");
  const [showHandleClaim, setShowHandleClaim] = useState(false);
  const [handleInput, setHandleInput] = useState("");
  const [handleError, setHandleError] = useState("");
  const [savingHandle, setSavingHandle] = useState(false);

  const initialOrderRef = useRef([]);
  const initialItemContentRef = useRef(new Map());
  const coverUrlInputRef = useRef(null);
  const coverFileInputRef = useRef(null);
  const [isMobilePublishView, setIsMobilePublishView] = useState(false);

  useEffect(() => {
    setProfileHandle(String(initialHandle || "").trim().replace(/^@+/, ""));
  }, [initialHandle]);

  useEffect(() => {
    if (!open || !trip) return;

    setErrorMsg("");
    setShowHandleClaim(false);
    setHandleError("");
    setSaving(false);
    setSavingHandle(false);
    setCoverInputOpen(false);
    setUploadingCover(false);
    setCoverUploadError("");

    setTitle(String(trip.name || "").trim());
    setSubtitle(String(trip.subtitle || "").trim());
    setCoverImageUrl(String(trip.coverImageUrl || "").trim());

    const normalizedVisibility = normalizeVisibility(trip.visibility || "private");
    if (normalizedVisibility === "private") {
      setPublishToProfile(true);
    } else {
      setPublishToProfile(normalizedVisibility === "public");
    }
    setIsRanked(!!trip.isRanked);
    setRankedSize(Number(trip.rankedSize) === 10 ? 10 : 5);

    const normalizedItems = (Array.isArray(trip.items) ? trip.items : []).map(normalizeRankItem);
    setRankItems(normalizedItems);
    initialOrderRef.current = normalizedItems.map((item) => item.id);
    initialItemContentRef.current = new Map(
      normalizedItems.map((item) => [
        item.id,
        {
          title: item.title,
          note: item.note,
        },
      ])
    );

    setEditingItemId("");
    setEditingItemTitle("");
    setEditingItemNote("");

    setHandleInput(String(initialHandle || "").trim().replace(/^@+/, ""));
  }, [open, trip, initialHandle]);

  useEffect(() => {
    if (!coverInputOpen) return;
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => coverUrlInputRef.current?.focus());
  }, [coverInputOpen]);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;

    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyLeft = body.style.left;
    const previousBodyRight = body.style.right;
    const previousBodyWidth = body.style.width;
    const previousHtmlOverflow = html.style.overflow;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    html.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.left = previousBodyLeft;
      body.style.right = previousBodyRight;
      body.style.width = previousBodyWidth;
      html.style.overflow = previousHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 768px)");
    const sync = () => setIsMobilePublishView(media.matches);
    sync();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  const coverSeed = useMemo(() => `${trip?.id || ""}-${title || trip?.name || ""}`, [trip?.id, title, trip?.name]);
  const fallbackGradient = useMemo(() => makeCoverGradient(coverSeed), [coverSeed]);
  const effectiveCover = String(coverImageUrl || trip?.coverImageUrl || "").trim();
  const isGradientCover =
    effectiveCover.startsWith("linear-gradient") || effectiveCover.startsWith("radial-gradient");
  const isImageCover = !!effectiveCover && !isGradientCover && !effectiveCover.startsWith("data:");
  const coverStyle = { backgroundImage: isGradientCover ? effectiveCover : fallbackGradient };

  if (!open || !trip) return null;

  const visibility = publishToProfile ? "public" : "unlisted";
  const needsHandle = visibility !== "private" && !profileHandle;
  const sharePath =
    profileHandle && slugify(trip.publicSlug || title || trip.name || "")
      ? `/@${profileHandle}/${slugify(trip.publicSlug || title || trip.name || "")}`
      : "";

  function reorderItems(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setRankItems((prev) => {
      const sourceIndex = prev.findIndex((item) => item.id === sourceId);
      const targetIndex = prev.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const next = prev.slice();
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function handleDragStart(event, itemId) {
    setDragItemId(itemId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
  }

  function handleDragOver(event, itemId) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (itemId !== dragOverItemId) {
      setDragOverItemId(itemId);
    }
  }

  function handleDrop(event, itemId) {
    event.preventDefault();
    const sourceId = dragItemId || event.dataTransfer.getData("text/plain");
    reorderItems(sourceId, itemId);
    setDragItemId("");
    setDragOverItemId("");
  }

  function beginEditItem(item) {
    setEditingItemId(item.id);
    setEditingItemTitle(item.title || "");
    setEditingItemNote(item.note || "");
  }

  function cancelEditItem() {
    setEditingItemId("");
    setEditingItemTitle("");
    setEditingItemNote("");
  }

  function saveEditItem() {
    if (!editingItemId) return;
    setRankItems((prev) =>
      prev.map((item) =>
        item.id === editingItemId
          ? {
              ...item,
              title: String(editingItemTitle || "").trim() || item.title,
              note: String(editingItemNote || "").trim(),
            }
          : item
      )
    );
    cancelEditItem();
  }

  async function handleClaimAndContinue() {
    if (!viewerUserId || savingHandle) return;
    setSavingHandle(true);
    setHandleError("");
    const result = await claimProfileHandle({ viewerUserId, handleInput });
    if (!result.ok) {
      setHandleError(result.message || "Could not save handle.");
      setSavingHandle(false);
      return;
    }
    setProfileHandle(result.handle);
    setHandleInput(result.handle);
    if (typeof onHandleUpdated === "function") {
      onHandleUpdated(result.handle);
    }
    setShowHandleClaim(false);
    setSavingHandle(false);
    await handlePublish(result.handle);
  }

  async function persistRankAndItemEdits() {
    const orderedItemIds = rankItems.map((item) => item.id).filter(Boolean);
    const hasOrderChanges = !areOrdersEqual(initialOrderRef.current, orderedItemIds);

    const itemUpdates = rankItems
      .map((item) => {
        const initial = initialItemContentRef.current.get(item.id);
        if (!initial) return null;
        const nextTitle = String(item.title || "").trim();
        const nextNote = String(item.note || "").trim();
        const initialTitle = String(initial.title || "").trim();
        const initialNote = String(initial.note || "").trim();
        if (nextTitle === initialTitle && nextNote === initialNote) return null;
        return {
          id: item.id,
          title: nextTitle,
          note: nextNote,
        };
      })
      .filter(Boolean);

    if (!hasOrderChanges && itemUpdates.length === 0) {
      return { ok: true, message: "", error: null };
    }

    return saveCollectionPublishDetails({
      viewerUserId,
      tripId: trip.id,
      orderedItemIds,
      itemUpdates,
    });
  }

  async function handlePublish(handleOverride = "") {
    if (!viewerUserId || !trip?.id || saving || uploadingCover) return;

    const nextTitle = String(title || "").trim();
    if (!nextTitle) {
      setErrorMsg("Title is required.");
      return;
    }

    const nextHandle = String(handleOverride || profileHandle || "").trim();
    if (visibility !== "private" && !nextHandle) {
      setShowHandleClaim(true);
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const saveDetailsResult = await persistRankAndItemEdits();
    if (!saveDetailsResult.ok) {
      setSaving(false);
      setErrorMsg(saveDetailsResult.message || "Could not save link ranking right now.");
      return;
    }

    const result = await publishCollection({
      viewerUserId,
      tripId: trip.id,
      title: nextTitle,
      subtitle,
      visibility,
      isRanked,
      rankedSize: isRanked ? rankedSize : null,
      requestedSlug: trip.publicSlug || nextTitle,
      coverImageUrl: coverImageUrl || "",
    });

    setSaving(false);
    if (!result.ok) {
      setErrorMsg(result.message || "Could not save publish settings.");
      return;
    }

    if (typeof onPublished === "function") {
      onPublished(result.collection, nextHandle, rankItems);
    }
  }

  function handleChooseCoverFile() {
    if (saving || savingHandle || uploadingCover) return;
    setCoverUploadError("");
    coverFileInputRef.current?.click();
  }

  async function handleCoverFileChange(event) {
    const file = event.target.files?.[0];
    if (!file || !viewerUserId) return;

    if (!file.type || !file.type.startsWith("image/")) {
      setCoverUploadError("Please choose an image file.");
      if (coverFileInputRef.current) coverFileInputRef.current.value = "";
      return;
    }

    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      setCoverUploadError("Image is too large. Max size is 8MB.");
      if (coverFileInputRef.current) coverFileInputRef.current.value = "";
      return;
    }

    setUploadingCover(true);
    setCoverUploadError("");

    const rawExt = String(file.name || "").split(".").pop() || "";
    const safeExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const filePath = `${viewerUserId}/covers/${trip?.id || "draft"}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${safeExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, {
        upsert: false,
        contentType: file.type || "image/jpeg",
        cacheControl: "3600",
      });

    if (uploadError) {
      setCoverUploadError("Could not upload image right now.");
      setUploadingCover(false);
      if (coverFileInputRef.current) coverFileInputRef.current.value = "";
      return;
    }

    const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const publicUrl = publicData?.publicUrl || "";
    if (!publicUrl) {
      setCoverUploadError("Could not read uploaded image URL.");
      setUploadingCover(false);
      if (coverFileInputRef.current) coverFileInputRef.current.value = "";
      return;
    }

    setCoverImageUrl(`${publicUrl}?v=${Date.now()}`);
    setCoverInputOpen(false);
    setUploadingCover(false);
    if (coverFileInputRef.current) coverFileInputRef.current.value = "";
  }

  const publishFormBody = (
    <div className="publishStepBody publishSingleBody">
      <div className="fieldGroup">
        <div className="fieldLabel publishFieldLabel">Cover Image</div>
        <div className="publishCoverPreview" style={coverStyle}>
          {isImageCover ? <img src={effectiveCover} alt="Collection cover" /> : null}
          <button
            className="publishCoverHitArea"
            type="button"
            onClick={handleChooseCoverFile}
            aria-label={uploadingCover ? "Uploading cover image" : "Upload cover image"}
            disabled={saving || savingHandle || uploadingCover}
          >
            <span className={`publishCoverHover ${uploadingCover ? "isOpen" : ""}`}>
              <IconCamera className="publishCoverHoverIcon" />
              {uploadingCover ? "Uploading..." : "Change cover"}
            </span>
          </button>
          <input
            ref={coverFileInputRef}
            type="file"
            accept="image/*"
            className="publishCoverFileInput"
            onChange={handleCoverFileChange}
            disabled={saving || savingHandle || uploadingCover}
          />
        </div>

        <div className="publishCoverHelpers">
          <button
            className="miniBtn publishCoverOptionBtn"
            type="button"
            onClick={() => setCoverInputOpen((prev) => !prev)}
            disabled={saving || savingHandle || uploadingCover}
          >
            {coverInputOpen ? "Hide URL option" : "Use image URL instead"}
          </button>
          {coverUploadError ? <div className="fieldError">{coverUploadError}</div> : null}
        </div>

        {coverInputOpen ? (
          <div className="publishCoverInputRow">
            <input
              ref={coverUrlInputRef}
              className="input"
              value={coverImageUrl}
              onChange={(event) => setCoverImageUrl(event.target.value)}
              placeholder="Paste image URL"
              disabled={saving || savingHandle || uploadingCover}
            />
            <button
              className="miniBtn"
              type="button"
              onClick={() => {
                const nextFromItem = rankItems.find((item) => item.imageUrl)?.imageUrl || "";
                if (nextFromItem) {
                  setCoverImageUrl(nextFromItem);
                }
              }}
              disabled={saving || savingHandle || uploadingCover}
            >
              Use top link image
            </button>
          </div>
        ) : null}
      </div>

      <div className="fieldGroup">
        <div className="fieldLabel publishFieldLabel">Title</div>
        <input
          className="input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          placeholder="Enter collection title..."
          disabled={saving || savingHandle}
        />
      </div>

      <div className="fieldGroup">
        <div className="fieldLabel publishFieldLabel">Description</div>
        <input
          className="input"
          value={subtitle}
          onChange={(event) => setSubtitle(event.target.value)}
          maxLength={120}
          placeholder="Add an optional description..."
          disabled={saving || savingHandle}
        />
      </div>

      <div className="fieldGroup">
        <div className="fieldLabel publishRankLabel">Rank Links</div>
        <div className="fieldHelp">Drag to reorder links before publishing</div>

        {rankItems.length === 0 ? (
          <div className="publishRankEmpty">No links in this collection yet.</div>
        ) : (
          <div className="publishRankList" role="list" aria-label="Rank links before publish">
            {rankItems.map((item) => {
              const domainText = item.domain || domainFromUrl(item.url);
              const isEditing = editingItemId === item.id;
              return (
                <div
                  key={item.id}
                  className={`publishRankRow ${dragItemId === item.id ? "isDragSource" : ""} ${
                    dragOverItemId === item.id && dragItemId !== item.id ? "isDragOver" : ""
                  }`}
                  onDragOver={(event) => handleDragOver(event, item.id)}
                  onDrop={(event) => handleDrop(event, item.id)}
                >
                  <button
                    className="iconBtn bare quickActionBtn publishDragBtn"
                    type="button"
                    draggable
                    onDragStart={(event) => handleDragStart(event, item.id)}
                    onDragEnd={() => {
                      setDragItemId("");
                      setDragOverItemId("");
                    }}
                    aria-label="Drag to reorder"
                    title="Drag to reorder"
                  >
                    <IconDragDots className="quickActionIcon" />
                  </button>

                  <div className="publishRankMain">
                    <div className="publishRankTitleRow">
                      <div className="publishRankTitle" title={item.title}>
                        {item.title}
                      </div>
                      <button
                        className="miniBtn publishRowEditBtn"
                        type="button"
                        onClick={() => beginEditItem(item)}
                        disabled={saving || savingHandle}
                      >
                        Edit
                      </button>
                    </div>
                    <div className="publishRankMeta">{item.note || domainText || item.url || "Saved link"}</div>

                    {isEditing ? (
                      <div className="publishItemEditor">
                        <input
                          className="input"
                          value={editingItemTitle}
                          onChange={(event) => setEditingItemTitle(event.target.value)}
                          placeholder="Link title"
                        />
                        <input
                          className="input"
                          value={editingItemNote}
                          onChange={(event) => setEditingItemNote(event.target.value)}
                          placeholder="Optional note"
                        />
                        <div className="publishItemEditorActions">
                          <button className="miniBtn" type="button" onClick={cancelEditItem}>
                            Cancel
                          </button>
                          <button className="miniBtn blue" type="button" onClick={saveEditItem}>
                            Save
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <label className="publishProfileToggle" htmlFor="publishToProfileToggle">
        <span className="publishProfileSwitch" aria-hidden="true">
          <input
            id="publishToProfileToggle"
            type="checkbox"
            checked={publishToProfile}
            onChange={(event) => setPublishToProfile(event.target.checked)}
            disabled={saving || savingHandle}
          />
          <span className="publishProfileSlider">
            <IconToggleCheck className="publishProfileCheck" />
          </span>
        </span>
        <span>Add collection to profile</span>
      </label>

      {sharePath ? <div className="fieldHelp">URL preview: {sharePath}</div> : null}
    </div>
  );

  const handleClaimBody = showHandleClaim ? (
    <div className="publishHandleClaim">
      <div className="listTitle">Claim your handle to publish</div>
      <div className="fieldHelp">Public links use /@handle/slug.</div>
      <div className="publishHandleClaimRow">
        <input
          className="input"
          value={handleInput}
          onChange={(event) => setHandleInput(event.target.value.replace(/^@+/, "").toLowerCase())}
          placeholder="your_handle"
          disabled={savingHandle}
        />
        <button className="miniBtn blue" type="button" onClick={handleClaimAndContinue} disabled={savingHandle}>
          {savingHandle ? "Saving..." : "Save handle"}
        </button>
      </div>
      {handleError ? <div className="warning">{handleError}</div> : null}
    </div>
  ) : null;

  const warningBody = (
    <>
      {needsHandle && !showHandleClaim ? (
        <div className="warning">You need a profile handle before publishing.</div>
      ) : null}
      {errorMsg ? <div className="warning">{errorMsg}</div> : null}
    </>
  );

  const actionRow = (
    <div className="shareModalActions publishActions publishSingleActions">
      <button className="miniBtn" type="button" onClick={onClose} disabled={saving || savingHandle || uploadingCover}>
        Cancel
      </button>
      <button className="miniBtn blue publishActionBtn" type="button" onClick={() => handlePublish()} disabled={saving || savingHandle || uploadingCover}>
        {saving ? "Publishing..." : "Publish"}
      </button>
    </div>
  );

  if (isMobilePublishView) {
    return (
      <div className="publishMobileOverlay" role="dialog" aria-modal="true" onClick={onClose}>
        <div className="publishMobileModal" onClick={(event) => event.stopPropagation()}>
          <div className="publishMobileHeader">
            <div className="publishMobileTitle">Publish Collection</div>
            <button className="shareModalClose" type="button" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="publishMobileBody">
            {publishFormBody}
            {handleClaimBody}
            {warningBody}
          </div>
          <div className="publishMobileFooter">{actionRow}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="shareOverlay publishOverlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="shareModal publishModal" onClick={(event) => event.stopPropagation()}>
        <div className="shareModalHeader publishModalHeader">
          <div>
            <div className="shareModalTitle publishModalTitle">Publish Collection</div>
          </div>
          <button className="shareModalClose" type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {publishFormBody}

        {handleClaimBody}

        {warningBody}

        {actionRow}
      </div>
    </div>
  );
}
