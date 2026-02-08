import test from "node:test";
import assert from "node:assert/strict";
import { createSocialService } from "./service.js";
import { AuthError, NotFoundError, ValidationError } from "./errors.js";

function makeRestStub(overrides = {}) {
  const calls = [];
  const rest = {
    calls,
    select: async (...args) => {
      calls.push({ method: "select", args });
      return [];
    },
    selectOne: async (...args) => {
      calls.push({ method: "selectOne", args });
      return null;
    },
    insert: async (...args) => {
      calls.push({ method: "insert", args });
      return [];
    },
    update: async (...args) => {
      calls.push({ method: "update", args });
      return [];
    },
    remove: async (...args) => {
      calls.push({ method: "remove", args });
      return [];
    },
    rpc: async (...args) => {
      calls.push({ method: "rpc", args });
      return null;
    },
    ...overrides,
  };
  return rest;
}

test("getProfileByHandle maps profile row", async () => {
  const rest = makeRestStub({
    selectOne: async (table) => {
      if (table !== "profiles") return null;
      return {
        id: "00000000-0000-4000-8000-000000000000",
        handle: "fergus",
        display_name: "Fergus",
        bio: "Hello",
        avatar_url: "https://example.com/a.png",
        is_public: true,
        created_at: "2026-02-08T00:00:00Z",
        updated_at: "2026-02-08T00:00:00Z",
      };
    },
  });
  const social = createSocialService(rest);
  const profile = await social.getProfileByHandle("@fergus");
  assert.equal(profile.user_id, "00000000-0000-4000-8000-000000000000");
  assert.equal(profile.handle, "fergus");
});

test("getProfileByHandle rejects invalid handle", async () => {
  const social = createSocialService(makeRestStub());
  await assert.rejects(() => social.getProfileByHandle("A-B"), ValidationError);
});

test("getListByHandleAndSlug fetches list + items", async () => {
  const rest = makeRestStub({
    selectOne: async (table, options) => {
      if (table === "profiles") return { id: "00000000-0000-4000-8000-000000000001" };
      if (table === "lists") {
        assert.equal(options.filters.slug, "eq.top-10");
        return {
          id: "00000000-0000-4000-8000-000000000002",
          owner_user_id: "00000000-0000-4000-8000-000000000001",
          section: "travel",
          title: "Top 10",
          subtitle: null,
          slug: "top-10",
          cover_image_url: null,
          visibility: "unlisted",
          is_ranked: true,
          ranked_size: 10,
          pinned_order: null,
          save_count: 0,
          view_count: 0,
          last_saved_at: null,
          last_viewed_at: null,
          created_at: "2026-02-08T00:00:00Z",
          updated_at: "2026-02-08T00:00:00Z",
        };
      }
      return null;
    },
    select: async (table) => {
      if (table !== "list_items") return [];
      return [
        {
          id: "00000000-0000-4000-8000-000000000003",
          list_id: "00000000-0000-4000-8000-000000000002",
          item_id: null,
          url: "https://example.com",
          title_snapshot: "Example",
          image_snapshot: null,
          domain_snapshot: "example.com",
          price_snapshot: null,
          rating_snapshot: 4.7,
          meta_json: {},
          rank_index: 1,
          note: null,
          created_at: "2026-02-08T00:00:00Z",
        },
      ];
    },
  });

  const social = createSocialService(rest);
  const result = await social.getListByHandleAndSlug("fergus", "top-10");
  assert.equal(result.list.slug, "top-10");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].rank_index, 1);
});

test("followUser requires auth", async () => {
  const social = createSocialService(makeRestStub());
  await assert.rejects(() => social.followUser({ userId: "00000000-0000-4000-8000-000000000000" }), AuthError);
});

test("followUser follows by handle", async () => {
  const rest = makeRestStub({
    selectOne: async (table) => {
      if (table === "profiles") {
        return {
          id: "00000000-0000-4000-8000-000000000000",
          handle: "someone",
          is_public: true,
        };
      }
      return null;
    },
    insert: async (table, values) => {
      assert.equal(table, "follows");
      assert.equal(values.following_user_id, "00000000-0000-4000-8000-000000000000");
      return [];
    },
  });
  const social = createSocialService(rest);
  const result = await social.followUser({ handle: "someone" }, { authToken: "token" });
  assert.equal(result.ok, true);
});

test("saveList calls list_saves insert", async () => {
  const rest = makeRestStub({
    insert: async (table, values) => {
      assert.equal(table, "list_saves");
      assert.equal(values.list_id, "00000000-0000-4000-8000-000000000010");
      return [];
    },
  });
  const social = createSocialService(rest);
  const result = await social.saveList(
    { listId: "00000000-0000-4000-8000-000000000010" },
    { authToken: "token" }
  );
  assert.equal(result.ok, true);
});

test("reorderListItems calls rpc", async () => {
  const rest = makeRestStub({
    rpc: async (fnName, args) => {
      assert.equal(fnName, "reorder_list_items");
      assert.equal(args.list_id, "00000000-0000-4000-8000-000000000020");
      assert.deepEqual(args.item_ids, [
        "00000000-0000-4000-8000-000000000021",
        "00000000-0000-4000-8000-000000000022",
      ]);
      return null;
    },
  });
  const social = createSocialService(rest);
  const result = await social.reorderListItems(
    "00000000-0000-4000-8000-000000000020",
    [
      "00000000-0000-4000-8000-000000000021",
      "00000000-0000-4000-8000-000000000022",
    ],
    { authToken: "token" }
  );
  assert.equal(result.ok, true);
});

test("updateList throws NotFound when no row returns", async () => {
  const rest = makeRestStub({ update: async () => [] });
  const social = createSocialService(rest);
  await assert.rejects(
    () => social.updateList("00000000-0000-4000-8000-000000000030", { title: "x" }, { authToken: "token" }),
    NotFoundError
  );
});

