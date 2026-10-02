import type { NextConfig } from "next";

// Node-only packages that must never be bundled/traced by webpack (breaks with
// "Can't resolve 'http'/'pg'" and bullmq's broken ESM randomUUID export). Externalizing
// them makes the server emit a plain require() at runtime — including in the
// `instrumentation.ts` layer, which serverExternalPackages does not reach in Next 15.0.
const NODE_ONLY = ["bullmq", "ioredis", "web-push", "postgres", "mysql2", "pg", "https-proxy-agent", "agent-base", "resend", "nodemailer"];

// Baseline browser hardening. Hosted forms and booking pages are meant to be embedded, so they're exempt
// from the frame restriction (later rule wins for those paths).
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // allow-popups keeps Google/Facebook sign-in popups working while still isolating the app's browsing context.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

// Content-Security-Policy in REPORT-ONLY mode: violations show in the browser console (and any report
// endpoint you add) without blocking anything. Review them on a staging deploy, tighten, then switch the
// header name to Content-Security-Policy to enforce. ('unsafe-inline' is required by Next's inline bootstrap
// scripts until nonces are wired in; the policy still blocks foreign script hosts, plugins and <base> hijacks.)
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://connect.facebook.net https://www.googletagmanager.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https:",
  "frame-src https://challenges.cloudflare.com https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // WordPress permalinks end in "/". Without this Next 308-redirects /blog/post/ -> /blog/post and WP
  // redirects it back, looping forever.
  skipTrailingSlashRedirect: true,

  async headers() {
    return [
      {
        source: "/((?!f/|book/|blog).*)",
        headers: [...SECURITY_HEADERS, { key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }, { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY }],
      },
      { source: "/(f|book|blog)/:path*", headers: SECURITY_HEADERS },
    ];
  },

  // WordPress blog lives on its own PHP host; proxy it under /blog so the public URL stays ridhzo.com/blog.
  // Set WORDPRESS_ORIGIN (e.g. https://wp-origin.ridhzo.com) in Vercel env; unset = no proxy.
  async rewrites() {
    const origin = process.env.WORDPRESS_ORIGIN;
    if (!origin) return [];
    return [
      { source: "/blog", destination: `${origin}/blog/` },
      { source: "/blog/:path*", destination: `${origin}/blog/:path*` },
    ];
  },

  // Style-lint (unused vars, unescaped entities) shouldn't fail the production build.
  // TypeScript type-checking stays on — that's the real correctness gate. Run `next lint` in CI.
  eslint: { ignoreDuringBuilds: true },

  serverExternalPackages: NODE_ONLY,
  
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },

  webpack: (config, { isServer, nextRuntime }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@valkey/valkey-glide": false,
    };
    // The Edge compile of middleware.ts + instrumentation.ts follows the (Node-only) worker/
    // producer/db/mailer chunks even though register() returns early on Edge and middleware never
    // touches them. They're never executed on Edge, so stub them out of the Edge bundle.
    if (nextRuntime === "edge") {
      // Node builtins: unresolvable on Edge → resolve.fallback is the right lever.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false, stream: false, http: false, https: false, net: false, tls: false,
        dns: false, fs: false, "fs/promises": false, child_process: false, path: false, os: false,
      };
      // INSTALLED npm packages resolve fine, so resolve.fallback never fires for them — they must
      // be aliased to false to be dropped from the Edge bundle (this is what fixes the Vercel
      // "Edge Function references unsupported modules: nodemailer, bullmq, web-push, resend,
      // postgres, ioredis" error). `postgres` (postgres-js) is the driver; `pg` is bullmq's
      // optional transport.
      config.resolve.alias = {
        ...config.resolve.alias,
        bullmq: false, ioredis: false, postgres: false, pg: false, "web-push": false,
        resend: false, "@react-email/render": false, nodemailer: false,
      };
    }
    // NODE-SERVER ONLY (not Edge): externalize Node-only packages as runtime require()s.
    // This MUST exclude the Edge compile — edge is isServer:true too, and webpack evaluates
    // externals BEFORE resolve.alias, so without the `else` these requires would win over the
    // `false` aliases above and reappear as "Edge Function references unsupported modules".
    if (isServer && nextRuntime !== "edge") {
      const externals = config.externals || [];
      config.externals = [
        ...(Array.isArray(externals) ? externals : [externals]),
        ({ request }: { request?: string }, cb: (err?: unknown, result?: string) => void) =>
          request && NODE_ONLY.includes(request) ? cb(undefined, `commonjs ${request}`) : cb(),
      ];
    } else if (!isServer) {
      // These server-only libs must never resolve in a client/fallback bundle. Stub them so
      // bullmq's optional pg transport + node builtins don't emit "can't resolve" warnings.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        pg: false, http: false, https: false, net: false, tls: false, dns: false,
        fs: false, "fs/promises": false, child_process: false, path: false, os: false, bullmq: false, ioredis: false, "web-push": false,
      };
    }
    return config;
  },
};

export default nextConfig;
