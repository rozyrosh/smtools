import { readdirSync, existsSync } from "fs";
import path from "path";
import { runDue } from "./desk";
import { dataDir, publicError } from "./paths";
import { runAs } from "./store";

let started = false;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const root = path.join(dataDir(), "desks");
    if (!existsSync(root)) return;
    for (const id of readdirSync(root)) {
      if (!/^usr_[a-f0-9]{12}$/.test(id)) continue;
      try {
        await runAs(id, () => runDue());
      } catch (error) {
        console.error("Scheduled post:", publicError(error instanceof Error ? error.message : "The scheduled post did not go out."));
      }
    }
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (started) return;
  started = true;
  console.log("Scheduled posts run by themselves while smtools is running.");
  setInterval(() => {
    void tick();
  }, 30_000);
  void tick();
}
