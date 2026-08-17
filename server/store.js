import { randomUUID } from "crypto";

// ─── Error type ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ─── Seed data (mirrors the original static mock in the UI) ────────────────

const now = Date.now();

const users = new Map(
  [
    { id: "u1", name: "Mira K.", hp: 7, isWorking: true, updatedAt: new Date(now - 1000 * 60 * 90) },
    { id: "u2", name: "Dayo O.", hp: 4, isWorking: true, updatedAt: new Date(now - 1000 * 60 * 75) },
    { id: "u3", name: "Noa L.", hp: 9, isWorking: false, updatedAt: new Date(now - 1000 * 60 * 60) },
    { id: "u4", name: "Tariq M.", hp: 6, isWorking: true, updatedAt: new Date(now - 1000 * 60 * 45) },
    { id: "u5", name: "Yuki S.", hp: 2, isWorking: true, updatedAt: new Date(now - 1000 * 60 * 30) },
    { id: "u6", name: "Freya B.", hp: 8, isWorking: true, updatedAt: new Date(now - 1000 * 60 * 15) },
  ].map((u) => [u.id, u])
);

let board = [
  {
    id: "b1",
    type: "tired",
    text: "Back-to-back meetings with no bathroom break.",
    time: new Date(now - 1000 * 60 * 58),
    submitterId: "u5",
    claimedBy: [],
  },
  {
    id: "b2",
    type: "potion",
    text: "You are doing better than you think. Keep going — the afternoon is almost over.",
    time: new Date(now - 1000 * 60 * 42),
    submitterId: "u1",
    claimedBy: ["u2"],
  },
  {
    id: "b3",
    type: "tired",
    text: "Printer jammed three times. Lost 20 minutes of my life I will never get back.",
    time: new Date(now - 1000 * 60 * 30),
    submitterId: "u4",
    claimedBy: [],
  },
  {
    id: "b4",
    type: "potion",
    text: "Take a sip of water and stretch for 30 seconds. Your body will thank you.",
    time: new Date(now - 1000 * 60 * 14),
    submitterId: "u3",
    claimedBy: [],
  },
  {
    id: "b5",
    type: "tired",
    text: "Client just moved the deadline up by two days.",
    time: new Date(now - 1000 * 60 * 6),
    submitterId: "u2",
    claimedBy: [],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────

function requireUser(userId) {
  const user = users.get(userId);
  if (!user) throw new ApiError(404, "Unknown user. Please sign in again.");
  return user;
}

function serializeUser(u) {
  return { id: u.id, name: u.name, hp: u.hp, isWorking: u.isWorking, updatedAt: u.updatedAt.toISOString() };
}

function touchUser(user) {
  user.updatedAt = new Date();
  return user;
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

export function createSession(name) {
  const clean = (name || "").trim();
  if (!clean) throw new ApiError(400, "Name is required.");
  if (clean.length > 60) throw new ApiError(400, "Name is too long.");

  const id = randomUUID();
  const user = { id, name: clean, hp: 10, isWorking: true, updatedAt: new Date() };
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
    },
  };
}

export function toggleBreak(userId) {
  const user = touchUser(requireUser(userId));
  user.isWorking = !user.isWorking;
  return serializeUser(user);
}

export function drainHp(userId, text) {
  const user = requireUser(userId);
  const clean = (text || "").trim();
  if (!clean) throw new ApiError(400, "Please describe what's tiring you out.");
  if (clean.length > 280) throw new ApiError(400, "Message is too long.");
  if (!user.isWorking) throw new ApiError(400, "You can only log HP drain while working.");
  if (user.hp <= 0) throw new ApiError(400, "HP is already at 0.");

  user.hp = Math.max(0, user.hp - 1);
  touchUser(user);

  const entry = {
    id: randomUUID(),
    type: "tired",
    text: clean,
    time: new Date(),
    submitterId: user.id,
    claimedBy: [],
  };
  board.push(entry);

  return { user: serializeUser(user), entry: serializeEntry(entry) };
}

export function addPotion(userId, text) {
  const user = touchUser(requireUser(userId));
  const clean = (text || "").trim();
  if (!clean) throw new ApiError(400, "Write something uplifting first.");
  if (clean.length > 280) throw new ApiError(400, "Message is too long.");

  const entry = {
    id: randomUUID(),
    type: "potion",
    text: clean,
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
