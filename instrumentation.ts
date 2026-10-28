// Start collecting as soon as the server boots, not on the first page view.
// The backup site (BACKUP_MODE=1) doesn't collect; it only shows what the servers push to it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.BACKUP_MODE !== "1") {
    const { ensureCollector } = await import("./lib/collector");
    ensureCollector();
  }
}
