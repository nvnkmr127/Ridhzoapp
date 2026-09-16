// Runs once on server startup. Importing a module with a top-level `new Worker(...)` (or calling
// a worker factory) is what actually starts the BullMQ consumer — a queue on its own has no
// consumer. Everything registered here was previously enqueuing jobs that nothing processed.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Fail fast on a misconfigured environment before anything touches the DB or signs a JWT.
  const { validateEnv } = await import("@/lib/env");
  validateEnv();

  // Event listeners + automation dispatch (lead.created, lead.assigned, status changes …).
  await import("@/lib/events/handlers");

  // Background workers need a real Redis AND an always-on process. Two independent things:
  //   • ENQUEUE (queue.add) — the web app always needs REDIS_URL so it can push jobs.
  //   • RUN workers in-process — only valid on a long-lived host, never on Vercel serverless
  //     (workers get frozen/killed between invocations, schedulers re-register on every cold start).
  // So: on Vercel, REDIS_URL is set (to enqueue) but workers run in the standalone src/worker.ts
  // process on the droplet, not here. Locally / on a single always-on Node server, run them in-process.
  // A boot-time hiccup must not crash the web server.
  if (!process.env.VERCEL) {
    try {
      const { startWorkers } = await import("@/lib/jobs/startWorkers");
      await startWorkers();
    } catch (err) {
      console.error("[instrumentation] failed to start background workers:", err);
    }
  }

  // Note: the outbound-webhook delivery worker (webhookRetryWorker) IS started, but only via
  // startWorkers() above — i.e. on the droplet worker / a single always-on Node server, never in the
  // Vercel web process. The web tier only ENQUEUES (WebhookEndpointService.dispatch); the droplet
  // drains the queue and POSTs the deliveries.
}

// Next.js 15 Observability hook: centrally captures unhandled server exceptions, Server Action errors,
// and route errors for structured production logging without leaking secrets.
export async function onRequestError(
  err: { digest?: string } & Error,
  request: {
    path: string;
    method: string;
    headers: { [key: string]: string };
  },
  context: {
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "middleware";
    renderSource?: "react-server-components" | "server-rendering";
  }
) {
  console.error(`[Server Exception] ${request.method || "UNKNOWN"} ${request.path || ""} (${context.routeType}):`, {
    message: err?.message,
    digest: err?.digest,
    routePath: context?.routePath,
  });
}
