import { fileURLToPath } from "node:url";

const f = (name) => fileURLToPath(new URL("./routes/" + name, import.meta.url));

export const ROUTES = [
  { pattern: "/api/login", file: f("login.js") },
  { pattern: "/api/logout", file: f("logout.js") },
  { pattern: "/api/me", file: f("me.js") },
  { pattern: "/api/password", file: f("password.js") },
  { pattern: "/api/users", file: f("users.js") },
  { pattern: "/api/content", file: f("content.js") },
  { pattern: "/api/page", file: f("page.js") },
  { pattern: "/api/pages", file: f("pages.js") },
  { pattern: "/api/preview", file: f("preview.js") },
  { pattern: "/api/versions", file: f("versions.js") },
  { pattern: "/api/upload", file: f("upload.js") },
  { pattern: "/api/media", file: f("media.js") },
  { pattern: "/api/links", file: f("links.js") },
  { pattern: "/api/inquiries", file: f("inquiries.js") },
  { pattern: "/api/inquiry", file: f("inquiry.js") },
  { pattern: "/api/stats", file: f("stats.js") },
  { pattern: "/api/track", file: f("track.js") },
  { pattern: "/api/admin/rag-ask", file: f("rag-ask.js") },
  { pattern: "/media/[...path]", file: f("media-file.js") },
];
