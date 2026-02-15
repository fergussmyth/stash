import { AuthError, ValidationError } from "./errors.js";

const SECTION_OPTIONS = ["general", "travel", "fashion"];
const LIST_VISIBILITY_OPTIONS = ["private", "unlisted", "public"];

export function normalizeHandle(input = "") {
  return String(input || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

export function validateHandle(input) {
  const handle = normalizeHandle(input);
  if (!handle) throw new ValidationError("Handle is required.", { field: "handle" });
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
    throw new ValidationError(
      "Handle must be 3–24 chars: lowercase letters, numbers, underscore.",
      { field: "handle" }
    );
  }
  return handle;
}

export function validateSlug(input) {
  const slug = String(input || "").trim().toLowerCase();
  if (!slug) throw new ValidationError("Slug is required.", { field: "slug" });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ValidationError("Slug must be kebab-case.", { field: "slug" });
  }
  return slug;
}

export function validateSection(input) {
  const section = String(input || "").trim().toLowerCase();
  if (!section) return "general";
  if (!SECTION_OPTIONS.includes(section)) {
    throw new ValidationError("Invalid section.", { field: "section" });
  }
  return section;
}

export function validateListVisibility(input) {
  const visibility = String(input || "").trim().toLowerCase();
  if (!visibility) return "private";
  if (!LIST_VISIBILITY_OPTIONS.includes(visibility)) {
    throw new ValidationError("Invalid visibility.", { field: "visibility" });
  }
  return visibility;
}

export function requireAuthToken(authToken) {
  if (!authToken) throw new AuthError();
  return authToken;
}

export function validateRankedConfig({ isRanked, rankedSize }) {
  const normalizedIsRanked = !!isRanked;
  const normalizedRankedSize =
    rankedSize == null || rankedSize === "" ? null : Number(rankedSize);

  if (!normalizedIsRanked) {
    if (normalizedRankedSize != null) {
      throw new ValidationError("ranked_size must be null when is_ranked is false.", {
        field: "ranked_size",
      });
    }
    return { is_ranked: false, ranked_size: null };
  }

  if (normalizedRankedSize == null || !Number.isFinite(normalizedRankedSize)) {
    throw new ValidationError("ranked_size is required for ranked lists.", {
      field: "ranked_size",
    });
  }

  const sizeInt = Math.trunc(normalizedRankedSize);
  if (![5, 10].includes(sizeInt)) {
    throw new ValidationError("ranked_size must be 5 or 10.", { field: "ranked_size" });
  }

  return { is_ranked: true, ranked_size: sizeInt };
}

export function parseBearerToken(authHeader = "") {
  const raw = String(authHeader || "").trim();
  if (!raw) return "";
  const match = raw.match(/^bearer\s+(.+)$/i);
  return (match?.[1] || "").trim();
}

