import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/_index.tsx"),
  // better-auth HTTP handler (Google OAuth redirect, callback, sign-out, etc.)
  route("/api/auth/*", "routes/api-auth.tsx"),
  route("/login", "routes/login.tsx"),
  route("/logout", "routes/logout.tsx"),
] satisfies RouteConfig
