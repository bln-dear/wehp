import { TuyaContext } from "@tuya/tuya-connector-nodejs";

const DEVICE_ID = process.env.TUYA_DEVICE_ID;

let client = null;

function getClient() {
  if (!DEVICE_ID || !process.env.TUYA_ACCESS_KEY || !process.env.TUYA_SECRET_KEY) return null;
  if (!client) {
    client = new TuyaContext({
      baseUrl: process.env.TUYA_BASE_URL || "https://openapi.tuyaeu.com",
      accessKey: process.env.TUYA_ACCESS_KEY,
      secretKey: process.env.TUYA_SECRET_KEY,
    });
  }
  return client;
}

// Mirrors client/src/app/App.tsx's getHpColor() — the physical bulb is meant
// to match whatever color the "Team Avg" bulb icon is showing on screen.
function getHpColorHex(hp) {
  if (hp <= 1) return "#ef4444";
  if (hp <= 3) return "#f97316";
  if (hp <= 5) return "#fb923c";
  if (hp <= 7) return "#eab308";
  if (hp < 10) return "#a3e635";
  return "#22c55e";
}

// Tuya's colour_data_v2 expects h: 0-360, s/v: 0-1000. Only the hue is taken
// from the web palette's hex — s/v are pushed to full so the bulb renders a
// vivid, fully-saturated color instead of the paler, whiter tone the hex's
// own (screen-tuned) s/v would produce on real LEDs.
function hexToHsv(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h: Math.round(h), s: 1000, v: 1000 };
}

let lastState = null; // { on: boolean, hp: number }

// Fire-and-forget: pushes the current team-average HP to the real Tuya bulb,
// but only when the rounded average (or on/off state) actually moved, so
// dashboard polling doesn't spam the Tuya API on every unchanged refresh.
export async function syncBulbToTeamAvg(avgHp, activeCount) {
  const tuya = getClient();
  if (!tuya) return;

  const on = activeCount > 0;
  const hp = Math.round(avgHp);
  if (lastState && lastState.on === on && lastState.hp === hp) return;
  lastState = { on, hp };

  try {
    if (!on) {
      await tuya.request({
        path: `/v1.0/devices/${DEVICE_ID}/commands`,
        method: "POST",
        body: { commands: [{ code: "switch_led", value: false }] },
      });
      return;
    }

    const { h, s, v } = hexToHsv(getHpColorHex(hp));
    await tuya.request({
      path: `/v1.0/devices/${DEVICE_ID}/commands`,
      method: "POST",
      body: {
        commands: [
          { code: "switch_led", value: true },
          { code: "work_mode", value: "colour" },
          { code: "colour_data_v2", value: { h, s, v } },
        ],
      },
    });
  } catch (err) {
    console.error("Failed to sync bulb to team avg HP:", err.message);
  }
}
