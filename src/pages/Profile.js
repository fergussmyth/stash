import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { useTrips } from "../hooks/useTrips";
import AppShell from "../components/AppShell";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import stashLogo from "../assets/icons/stash-favicon.png";
import userIcon from "../assets/icons/user.png";

export default function Profile() {
  const { user, loading, softLogout, clearRememberedProfile } = useAuth();
  const { trips, renameTrip, deleteTrip } = useTrips();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [sharedTrips, setSharedTrips] = useState([]);
  const [sharedCopyMsg, setSharedCopyMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [initialDisplayName, setInitialDisplayName] = useState("");
  const [showTokens, setShowTokens] = useState(false);
  const [tokens, setTokens] = useState([]);
  const [tokenStatus, setTokenStatus] = useState("");
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedToken, setGeneratedToken] = useState(null);
  const [tokenCopyMsg, setTokenCopyMsg] = useState("");
  const [showRevokedTokens, setShowRevokedTokens] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [shareMenuOpenId, setShareMenuOpenId] = useState("");
  const [copiedTripId, setCopiedTripId] = useState("");
  const [editingSharedTripId, setEditingSharedTripId] = useState("");
  const [editingSharedTripName, setEditingSharedTripName] = useState("");
  const [cropSrc, setCropSrc] = useState("");
  const [cropZoom, setCropZoom] = useState(1);
  const [cropMinZoom, setCropMinZoom] = useState(0.2);
  const [cropMaxZoom, setCropMaxZoom] = useState(4);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropNatural, setCropNatural] = useState({ w: 0, h: 0 });
  const [isCropping, setIsCropping] = useState(false);
  const cropImgRef = useRef(null);
  const dragStateRef = useRef(null);
  const cropFrameRef = useRef(null);
  const [cropFrameSize, setCropFrameSize] = useState(240);
  const outputSize = 512;
  const rememberMeEnabled =
    typeof window !== "undefined" && window.localStorage.getItem("stashRememberMe") === "true";

  function makeShareId(length = 12) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < length; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    let mounted = true;
    async function loadProfile() {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .single();
      if (!mounted) return;
      const name = data?.display_name || "";
      setDisplayName(name);
      setInitialDisplayName(name);
      setAvatarUrl(data?.avatar_url || "");
    }
    async function loadSharedTrips() {
      const { data } = await supabase
        .from("trips")
        .select("id,name,share_id,is_shared,trip_items(count)")
        .eq("owner_id", user.id)
        .eq("is_shared", true)
        .order("created_at", { ascending: false });
      if (!mounted) return;
      setSharedTrips(data || []);
    }
    loadProfile();
    loadSharedTrips();
    return () => {
      mounted = false;
    };
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!isCropping) return;
    const measure = () => {
      if (!cropFrameRef.current) return;
      const rect = cropFrameRef.current.getBoundingClientRect();
      if (rect.width) {
        setCropFrameSize(rect.width);
        if (cropNatural.w && cropNatural.h) {
          setCropMinZoom(0.2);
          setCropMaxZoom(4);
          setCropZoom((prev) => {
            const nextZoom = Math.max(0.2, prev);
            setCropOffset((prevOffset) => clampCropOffset(prevOffset, nextZoom));
            return nextZoom;
          });
        }
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isCropping, cropNatural.w, cropNatural.h]);

  useEffect(() => {
    function handleDocumentClick(event) {
      const target = event.target;
      if (target && target.closest(".profileCollectionMenuWrap")) return;
      setShareMenuOpenId("");
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setStatus("");
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: displayName || null });
    setSaving(false);
    if (error) {
      setStatus("Could not save right now.");
      return;
    }
    setStatus("Saved.");
    if (rememberMeEnabled && typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem("stashRememberedProfile");
        const remembered = raw ? JSON.parse(raw) : null;
        if (remembered) {
          const updated = { ...remembered, name: displayName || remembered.name };
          window.localStorage.setItem("stashRememberedProfile", JSON.stringify(updated));
        }
      } catch (err) {
        // ignore invalid remembered profile payload
      }
    }
    setTimeout(() => setStatus(""), 1500);
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(String(reader.result || ""));
      setCropZoom(1);
      setCropMinZoom(0.2);
      setCropMaxZoom(4);
      setCropOffset({ x: 0, y: 0 });
      setCropNatural({ w: 0, h: 0 });
      setIsCropping(true);
      setShowAvatarMenu(false);
    };
    reader.readAsDataURL(file);
  }

  function clampCropOffset(nextOffset, zoomValue = cropZoom) {
    const { w, h } = cropNatural;
    if (!w || !h) return nextOffset;
    const scale = zoomValue;
    const maxX = Math.max(0, Math.abs(w * scale - cropFrameSize) / 2);
    const maxY = Math.max(0, Math.abs(h * scale - cropFrameSize) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nextOffset.x)),
      y: Math.max(-maxY, Math.min(maxY, nextOffset.y)),
    };
  }

  async function handleCropSave() {
    if (!user || !cropSrc || !cropImgRef.current) return;
    setUploadingAvatar(true);
    setToastMsg("");
    try {
      const { w, h } = cropNatural;
      const scale = cropZoom;
      const scaledW = w * scale;
      const scaledH = h * scale;
      const centerX = cropFrameSize / 2 + cropOffset.x;
      const centerY = cropFrameSize / 2 + cropOffset.y;
      const imgLeft = centerX - scaledW / 2;
      const imgTop = centerY - scaledH / 2;

      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.imageSmoothingQuality = "high";
      const outScale = outputSize / cropFrameSize;
      const coverScale = Math.max(outputSize / w, outputSize / h);
      const coverW = w * coverScale;
      const coverH = h * coverScale;
      ctx.filter = "blur(14px)";
      ctx.drawImage(
        cropImgRef.current,
        (outputSize - coverW) / 2,
        (outputSize - coverH) / 2,
        coverW,
        coverH
      );
      ctx.filter = "none";
      ctx.drawImage(
        cropImgRef.current,
        imgLeft * outScale,
        imgTop * outScale,
        scaledW * outScale,
        scaledH * outScale
      );

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png", 0.92)
      );
      if (!blob) throw new Error("Could not process image");

      const filePath = `${user.id}/${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, blob, {
          upsert: true,
          contentType: "image/png",
          cacheControl: "3600",
        });
      if (uploadError) {
        setToastMsg("Could not upload photo.");
        return;
      }

      const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = publicData?.publicUrl;
      if (!publicUrl) {
        setToastMsg("Could not fetch photo URL.");
        return;
      }
      const versionedUrl = `${publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: versionedUrl })
        .eq("id", user.id);
      if (updateError) {
        setToastMsg("Could not save photo.");
        return;
      }

      setAvatarUrl(versionedUrl);
      if (rememberMeEnabled && typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem("stashRememberedProfile");
          const remembered = raw ? JSON.parse(raw) : null;
          if (remembered) {
            const updated = { ...remembered, avatar_url: versionedUrl };
            window.localStorage.setItem("stashRememberedProfile", JSON.stringify(updated));
          }
        } catch (err) {
          // ignore invalid remembered profile payload
        }
      }
      setToastMsg("Photo updated");
      setTimeout(() => setToastMsg(""), 1500);
      setIsCropping(false);
      setCropSrc("");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveAvatar() {
    if (!user) return;
    setUploadingAvatar(true);
    setToastMsg("");

    try {
      if (avatarUrl) {
        const marker = "/storage/v1/object/public/avatars/";
        const idx = avatarUrl.indexOf(marker);
        if (idx !== -1) {
          const path = avatarUrl.slice(idx + marker.length);
          if (path) {
            await supabase.storage.from("avatars").remove([path]);
          }
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);

      if (error) {
        setToastMsg("Could not remove photo.");
        return;
      }

      setAvatarUrl("");
      setToastMsg("Photo removed");
      setTimeout(() => setToastMsg(""), 1500);
    } finally {
      setUploadingAvatar(false);
      setShowAvatarMenu(false);
    }
  }

  async function handleCopyShare(trip) {
    const rawShareBase = process.env.REACT_APP_SHARE_ORIGIN || window.location.origin;
    const shareBase = rawShareBase.replace(/\/+$/, "");
    const shareUrl = `${shareBase}/share/${trip.share_id}`;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      setSharedCopyMsg("Copied link");
      setToastMsg("Copied");
      setCopiedTripId(trip.id);
      setTimeout(() => setSharedCopyMsg(""), 1500);
      setTimeout(() => setToastMsg(""), 1500);
      setTimeout(() => setCopiedTripId(""), 1500);
    }
  }

  async function handleUnshareShare(trip) {
    const { error } = await supabase
      .from("trips")
      .update({ is_shared: false, share_id: null })
      .eq("id", trip.id)
      .eq("owner_id", user.id);
    if (error) {
      setStatus("Could not revoke share.");
      return;
    }
    setSharedTrips((prev) => prev.filter((t) => t.id !== trip.id));
    setToastMsg("Share revoked");
    setTimeout(() => setToastMsg(""), 1500);
  }

  async function handleRenameShareSave(trip) {
    const trimmed = (editingSharedTripName || "").trim();
    if (!trimmed) return;
    await renameTrip(trip.id, trimmed);
    setSharedTrips((prev) =>
      prev.map((t) => (t.id === trip.id ? { ...t, name: trimmed } : t))
    );
    setEditingSharedTripId("");
    setEditingSharedTripName("");
    setToastMsg("Renamed");
    setTimeout(() => setToastMsg(""), 1500);
  }

  function handleRenameShareCancel() {
    setEditingSharedTripId("");
    setEditingSharedTripName("");
  }

  async function handleDeleteShare(trip) {
    const confirmed = window.confirm(
      "Delete this collection? This permanently removes it and its links."
    );
    if (!confirmed) return;
    await deleteTrip(trip.id);
    setSharedTrips((prev) => prev.filter((t) => t.id !== trip.id));
    setToastMsg("Deleted");
    setTimeout(() => setToastMsg(""), 1500);
  }

  async function handleRegenerateShare(trip) {
    const nextShareId = makeShareId(12);
    const { error } = await supabase
      .from("trips")
      .update({ is_shared: true, share_id: nextShareId })
      .eq("id", trip.id)
      .eq("owner_id", user.id);
    if (error) {
      setStatus("Could not regenerate link.");
      return;
    }
    setSharedTrips((prev) =>
      prev.map((t) => (t.id === trip.id ? { ...t, share_id: nextShareId, is_shared: true } : t))
    );
    setToastMsg("Link regenerated");
    setTimeout(() => setToastMsg(""), 1500);
  }

  function handleOpenTrip(trip) {
    navigate(`/trips/${trip.id}`);
  }

  useEffect(() => {
    if (!showTokens || !user) return;
    async function loadTokens() {
      setLoadingTokens(true);
      const { data, error } = await supabase
        .from("extension_tokens")
        .select("id, token_prefix, created_at, last_used_at, revoked_at")
        .order("created_at", { ascending: false });
      if (error) {
        setTokenStatus("Could not load tokens.");
        setLoadingTokens(false);
        return;
      }
      setTokens(data || []);
      setLoadingTokens(false);
    }
    loadTokens();
  }, [showTokens, user]);

  async function handleGenerateToken() {
    setGenerating(true);
    setTokenStatus("");
    setGeneratedToken(null);

    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "";
    if (!supabaseUrl) {
      setTokenStatus("Missing Supabase URL env var.");
      setGenerating(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      setTokenStatus("You need to sign in again.");
      setGenerating(false);
      return;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/token-create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      setTokenStatus("Could not create token.");
      setGenerating(false);
      return;
    }

    const payload = await response.json();
    if (!payload?.token) {
      setTokenStatus("Token response missing.");
      setGenerating(false);
      return;
    }

    setGeneratedToken(payload);
    setGenerating(false);
    setShowTokens(true);
    setTokenStatus("This is the only time you will see this token. Copy it now.");
  }

  async function handleCopyToken(token) {
    if (!navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(token);
    setTokenCopyMsg("Copied token");
    setTimeout(() => setTokenCopyMsg(""), 1500);
  }

  async function handleRevokeToken(tokenId) {
    const { error } = await supabase
      .from("extension_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", tokenId);
    if (error) {
      setTokenStatus("Could not revoke token.");
      return;
    }
    setTokens((prev) => prev.map((t) => (t.id === tokenId ? { ...t, revoked_at: true } : t)));
  }

  const isDisplayNameDirty = displayName.trim() !== initialDisplayName.trim();
  const visibleTokens = useMemo(() => {
    if (showRevokedTokens) return tokens;
    return tokens.filter((token) => !token.revoked_at);
  }, [showRevokedTokens, tokens]);

  const categoryCounts = useMemo(
    () =>
      ["general", "travel", "fashion"].reduce((acc, category) => {
        acc[category] = trips.filter((trip) => (trip.type || "general") === category).length;
        return acc;
      }, {}),
    [trips]
  );

  if (loading) {
    return (
      <div className="page profilePage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
        <AppShell
          sidebar={
            <SidebarNav
              brandIcon={
                <img className="sidebarBrandIcon" src={stashLogo} alt="" aria-hidden="true" />
              }
              activeSection={null}
              categoryCounts={categoryCounts}
              onSelectSection={(category) => {
                navigate(`/trips?category=${category}`);
                setSidebarOpen(false);
              }}
              onNavigate={() => setSidebarOpen(false)}
            />
          }
          topbar={
            <TopBar
              title="Profile"
              subtitle="Manage your account and shared collections."
              searchValue=""
              onSearchChange={() => {}}
              onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
              actions={
                user ? (
                  <Link className="topbarIconBtn" to="/profile" aria-label="Profile">
                    <img className="topbarAvatar" src={userIcon} alt="" aria-hidden="true" />
                  </Link>
                ) : null
              }
            />
          }
          isSidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        >
          <div className="panel p-5">
            <p className="muted">Loading profile...</p>
          </div>
        </AppShell>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="page profilePage collectionsShell min-h-screen app-bg text-[rgb(var(--text))]">
      <AppShell
        sidebar={
          <SidebarNav
            brandIcon={
              <img className="sidebarBrandIcon" src={stashLogo} alt="" aria-hidden="true" />
            }
            activeSection={null}
            categoryCounts={categoryCounts}
            onSelectSection={(category) => {
              navigate(`/trips?category=${category}`);
              setSidebarOpen(false);
            }}
            onNavigate={() => setSidebarOpen(false)}
          />
        }
        topbar={
          <TopBar
            title="Profile"
            subtitle="Manage your account and shared collections."
            searchValue=""
            onSearchChange={() => {}}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            actions={
              user ? (
                <Link className="topbarIconBtn" to="/profile" aria-label="Profile">
                  <img className="topbarAvatar" src={userIcon} alt="" aria-hidden="true" />
                </Link>
              ) : null
            }
          />
        }
        isSidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      >
        {toastMsg && <div className="toast">{toastMsg}</div>}
        <div className="panel p-5 profileContainer">
          <section className="profileEditBlock">
            <div className="profileEditTitle">Edit profile</div>
            <div className="profileEditCard">
              <div className="profileEditIdentity">
                <button
                  type="button"
                  className="profileEditAvatar"
                  onClick={() => setShowAvatarMenu(true)}
                  aria-label="Change profile photo"
                >
                  <img
                    src={avatarUrl || userIcon}
                    className={avatarUrl ? "profileAvatarPhoto" : "profileAvatarPlaceholder"}
                    alt=""
                    aria-hidden="true"
                  />
                </button>
                <div className="profileEditName">
                  {displayName || user.email}
                </div>
              </div>
              <button
                className="profileEditAction"
                type="button"
                onClick={() => setShowAvatarMenu(true)}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? "Uploading..." : "Change photo"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="visuallyHidden"
              />
            </div>

            {showAvatarMenu && (
              <div
                className="profilePhotoOverlay"
                role="dialog"
                aria-modal="true"
                onClick={() => setShowAvatarMenu(false)}
              >
                <div
                  className="profilePhotoModal"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="profilePhotoTitle">Change profile photo</div>
                  <button
                    className="profilePhotoAction"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload photo
                  </button>
                  {avatarUrl && (
                    <button
                      className="profilePhotoAction danger"
                      type="button"
                      onClick={handleRemoveAvatar}
                    >
                      Remove current photo
                    </button>
                  )}
                  <button
                    className="profilePhotoAction"
                    type="button"
                    onClick={() => setShowAvatarMenu(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isCropping && (
              <div
                className="profilePhotoOverlay"
                role="dialog"
                aria-modal="true"
                onClick={() => setIsCropping(false)}
              >
                <div
                  className="profileCropModal"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="profilePhotoTitle">Crop your photo</div>
                  <div
                    className="profileCropFrame"
                    ref={cropFrameRef}
                    onPointerDown={(event) => {
                      if (!cropSrc) return;
                      event.preventDefault();
                      dragStateRef.current = {
                        startX: event.clientX,
                        startY: event.clientY,
                        startOffset: { ...cropOffset },
                      };
                    }}
                    onPointerMove={(event) => {
                      if (!dragStateRef.current) return;
                      event.preventDefault();
                      const { startX, startY, startOffset } = dragStateRef.current;
                      const nextOffset = {
                        x: startOffset.x + (event.clientX - startX),
                        y: startOffset.y + (event.clientY - startY),
                      };
                      setCropOffset(clampCropOffset(nextOffset));
                    }}
                    onPointerUp={() => {
                      dragStateRef.current = null;
                    }}
                    onPointerLeave={() => {
                      dragStateRef.current = null;
                    }}
                  >
                    {cropSrc && (
                      <>
                        <img
                          className="profileCropBg"
                          src={cropSrc}
                          alt=""
                          aria-hidden="true"
                        />
                        <img
                          ref={cropImgRef}
                          className="profileCropImage"
                          src={cropSrc}
                          alt=""
                          onLoad={(event) => {
                            const { naturalWidth, naturalHeight } = event.target;
                            const nextNatural = { w: naturalWidth, h: naturalHeight };
                            setCropNatural(nextNatural);
                          setCropMinZoom(0.2);
                          setCropMaxZoom(4);
                          setCropZoom(1);
                          setCropOffset({ x: 0, y: 0 });
                          }}
                          style={{
                            transform: (() => {
                              const { w, h } = cropNatural;
                              if (!w || !h) return "translate(-50%, -50%) scale(1)";
                              const scale = cropZoom;
                              return `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${scale})`;
                            })(),
                          }}
                        />
                      </>
                    )}
                    <div className="profileCropMask" aria-hidden="true" />
                    <div className="profileCropSafeRing" aria-hidden="true" />
                  </div>
                  <div className="profileCropHint">Move and zoom to fit</div>
                  <div className="profileCropControls">
                    <input
                      className="profileCropSlider"
                      type="range"
                      min={cropMinZoom}
                      max={cropMaxZoom}
                      step="0.01"
                      value={cropZoom}
                      onChange={(event) => {
                        const nextZoom = Number(event.target.value);
                        setCropZoom(nextZoom);
                        setCropOffset((prev) => clampCropOffset(prev, nextZoom));
                      }}
                    />
                    <div className="profileCropActions">
                      <button
                        className="profilePhotoAction"
                        type="button"
                        onClick={() => {
                          setIsCropping(false);
                          setCropSrc("");
                        }}
                        disabled={uploadingAvatar}
                      >
                        Cancel
                      </button>
                      <button
                        className="profilePhotoAction primary"
                        type="button"
                        onClick={handleCropSave}
                        disabled={uploadingAvatar}
                      >
                        {uploadingAvatar ? "Saving..." : "Save photo"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="profileBlock">
            <div className="profileBlockTitle">Identity</div>
            <div className="profileSection">
              <div className="profileLabel">Email</div>
              <div className="profileValue mutedValue">{user.email}</div>
            </div>

            <div className="profileSection">
              <div className="profileLabel">Display name</div>
              <form
                className="profileRow profileDisplayRow"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSave();
                }}
              >
                <input
                  className="input displayInput profileDisplayInput"
                  placeholder="Add a display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
                <button
                  className={`profilePrimaryBtn ${isDisplayNameDirty ? "isActive" : ""}`}
                  type="submit"
                  disabled={saving || !isDisplayNameDirty}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </form>
              {status && <div className="savedMsg">{status}</div>}
            </div>
          </section>

          <div className="profileSectionDivider" />

          <section className="profileBlock">
            <div className="profileBlockTitle">Browser integration</div>
            <div className="profileInlineNote">
              Generate and revoke tokens to sync your browser extension.
            </div>
            <button
              className={`tokenDisclosureToggle ${showTokens ? "isOpen" : ""}`}
              type="button"
              onClick={() => setShowTokens((prev) => !prev)}
              aria-expanded={showTokens}
            >
              <span className="tokenDisclosureChevron" aria-hidden="true" />
              Manage browser extension tokens
            </button>
            <div className={`tokenDisclosure ${showTokens ? "isOpen" : ""}`}>
              <div className="tokenInlineSection">
                {tokenStatus && <div className="tokenNotice">{tokenStatus}</div>}
                {tokenCopyMsg && <div className="profileToast">{tokenCopyMsg}</div>}
                {generatedToken?.token && (
                  <div className="tokenRevealInline">
                    <div className="tokenValue">{generatedToken.token}</div>
                    <button
                      className="miniBtn blue"
                      type="button"
                      onClick={() => handleCopyToken(generatedToken.token)}
                    >
                      Copy
                    </button>
                  </div>
                )}
                <div className="tokenListInline">
                  {loadingTokens ? (
                    <div className="muted">Loading tokens...</div>
                  ) : visibleTokens.length === 0 ? (
                    <div className="muted">No active extension tokens found.</div>
                  ) : (
                    visibleTokens.map((token) => (
                      <div
                        key={token.id}
                        className={`tokenRowInline ${token.revoked_at ? "isRevoked" : ""}`}
                      >
                        <div className="tokenMetaInline">
                          <div className="tokenPrefix">Prefix: {token.token_prefix}</div>
                          <div className="tokenDatesInline">
                            Created {new Date(token.created_at).toLocaleDateString()}
                            {token.last_used_at
                              ? ` • Last used ${new Date(token.last_used_at).toLocaleDateString()}`
                              : ""}
                          </div>
                        </div>
                        <button
                          className="tokenRevokeLink"
                          type="button"
                          onClick={() => handleRevokeToken(token.id)}
                          disabled={!!token.revoked_at}
                          title="Revoke token"
                        >
                          {token.revoked_at ? "Revoked" : "Revoke"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
                {tokens.some((token) => token.revoked_at) && (
                  <button
                    className="tokenRevokedToggle"
                    type="button"
                    onClick={() => setShowRevokedTokens((prev) => !prev)}
                  >
                    {showRevokedTokens ? "Hide revoked tokens" : "Show revoked tokens"}
                  </button>
                )}
                <button
                  className="tokenGenerateBtn"
                  type="button"
                  onClick={handleGenerateToken}
                  disabled={generating}
                >
                  {generating ? "Generating..." : "Generate new token"}
                </button>
              </div>
            </div>
          </section>

          <section className="profileBlock">
            <div className="profileLabelRow">
              <div className="profileLabel">My shared collections</div>
              {sharedCopyMsg && <div className="profileToast">{sharedCopyMsg}</div>}
            </div>
            {sharedTrips.length === 0 ? (
              <div className="sharedEmptyState">
                <div className="sharedEmptyTitle">No shared collections yet</div>
                <div className="sharedEmptyText">
                  Share a collection to let others browse your links without editing anything.
                </div>
                <div className="sharedEmptyText">
                  You control what’s shared and can unshare anytime.
                </div>
                <button
                  className="sharedEmptyCta"
                  type="button"
                  onClick={() => navigate("/trips")}
                >
                  Share a collection
                </button>
              </div>
            ) : (
              <div className="profileTripList">
                {sharedTrips.map((trip) => (
                  <div
                    key={trip.id}
                    className="profileTripRow collection-card clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (editingSharedTripId === trip.id) return;
                      handleOpenTrip(trip);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (editingSharedTripId === trip.id) return;
                        handleOpenTrip(trip);
                      }
                    }}
                  >
                    {editingSharedTripId === trip.id ? (
                      <div className="tripRenameRow">
                        <input
                          className="input tripRenameInput"
                          value={editingSharedTripName}
                          onChange={(event) => setEditingSharedTripName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleRenameShareSave(trip);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              handleRenameShareCancel();
                            }
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                        <div className="tripRenameActions" onClick={(event) => event.stopPropagation()}>
                          <button
                            className="tripRenameIcon save"
                            type="button"
                            onClick={() => handleRenameShareSave(trip)}
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
                            onClick={handleRenameShareCancel}
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
                    ) : (
                      <>
                        <div className="card-info">
                          <h3 className="card-title">{trip.name}</h3>
                          <span className="card-subtitle">
                            {(trip.trip_items?.[0]?.count || 0)} links
                          </span>
                        </div>
                        <div className="card-actions">
                          <button
                            className={`btn-copy ${copiedTripId === trip.id ? "isCopied" : ""}`}
                            type="button"
                            aria-label="Copy link"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCopyShare(trip);
                            }}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <path
                                d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7L12.5 19.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            {copiedTripId === trip.id ? "Copied" : "Copy"}
                          </button>
                          <div
                            className="profileCollectionMenuWrap"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              className="btn-more"
                              type="button"
                              aria-label="More options"
                              onClick={() =>
                                setShareMenuOpenId((prev) => (prev === trip.id ? "" : trip.id))
                              }
                            >
                              ⋮
                            </button>
                            {shareMenuOpenId === trip.id && (
                              <div className="collectionMenu" role="menu">
                                <button
                                  className="collectionMenuItem"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setEditingSharedTripId(trip.id);
                                    setEditingSharedTripName(trip.name || "");
                                    setShareMenuOpenId("");
                                  }}
                                >
                                  Rename
                                </button>
                                <button
                                  className="collectionMenuItem danger"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleUnshareShare(trip);
                                    setShareMenuOpenId("");
                                  }}
                                >
                                  Unshare
                                </button>
                                <button
                                  className="collectionMenuItem danger"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDeleteShare(trip);
                                    setShareMenuOpenId("");
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                          <span className="card-chevron" aria-hidden="true">
                            <svg viewBox="0 0 24 24" focusable="false">
                              <path
                                d="M9 6l6 6-6 6"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="profileBlock profileBlockLast">
            <div className="profileBlockTitle">Account management</div>
            {confirmSignOut ? (
              <div className="signOutConfirm">
                <div>Sign out of this device?</div>
                <div className="signOutActions">
                  <button
                    className="profileDangerBtn"
                    type="button"
                    onClick={() => {
                      if (rememberMeEnabled) {
                        softLogout();
                        navigate("/", { replace: true });
                        setConfirmSignOut(false);
                        return;
                      }
                      clearRememberedProfile();
                      supabase.auth.signOut();
                    }}
                  >
                    Sign out
                  </button>
                  {rememberMeEnabled && (
                    <button
                      className="miniBtn danger"
                      type="button"
                      onClick={() => {
                        clearRememberedProfile();
                        supabase.auth.signOut();
                        navigate("/", { replace: true });
                        setConfirmSignOut(false);
                      }}
                    >
                      Forget this device
                    </button>
                  )}
                  <button
                    className="miniBtn"
                    type="button"
                    onClick={() => setConfirmSignOut(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="profileDangerBtn"
                type="button"
                onClick={() => setConfirmSignOut(true)}
              >
                Sign out
              </button>
            )}
          </section>
        </div>
      </AppShell>
    </div>
  );
}
