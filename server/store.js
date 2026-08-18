import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { translateToGenZ } from "./ai.js";

// ─── Error type ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ─── Password hashing ───────────────────────────────────────────────────────

const PASSWORD_MIN = 4;
const PASSWORD_MAX = 72;

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

// ─── Config ──────────────────────────────────────────────────────────────

const POTION_COOLDOWN_MS = (Number(process.env.POTION_COOLDOWN_SECONDS) || 60) * 1000;

// ─── In-memory data ─────────────────────────────────────────────────────────

const users = new Map();

const board = [];

// ─── Helpers ─────────────────────────────────────────────────────────────

function requireUser(userId) {
  const user = users.get(userId);
  if (!user) throw new ApiError(404, "Unknown user. Please sign in again.");
  return user;
}

function serializeUser(u) {
  return {
    id: u.id,
    name: u.name,
    hp: u.hp,
    isWorking: u.isWorking,
    updatedAt: u.updatedAt.toISOString(),
    potionReadyAt: u.lastPotionAt
      ? new Date(u.lastPotionAt.getTime() + POTION_COOLDOWN_MS).toISOString()
      : null,
  };
}

function touchUser(user) {
  user.updatedAt = new Date();
  return user;
}

function findUserByName(name) {
  return Array.from(users.values()).find((u) => u.name.toLowerCase() === name.toLowerCase());
}

function serializeEntry(e) {
  return {
    id: e.id,
    type: e.type,
    text: e.text,
    time: e.time.toISOString(),
    submitterId: e.submitterId,
    claimedBy: e.claimedBy,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────

export function accountExists(name) {
  const clean = (name || "").trim();
  if (!clean) return false;
  return Boolean(findUserByName(clean));
}

export function createSession(name, password) {
  const clean = (name || "").trim();
  if (!clean) throw new ApiError(400, "Name is required.");
  if (clean.length > 60) throw new ApiError(400, "Name is too long.");

  const pw = password || "";
  if (!pw) throw new ApiError(400, "Password is required.");
  if (pw.length < PASSWORD_MIN) throw new ApiError(400, `Password must be at least ${PASSWORD_MIN} characters.`);
  if (pw.length > PASSWORD_MAX) throw new ApiError(400, "Password is too long.");

  const existing = findUserByName(clean);

  if (existing) {
    if (existing.passwordHash) {
      if (!verifyPassword(pw, existing.passwordHash)) {
        throw new ApiError(401, "Incorrect password.");
      }
    } else {
      // Seed/legacy account with no password set yet — claim it.
      existing.passwordHash = hashPassword(pw);
    }
    return serializeUser(touchUser(existing));
  }

  const id = randomUUID();
  const user = { id, name: clean, hp: 10, isWorking: true, updatedAt: new Date(), passwordHash: hashPassword(pw) };
  users.set(id, user);
  return serializeUser(user);
}

export function getDashboard(userId) {
  const me = userId && users.has(userId) ? serializeUser(users.get(userId)) : null;
  const allUsers = Array.from(users.values())
    .map(serializeUser)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const activeUsers = allUsers.filter((u) => u.isWorking);
  const avgHp =
    activeUsers.length > 0
      ? activeUsers.reduce((s, u) => s + u.hp, 0) / activeUsers.length
      : 0;

  return {
    me,
    users: allUsers,
    board: board
      .slice()
      .sort((a, b) => a.time - b.time)
      .map(serializeEntry),
    stats: {
      avgHp,
      activeCount: activeUsers.length,
      totalCount: allUsers.length,
      potionCooldownMs: POTION_COOLDOWN_MS,
    },
  };
}

export function toggleBreak(userId) {
  const user = touchUser(requireUser(userId));
  user.isWorking = !user.isWorking;
  return serializeUser(user);
}

export async function drainHp(userId, text) {
  const user = requireUser(userId);
  const clean = (text || "").trim();
  if (!clean) throw new ApiError(400, "Please describe what's tiring you out.");
  if (clean.length > 100) throw new ApiError(400, "Message is too long.");
  if (!user.isWorking) throw new ApiError(400, "You can only log HP drain while working.");
  if (user.hp <= 0) throw new ApiError(400, "HP is already at 0.");

  const translated = await translateToGenZ(clean);

  user.hp = Math.max(0, user.hp - 1);
  touchUser(user);

  const entry = {
    id: randomUUID(),
    type: "tired",
    text: translated,
    time: new Date(),
    submitterId: user.id,
    claimedBy: [],
  };
  board.push(entry);

  return { user: serializeUser(user), entry: serializeEntry(entry) };
}

export async function addPotion(userId, text) {
  const user = requireUser(userId);
  const clean = (text || "").trim();
  if (!clean) throw new ApiError(400, "Write something uplifting first.");
  if (clean.length > 100) throw new ApiError(400, "Message is too long.");

  const now = new Date();
  if (user.lastPotionAt) {
    const readyAt = user.lastPotionAt.getTime() + POTION_COOLDOWN_MS;
    if (now.getTime() < readyAt) {
      const waitSeconds = Math.ceil((readyAt - now.getTime()) / 1000);
      throw new ApiError(429, `Please wait ${waitSeconds}s before sending another potion.`);
    }
  }

  const translated = await translateToGenZ(clean);

  user.lastPotionAt = now;
  touchUser(user);

  const entry = {
    id: randomUUID(),
    type: "potion",
    text: translated,
    time: now,
    submitterId: user.id,
    claimedBy: [],
  };
  board.push(entry);

  return { user: serializeUser(user), entry: serializeEntry(entry) };
}

export async function addMessage(userId, text) {
  const user = touchUser(requireUser(userId));
  const clean = (text || "").trim();
  if (!clean) throw new ApiError(400, "Write something first.");
  if (clean.length > 100) throw new ApiError(400, "Message is too long.");

  const translated = await translateToGenZ(clean);

  const entry = {
    id: randomUUID(),
    type: "message",
    text: translated,
    time: new Date(),
    submitterId: user.id,
    claimedBy: [],
  };
  board.push(entry);

  return serializeEntry(entry);
}

export function claimPotion(userId, entryId) {
  const user = requireUser(userId);
  const entry = board.find((e) => e.id === entryId);
  if (!entry) throw new ApiError(404, "That potion no longer exists.");
  if (entry.type !== "potion") throw new ApiError(400, "That entry isn't a potion.");
  if (entry.submitterId === userId) throw new ApiError(400, "You can't claim your own potion.");
  if (entry.claimedBy.includes(userId)) throw new ApiError(400, "You already claimed this potion.");
  if (user.hp >= 10) throw new ApiError(400, "HP is already full.");

  entry.claimedBy.push(userId);
  user.hp = Math.min(10, user.hp + 1);
  touchUser(user);

  return { user: serializeUser(user), entry: serializeEntry(entry) };
}
