// "Install the app" support (Android Chrome fires `beforeinstallprompt`; we keep it for our own button).
// Listens from the moment this module loads, because the event can fire before React has mounted.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "/classicsolitaire";
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

/**
 * A new service worker is installed and waiting; `workerVersion` is what it answered to GET_VERSION (null: no answer,
 * e.g. a worker from before 0.1.7). Pages are network-first, so the page often already runs the waiting worker's
 * version, and a plain reload never activates a waiting worker while the old one controls the tab: then the worker
 * takes over quietly ("activate"), there is nothing to reload. Otherwise the reload button is offered ("offer").
 */
export function waitingWorkerAction(appVersion: string, workerVersion: string | null): "activate" | "offer" {
  return workerVersion !== null && workerVersion === appVersion ? "activate" : "offer";
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export const canInstall = () => deferred !== null;
export const canInstallServer = () => false;

export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  notify();
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === "accepted";
}
