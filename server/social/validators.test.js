import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHandle,
  parseBearerToken,
  validateHandle,
  validateListVisibility,
  validateRankedConfig,
  validateSection,
  validateSlug,
} from "./validators.js";
import { ValidationError } from "./errors.js";

test("validateHandle: lowercase 3-24, underscore allowed", () => {
  assert.equal(normalizeHandle("@Fergus"), "fergus");
  assert.equal(validateHandle("abc"), "abc");
  assert.equal(validateHandle("a_bc"), "a_bc");
  assert.equal(validateHandle("ABC"), "abc");
  assert.throws(() => validateHandle("ab"), ValidationError);
  assert.throws(() => validateHandle("a-bc"), ValidationError);
});

test("validateSlug: kebab-case", () => {
  assert.equal(validateSlug("top-10-nyc"), "top-10-nyc");
  assert.equal(validateSlug("Top-10-NYC"), "top-10-nyc");
  assert.throws(() => validateSlug("bad_slug"), ValidationError);
  assert.throws(() => validateSlug("bad--slug"), ValidationError);
});

test("validateSection defaults and validates", () => {
  assert.equal(validateSection(""), "general");
  assert.equal(validateSection("travel"), "travel");
  assert.throws(() => validateSection("food"), ValidationError);
});

test("validateListVisibility defaults and validates", () => {
  assert.equal(validateListVisibility(""), "private");
  assert.equal(validateListVisibility("public"), "public");
  assert.throws(() => validateListVisibility("friends"), ValidationError);
});

test("validateRankedConfig enforces top 5/10", () => {
  assert.deepEqual(validateRankedConfig({ isRanked: false, rankedSize: null }), {
    is_ranked: false,
    ranked_size: null,
  });
  assert.deepEqual(validateRankedConfig({ isRanked: true, rankedSize: 5 }), {
    is_ranked: true,
    ranked_size: 5,
  });
  assert.throws(() => validateRankedConfig({ isRanked: true, rankedSize: 7 }), ValidationError);
  assert.throws(
    () => validateRankedConfig({ isRanked: false, rankedSize: 5 }),
    ValidationError
  );
});

test("parseBearerToken extracts token", () => {
  assert.equal(parseBearerToken(""), "");
  assert.equal(parseBearerToken("Bearer abc.def"), "abc.def");
  assert.equal(parseBearerToken("bearer   token"), "token");
});
