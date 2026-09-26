import { after } from "next/server";

// Work that runs on after the response — event handlers (automations, activity notes), push and email,
// lead scoring. The web app runs on Vercel, which may freeze or end a function as soon as it has
// responded, so an un-awaited promise there can silently never finish: an automation that never fires,
// a push that never goes. after() keeps the invocation alive until the work settles.
// Outside a request (the worker process, scripts, tests) after() throws; those processes are long-lived,
// so letting the promise run is enough. Failures are logged, never unhandled.
export function keepAlive(work: Promise<unknown> | unknown, label = "background task"): void {
  const settled = Promise.resolve(work).catch((e) => console.error(`[keepAlive] ${label} failed:`, e));
  try {
    after(() => settled);
  } catch {
    // Not inside a request scope.
  }
}
