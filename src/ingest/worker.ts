import { runPoll } from "./poll";
import { client } from "../db/client";

const INTERVAL = Number(process.env.POLL_INTERVAL_MS ?? 120000);
const once = process.argv.includes("--once");

async function main() {
  // Immediate first poll either way.
  await runPoll();

  if (once) {
    await client.end();
    return;
  }

  console.log(`[worker] polling every ${INTERVAL}ms — Ctrl-C to stop`);
  const timer = setInterval(() => {
    runPoll().catch((e) => console.error("[poll] error:", e));
  }, INTERVAL);

  const shutdown = async () => {
    clearInterval(timer);
    await client.end({ timeout: 5 });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(async (e) => {
  console.error("[worker] fatal:", e);
  await client.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
