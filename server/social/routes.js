import express from "express";
import { createSupabaseRestClient } from "./supabaseRest.js";
import { getSupabaseConfig } from "./config.js";
import { createSocialService } from "./service.js";
import {
  AuthError,
  NotFoundError,
  SupabaseRestError,
  ValidationError,
} from "./errors.js";
import { parseBearerToken } from "./validators.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

export function createSocialRouter() {
  const router = express.Router();
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

  if (!supabaseUrl || !supabaseAnonKey) {
    router.use((_req, res) =>
      jsonError(
        res,
        500,
        "Server missing SUPABASE_URL / SUPABASE_ANON_KEY (or REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY)."
      )
    );
    return router;
  }

  const rest = createSupabaseRestClient({ supabaseUrl, supabaseAnonKey });
  const social = createSocialService(rest);

  const withAuthToken = (req) => ({
    authToken: parseBearerToken(
      req.headers.authorization || req.headers.Authorization || ""
    ),
  });

  router.get("/profiles/:handle", async (req, res) => {
    try {
      const profile = await social.getProfileByHandle(req.params.handle, withAuthToken(req));
      if (!profile) return jsonError(res, 404, "Profile not found.");
      return res.json({ profile });
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.get("/profiles/:handle/lists", async (req, res) => {
    try {
      const lists = await social.getPublicListsByUser(
        { handle: req.params.handle },
        withAuthToken(req)
      );
      return res.json({ lists });
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.get("/profiles/:handle/lists/:slug", async (req, res) => {
    try {
      const result = await social.getListByHandleAndSlug(
        req.params.handle,
        req.params.slug,
        withAuthToken(req)
      );
      if (!result) return jsonError(res, 404, "List not found.");
      return res.json(result);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.post("/follow", async (req, res) => {
    try {
      const auth = withAuthToken(req);
      if (!auth.authToken) throw new AuthError();
      const payload = req.body || {};
      const result = await social.followUser(
        { handle: payload.handle, userId: payload.user_id || payload.userId },
        auth
      );
      return res.json(result);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.post("/unfollow", async (req, res) => {
    try {
      const auth = withAuthToken(req);
      if (!auth.authToken) throw new AuthError();
      const payload = req.body || {};
      const result = await social.unfollowUser(
        { userId: payload.user_id || payload.userId },
        auth
      );
      return res.json(result);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.post("/save", async (req, res) => {
    try {
      const auth = withAuthToken(req);
      if (!auth.authToken) throw new AuthError();
      const payload = req.body || {};
      const result = await social.saveList({ listId: payload.list_id || payload.listId }, auth);
      return res.json(result);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.post("/unsave", async (req, res) => {
    try {
      const auth = withAuthToken(req);
      if (!auth.authToken) throw new AuthError();
      const payload = req.body || {};
      const result = await social.unsaveList(
        { listId: payload.list_id || payload.listId },
        auth
      );
      return res.json(result);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.post("/lists", async (req, res) => {
    try {
      const auth = withAuthToken(req);
      if (!auth.authToken) throw new AuthError();
      const list = await social.createList(req.body || {}, auth);
      return res.json({ list });
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.patch("/lists/:id", async (req, res) => {
    try {
      const auth = withAuthToken(req);
      if (!auth.authToken) throw new AuthError();
      const list = await social.updateList(req.params.id, req.body || {}, auth);
      return res.json({ list });
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.delete("/lists/:id", async (req, res) => {
    try {
      const auth = withAuthToken(req);
      if (!auth.authToken) throw new AuthError();
      const result = await social.deleteList(req.params.id, auth);
      return res.json(result);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.post("/lists/:id/items", async (req, res) => {
    try {
      const auth = withAuthToken(req);
      if (!auth.authToken) throw new AuthError();
      const item = await social.addListItem(req.params.id, req.body || {}, auth);
      return res.json({ item });
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.patch("/list-items/:id", async (req, res) => {
    try {
      const auth = withAuthToken(req);
      if (!auth.authToken) throw new AuthError();
      const item = await social.updateListItem(req.params.id, req.body || {}, auth);
      return res.json({ item });
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.post("/lists/:id/items/reorder", async (req, res) => {
    try {
      const auth = withAuthToken(req);
      if (!auth.authToken) throw new AuthError();
      const payload = req.body || {};
      const result = await social.reorderListItems(
        req.params.id,
        payload.item_ids || payload.itemIds || [],
        auth
      );
      return res.json(result);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.delete("/list-items/:id", async (req, res) => {
    try {
      const auth = withAuthToken(req);
      if (!auth.authToken) throw new AuthError();
      const result = await social.removeListItem(req.params.id, auth);
      return res.json(result);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  router.post("/lists/:id/views", async (req, res) => {
    try {
      const payload = req.body || {};
      const auth = withAuthToken(req);
      const result = await social.recordListView(
        { listId: req.params.id, referrer: payload.referrer || null },
        auth
      );
      return res.json(result);
    } catch (error) {
      return handleRouteError(res, error);
    }
  });

  return router;
}

function handleRouteError(res, error) {
  if (error instanceof ValidationError) {
    return jsonError(res, 400, error.message, error.details ? { details: error.details } : {});
  }
  if (error instanceof AuthError) {
    return jsonError(res, 401, error.message);
  }
  if (error instanceof NotFoundError) {
    return jsonError(res, 404, error.message);
  }
  if (error instanceof SupabaseRestError) {
    const status = [400, 401, 403, 404, 409].includes(error.status) ? error.status : 500;
    return jsonError(res, status, error.payload?.message || "Request failed.", {
      supabase_status: error.status,
    });
  }
  // eslint-disable-next-line no-console
  console.error("Social route error:", error);
  return jsonError(res, 500, "Server error.");
}

