import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/_index.tsx"),
  // better-auth HTTP handler (Google OAuth redirect, callback, sign-out, etc.)
  route("/api/auth/*", "routes/api-auth.tsx"),
  route("/login", "routes/login.tsx"),
  route("/logout", "routes/logout.tsx"),

  // Content ingestion
  route("/ingest", "routes/ingest.tsx"),
  route("/ingest/:sessionId", "routes/ingest.$sessionId.tsx"),
  route("/api/ingest/:sessionId/status", "routes/api.ingest.$sessionId.status.ts"),
  route("/api/ingest/:sessionId/commit", "routes/api.ingest.$sessionId.commit.ts"),
  route("/api/ingest/:sessionId/regenerate", "routes/api.ingest.$sessionId.regenerate.ts"),

  // Google Drive OAuth
  route("/api/google-drive/auth", "routes/api.google-drive.auth.ts"),
  route("/api/google-drive/callback", "routes/api.google-drive.callback.ts"),
] satisfies RouteConfig
