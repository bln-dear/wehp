import { spawn } from "child_process";

// Returns how far ahead of UTC the given timezone is at `date`, in ms.
// Works for any IANA zone (accounts for DST where applicable), not just Bangkok.
function timeZoneOffsetMs(timeZone, date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce((acc, { type, value }) => {
      acc[type] = value;
      return acc;
    }, {});

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUTC - date.getTime();
}

function nextOccurrence(hour, minute, timeZone, from = new Date()) {
  const offset = timeZoneOffsetMs(timeZone, from);
  const localNow = new Date(from.getTime() + offset);
  let candidate =
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), hour, minute, 0) - offset;

  if (candidate <= from.getTime()) {
    candidate += 24 * 60 * 60 * 1000;
  }
  return new Date(candidate);
}

function restartProcess() {
  console.log("[restart] Restarting server process now.");
  // Spawn a fresh copy of this process before exiting, so the restart happens
  // whether we're run directly, via `node --watch`, or with no supervisor at all.
  const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    detached: true,
  });
  child.unref();
  process.exit(0);
}

export function scheduleMidnightRestart() {
  const enabled = (process.env.AUTO_RESTART_ENABLED ?? "true").trim().toLowerCase();
  if (enabled === "false" || enabled === "0" || enabled === "no") {
    console.log("[restart] Auto-restart disabled (AUTO_RESTART_ENABLED).");
    return;
  }

  const timeZone = process.env.AUTO_RESTART_TIMEZONE || "Asia/Bangkok";
  const timeSpec = (process.env.AUTO_RESTART_TIME || "00:00").trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(timeSpec);
  if (!match) {
    console.warn(`[restart] Invalid AUTO_RESTART_TIME "${timeSpec}", falling back to 00:00.`);
  }
  const hour = match ? Number(match[1]) : 0;
  const minute = match ? Number(match[2]) : 0;

  const next = nextOccurrence(hour, minute, timeZone);
  const delayMs = next.getTime() - Date.now();
  console.log(
    `[restart] Next auto-restart at ${next.toISOString()} (${timeZone} ${timeSpec}), in ${Math.round(delayMs / 1000)}s.`
  );
  setTimeout(restartProcess, delayMs).unref();
}
