export class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class SupabaseRestError extends Error {
  constructor(status, payload) {
    super(payload?.message || `Supabase REST error (${status})`);
    this.name = "SupabaseRestError";
    this.status = status;
    this.payload = payload;
  }
}

