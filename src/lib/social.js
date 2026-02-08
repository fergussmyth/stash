const SECTION_OPTIONS = ["general", "travel", "fashion"];
const LIST_VISIBILITY_OPTIONS = ["private", "unlisted", "public"];
const PROFILE_VISIBILITY_OPTIONS = ["public", "private"];

export function normalizeSection(input = "") {
  const normalized = String(input || "").trim().toLowerCase();
  if (SECTION_OPTIONS.includes(normalized)) return normalized;
  return "general";
}

export function normalizeListVisibility(input = "") {
  const normalized = String(input || "").trim().toLowerCase();
  if (LIST_VISIBILITY_OPTIONS.includes(normalized)) return normalized;
  return "private";
}

export function normalizeProfileVisibility(input = "") {
  const normalized = String(input || "").trim().toLowerCase();
  if (PROFILE_VISIBILITY_OPTIONS.includes(normalized)) return normalized;
  return "public";
}

export function normalizeHandle(input = "") {
  return String(input || "").trim().replace(/^@+/, "").toLowerCase();
}

export function isValidHandle(input = "") {
  const handle = normalizeHandle(input);
  if (handle.length < 3 || handle.length > 24) return false;
  return /^[a-z0-9_]{3,24}$/.test(handle);
}

export function slugify(input = "", { maxLength = 60 } = {}) {
  const raw = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!raw) return "";
  if (raw.length <= maxLength) return raw;

  const clipped = raw.slice(0, maxLength).replace(/-+$/g, "");
  return clipped;
}
