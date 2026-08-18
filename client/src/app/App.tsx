import { useEffect, useRef, useState, useCallback } from "react";
import { FlaskConical, Frown, LogOut, MessageCircle } from "lucide-react";
import {
  api,
  ApiRequestError,
  getWsUrl,
  type ApiUser,
  type ApiBoardEntry,
} from "../api";

const MONO = "JetBrains Mono, monospace";
const SANS = "Archivo, sans-serif";
const STORAGE_KEY = "wehp:userId";
// Safety net in case the WebSocket silently drops without firing onclose.
const FALLBACK_POLL_INTERVAL_MS = 15000;
const WS_RECONNECT_BASE_MS = 1000;
const WS_RECONNECT_MAX_MS = 15000;

function getHpColor(hp: number): string {
  if (hp <= 1) return "#ef4444";
  if (hp <= 3) return "#f97316";
  if (hp <= 5) return "#fb923c";
  if (hp <= 7) return "#eab308";
  if (hp < 10) return "#a3e635";
  return "#22c55e";
}

function getHpStatus(hp: number): string {
  if (hp <= 1) return "Critical";
  if (hp <= 3) return "Low";
  if (hp <= 5) return "Okay";
  if (hp <= 7) return "Good";
  if (hp < 10) return "Great";
  return "Full";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HpSegments({ hp }: { hp: number }) {
  const color = getHpColor(hp);
  return (
    <div className="flex gap-1">
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className="flex-1 h-5 rounded-sm transition-all duration-500"
          style={{
            backgroundColor: i < hp ? color : "rgba(255,255,255,0.06)",
            boxShadow: i < hp ? `0 0 6px ${color}40` : "none",
          }}
        />
      ))}
    </div>
  );
}

function BulbIcon({
  color,
  hp,
  off = false,
}: {
  color: string;
  hp: number;
  off?: boolean;
}) {
  // brow: 0 = flat (happy), 4 = max angle (sad) — inner corners rise as HP drops
  const browAngle = off ? 0 : (1 - hp / 10) * 4;
  // mouth control point y: 39.5 = big smile, 20.5 = big frown, 30 = neutral at hp=5
  const mouthCy = off ? 30 : 30 + (hp - 5) * 1.9;
  const showBlush = !off && hp >= 8;
  const showCritical = !off && hp <= 1;
  const face = "rgba(0,0,0,0.42)";
  const glassColor = off ? "rgba(255,255,255,0.08)" : color;
  const browPath = (x1: number, x2: number, up: boolean) =>
    `path("M ${x1} ${17 + (up ? browAngle : -browAngle)} L ${x2} ${17 + (up ? -browAngle : browAngle)}")`;

  return (
    <div className="relative flex items-center justify-center">
      <div
        className="absolute rounded-full"
        style={{
          width: 90,
          height: 90,
          background: color,
          opacity: off ? 0 : 0.25,
          filter: "blur(22px)",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          transition: "opacity 0.6s ease, background 0.5s",
          animation: off ? "none" : "bulb-breathe 3s ease-in-out infinite",
        }}
      />
      <svg width="66" height="90" viewBox="0 0 44 62" fill="none">
        {/* globe */}
        <path
          d="M22 3C11 3 4 11.5 4 22C4 32 10.5 40 16.5 44.5L16.5 49L27.5 49L27.5 44.5C33.5 40 40 32 40 22C40 11.5 33 3 22 3Z"
          fill={glassColor}
          style={{ transition: "fill 0.5s" }}
        />
        {/* glass highlight */}
        <path
          d="M11 18C11 14 14.5 10.5 19 9"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          style={{ opacity: off ? 0.14 : 0.32, transition: "opacity 0.5s" }}
        />

        {/* ── Face ── */}
        <g style={{ opacity: off ? 0 : 1, transition: "opacity 0.5s ease" }}>
          {/* blush cheeks (happy) */}
          <ellipse
            cx="11.5"
            cy="28"
            rx="3.5"
            ry="2"
            fill="white"
            style={{
              opacity: showBlush ? 0.18 : 0,
              transition: "opacity 0.4s ease",
            }}
          />
          <ellipse
            cx="32.5"
            cy="28"
            rx="3.5"
            ry="2"
            fill="white"
            style={{
              opacity: showBlush ? 0.18 : 0,
              transition: "opacity 0.4s ease",
            }}
          />

          {/* left brow: outer (x=13) low, inner (x=18) high when sad */}
          <path
            d={`M 13 ${17 + browAngle} L 18 ${17 - browAngle}`}
            stroke={face}
            strokeWidth="1.6"
            strokeLinecap="round"
            style={{ d: browPath(13, 18, true), transition: "d 0.4s ease" }}
          />
          {/* right brow: inner (x=26) high, outer (x=31) low when sad */}
          <path
            d={`M 26 ${17 - browAngle} L 31 ${17 + browAngle}`}
            stroke={face}
            strokeWidth="1.6"
            strokeLinecap="round"
            style={{ d: browPath(26, 31, false), transition: "d 0.4s ease" }}
          />

          {/* eyes — cross-fade between dots and × */}
          <g
            style={{
              opacity: showCritical ? 0 : 1,
              transition: "opacity 0.35s ease",
            }}
          >
            <circle cx="16" cy="22" r="1.9" fill={face} />
            <circle cx="28" cy="22" r="1.9" fill={face} />
            {/* shine dots */}
            <circle cx="17" cy="21" r="0.7" fill="white" opacity="0.55" />
            <circle cx="29" cy="21" r="0.7" fill="white" opacity="0.55" />
          </g>
          <g
            style={{
              opacity: showCritical ? 1 : 0,
              transition: "opacity 0.35s ease",
            }}
          >
            <line
              x1="14"
              y1="20"
              x2="18"
              y2="24"
              stroke={face}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <line
              x1="18"
              y1="20"
              x2="14"
              y2="24"
              stroke={face}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <line
              x1="26"
              y1="20"
              x2="30"
              y2="24"
              stroke={face}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <line
              x1="30"
              y1="20"
              x2="26"
              y2="24"
              stroke={face}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </g>

          {/* mouth — curves up=frown, curves down=smile */}
          <path
            d={`M 15 30 Q 22 ${mouthCy} 29 30`}
            stroke={face}
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
            style={{
              d: `path("M 15 30 Q 22 ${mouthCy} 29 30")`,
              transition: "d 0.4s ease",
            }}
          />
        </g>

        {/* base bands */}
        <rect
          x="15.5"
          y="50"
          width="13"
          height="3"
          rx="0.6"
          fill={glassColor}
          style={{
            opacity: off ? 1 : 0.75,
            transition: "fill 0.5s, opacity 0.5s",
          }}
        />
        <rect
          x="16.5"
          y="54"
          width="11"
          height="3"
          rx="0.6"
          fill={glassColor}
          style={{
            opacity: off ? 1 : 0.5,
            transition: "fill 0.5s, opacity 0.5s",
          }}
        />
        <rect
          x="17.5"
          y="58"
          width="9"
          height="3"
          rx="1.5"
          fill={glassColor}
          style={{
            opacity: off ? 1 : 0.3,
            transition: "fill 0.5s, opacity 0.5s",
          }}
        />
      </svg>
    </div>
  );
}

// ─── Board entry components ───────────────────────────────────────────────────

function PotionCard({
  entry,
  myId,
  myHp,
  onClaim,
}: {
  entry: ApiBoardEntry;
  myId: string;
  myHp: number;
  onClaim: (id: string) => void;
}) {
  const isOwn = entry.submitterId === myId;
  const hasClaimed = entry.claimedBy.includes(myId);
  const atMaxHp = myHp >= 10;

  return (
    <div
      className="rounded-lg p-4 flex items-start gap-3 transition-all duration-200"
      style={{
        backgroundColor: "rgba(34,197,94,0.05)",
        border: "1px solid rgba(34,197,94,0.18)",
      }}
    >
      {/* Potion icon */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center mt-0.5"
        style={{ backgroundColor: "rgba(34,197,94,0.12)" }}
      >
        <FlaskConical
          size={15}
          style={{ color: "#22c55e" }}
          strokeWidth={2.2}
        />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ color: "rgba(226,226,232,0.88)" }}
        >
          {entry.text}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <span
            className="text-xs text-muted-foreground"
            style={{ fontFamily: MONO }}
          >
            {formatTime(entry.time)}
          </span>
          {entry.claimedBy.length > 0 && (
            <span
              className="text-xs text-muted-foreground"
              style={{ fontFamily: MONO }}
            >
              · {entry.claimedBy.length} claimed
            </span>
          )}
        </div>
      </div>

      {/* Claim button */}
      <div className="flex-shrink-0 ml-2">
        {isOwn ? (
          <span
            className="text-xs px-3 py-1.5 rounded"
            style={{
              fontFamily: MONO,
              color: "#66667a",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            yours
          </span>
        ) : hasClaimed ? (
          <span
            className="text-xs px-3 py-1.5 rounded font-bold"
            style={{
              fontFamily: MONO,
              color: "#22c55e",
              backgroundColor: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.2)",
            }}
          >
            +1 ✓
          </span>
        ) : atMaxHp ? (
          <span
            className="text-xs px-3 py-1.5 rounded"
            style={{
              fontFamily: MONO,
              color: "#66667a",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            HP Full
          </span>
        ) : (
          <button
            className="text-xs px-3 py-1.5 rounded font-bold transition-all hover:scale-105 active:scale-95"
            style={{
              fontFamily: MONO,
              color: "#22c55e",
              backgroundColor: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.25)",
              boxShadow: "0 0 10px rgba(34,197,94,0.15)",
            }}
            onClick={() => onClaim(entry.id)}
          >
            + 1 HP
          </button>
        )}
      </div>
    </div>
  );
}

function TiredCard({ entry }: { entry: ApiBoardEntry }) {
  return (
    <div
      className="rounded-lg p-4 flex items-start gap-3 transition-all duration-200"
      style={{
        backgroundColor: "rgba(148,163,184,0.04)",
        border: "1px solid rgba(148,163,184,0.14)",
      }}
    >
      {/* Tired icon */}
      <Frown
        size={14}
        className="flex-shrink-0 mt-1"
        style={{ color: "#94a3b8" }}
        strokeWidth={2}
      />

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ color: "rgba(226,226,232,0.75)" }}
        >
          {entry.text}
        </p>
        <span
          className="text-xs text-muted-foreground mt-2 inline-block"
          style={{ fontFamily: MONO }}
        >
          {formatTime(entry.time)}
        </span>
      </div>
    </div>
  );
}

function PlainEntry({ entry }: { entry: ApiBoardEntry }) {
  return (
    <div className="flex gap-4 px-1">
      <span
        className="text-xs text-muted-foreground/60 mt-0.5 flex-shrink-0 tabular-nums"
        style={{ fontFamily: MONO }}
      >
        {formatTime(entry.time)}
      </span>
      <p
        className="text-sm leading-relaxed whitespace-pre-wrap break-words"
        style={{ color: "rgba(226,226,232,0.48)" }}
      >
        {entry.text}
      </p>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [userId, setUserId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
  const [restoring, setRestoring] = useState<boolean>(!!userId);

  const [me, setMe] = useState<ApiUser | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [board, setBoard] = useState<ApiBoardEntry[]>([]);

  const [nameInput, setNameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [signInStep, setSignInStep] = useState<"name" | "password">("name");
  const [accountStatus, setAccountStatus] = useState<"existing" | "new" | null>(
    null,
  );
  const [checkingName, setCheckingName] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [draining, setDraining] = useState(false);
  const nameCheckCacheRef = useRef<{ name: string; exists: boolean } | null>(
    null,
  );

  const [composerInput, setComposerInput] = useState("");
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const [sendMode, setSendMode] = useState<"potion" | "message">("potion");
  const [potionCooldownMs, setPotionCooldownMs] = useState(60000);
  const [now, setNow] = useState(() => Date.now());
  const [showDrainModal, setShowDrainModal] = useState(false);
  const [tiredInput, setTiredInput] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const boardEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = composerInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [composerInput]);

  const activeUsers = users.filter((u) => u.isWorking);
  const avgHp =
    activeUsers.length > 0
      ? activeUsers.reduce((s, u) => s + u.hp, 0) / activeUsers.length
      : 0;
  const teamAvgMaxed = Math.round(avgHp) >= 10;

  useEffect(() => {
    if (teamAvgMaxed && sendMode === "potion") setSendMode("message");
  }, [teamAvgMaxed, sendMode]);

  const potionReadyAtMs = me?.potionReadyAt
    ? new Date(me.potionReadyAt).getTime()
    : 0;

  // Tick the clock while a potion cooldown is counting down so the send
  // button's progress bar and countdown stay live; stops itself once ready.
  useEffect(() => {
    if (!potionReadyAtMs || potionReadyAtMs <= Date.now()) return;
    const interval = setInterval(() => {
      const nowMs = Date.now();
      setNow(nowMs);
      if (nowMs >= potionReadyAtMs) clearInterval(interval);
    }, 250);
    return () => clearInterval(interval);
  }, [potionReadyAtMs]);

  const potionRemainingMs = Math.max(0, potionReadyAtMs - now);
  const potionOnCooldown = potionRemainingMs > 0;
  const potionCooldownProgress =
    potionCooldownMs > 0
      ? Math.min(1, Math.max(0, 1 - potionRemainingMs / potionCooldownMs))
      : 1;

  function scrollBoard() {
    setTimeout(
      () => boardEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      50,
    );
  }

  // Auto-scroll whenever a new entry lands on the board — whether it's our
  // own submission, another user's action pushed over WebSocket, or the
  // fallback poll picking one up. Skip the very first load so we don't jump
  // to the bottom before the user has looked at anything.
  const lastEntryIdRef = useRef<string | null>(null);
  useEffect(() => {
    const lastId = board.length > 0 ? board[board.length - 1].id : null;
    if (lastEntryIdRef.current !== null && lastId !== lastEntryIdRef.current) {
      scrollBoard();
    }
    lastEntryIdRef.current = lastId;
  }, [board]);

  const refreshDashboard = useCallback(async (id: string) => {
    try {
      const data = await api.getDashboard(id);
      if (!data.me) {
        // Server no longer knows this user (e.g. restarted) — force sign-in again.
        localStorage.removeItem(STORAGE_KEY);
        setUserId(null);
        setMe(null);
        return;
      }
      setMe(data.me);
      setUsers(data.users);
      setBoard(data.board);
      setPotionCooldownMs(data.stats.potionCooldownMs);
    } catch {
      // Transient network hiccup during polling — ignore and try again next tick.
    }
  }, []);

  // Restore session, then keep in sync via a fallback poll
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      await refreshDashboard(userId);
      if (!cancelled) setRestoring(false);
    })();

    const interval = setInterval(
      () => refreshDashboard(userId),
      FALLBACK_POLL_INTERVAL_MS,
    );
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId, refreshDashboard]);

  // Realtime updates: the server pushes a ping over WebSocket whenever
  // anyone's data changes, and we just refetch our own dashboard snapshot.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let reconnectAttempt = 0;
    let reconnectTimer: number | undefined;
    let socket: WebSocket | null = null;

    function connect() {
      if (cancelled) return;
      socket = new WebSocket(getWsUrl());

      socket.onopen = () => {
        reconnectAttempt = 0;
      };
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "update") refreshDashboard(userId);
        } catch {
          // ignore malformed message
        }
      };
      socket.onclose = () => {
        if (cancelled) return;
        const delay = Math.min(
          WS_RECONNECT_MAX_MS,
          WS_RECONNECT_BASE_MS * 2 ** reconnectAttempt,
        );
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
      socket.onerror = () => socket?.close();
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [userId, refreshDashboard]);

  // Looks up whether a name is registered, caching per name so repeated
  // submit attempts for the same name don't re-hit the network.
  async function checkNameExists(name: string): Promise<boolean | null> {
    const key = name.toLowerCase();
    if (nameCheckCacheRef.current?.name === key)
      return nameCheckCacheRef.current.exists;
    try {
      const { exists } = await api.checkAccountExists(name);
      nameCheckCacheRef.current = { name: key, exists };
      return exists;
    } catch {
      return null;
    }
  }

  async function handleNameSubmit() {
    const name = nameInput.trim();
    if (!name || checkingName) return;
    setCheckingName(true);
    setSignInError(null);
    const exists = await checkNameExists(name);
    setAccountStatus(
      exists === true ? "existing" : exists === false ? "new" : null,
    );
    setSignInStep("password");
    setCheckingName(false);
  }

  function handleBackToName() {
    setSignInStep("name");
    setAccountStatus(null);
    setPasswordInput("");
    setSignInError(null);
  }

  async function handleSignIn() {
    const name = nameInput.trim();
    const password = passwordInput;
    if (!name || !password || signingIn) return;
    setSigningIn(true);
    setSignInError(null);
    try {
      const { userId: newId } = await api.signIn(name, password);
      localStorage.setItem(STORAGE_KEY, newId);
      setUserId(newId);
      setNameInput("");
      setPasswordInput("");
      setSignInStep("name");
      setAccountStatus(null);
      await refreshDashboard(newId);
    } catch (err) {
      setSignInError(
        err instanceof ApiRequestError
          ? err.message
          : "Couldn't sign in. Try again.",
      );
    } finally {
      setSigningIn(false);
    }
  }

  async function handleDrainHp() {
    if (!userId || !tiredInput.trim() || draining) return;
    setActionError(null);
    setDraining(true);
    try {
      const { user } = await api.drainHp(userId, tiredInput.trim());
      setMe(user);
      setTiredInput("");
      setShowDrainModal(false);
      await refreshDashboard(userId);
    } catch (err) {
      setActionError(
        err instanceof ApiRequestError ? err.message : "Something went wrong.",
      );
    } finally {
      setDraining(false);
    }
  }

  async function handleToggleBreak() {
    if (!userId) return;
    try {
      const user = await api.toggleBreak(userId);
      setMe(user);
      await refreshDashboard(userId);
    } catch {
      // ignore
    }
  }

  async function handleSend() {
    const text = composerInput.trim();
    if (!userId || !text || sending) return;
    if (sendMode === "potion" && (teamAvgMaxed || potionOnCooldown)) return;
    setActionError(null);
    setSending(true);
    try {
      if (sendMode === "potion") {
        const { user } = await api.sendPotion(userId, text);
        setMe(user);
      } else {
        await api.sendMessage(userId, text);
      }
      setComposerInput("");
      await refreshDashboard(userId);
    } catch (err) {
      setActionError(
        err instanceof ApiRequestError ? err.message : "Something went wrong.",
      );
    } finally {
      setSending(false);
    }
  }

  async function handleClaimPotion(id: string) {
    if (!userId) return;
    try {
      const { user } = await api.claimPotion(userId, id);
      setMe(user);
      await refreshDashboard(userId);
    } catch {
      // ignore — button states already prevent most invalid claims
    }
  }

  function handleSignOut() {
    localStorage.removeItem(STORAGE_KEY);
    setUserId(null);
    setMe(null);
    setUsers([]);
    setBoard([]);
  }

  // ── Restoring session ───────────────────────────────────────────────────────
  if (userId && restoring) {
    return (
      <>
        <style>{scrollbarStyles}</style>
        <div
          className="min-h-screen bg-background flex items-center justify-center"
          style={{ fontFamily: SANS }}
        >
          <p
            className="text-sm text-muted-foreground"
            style={{ fontFamily: MONO }}
          >
            Loading WeHP…
          </p>
        </div>
      </>
    );
  }

  // ── Sign-in screen ──────────────────────────────────────────────────────────
  if (!userId || !me) {
    return (
      <>
        <style>{scrollbarStyles}</style>
        <div
          className="min-h-screen bg-background flex items-center justify-center p-8"
          style={{ fontFamily: SANS }}
        >
          <div className="w-full max-w-sm">
            <div className="mb-12">
              <h1
                className="text-8xl font-black tracking-tighter text-foreground leading-none select-none"
                style={{ fontFamily: SANS }}
              >
                WeHP
              </h1>
              <div className="flex items-center gap-3 mt-4">
                <div className="w-10 h-px bg-border" />
                <p
                  className="text-xs tracking-widest uppercase text-muted-foreground"
                  style={{ fontFamily: MONO }}
                >
                  Workplace Health Point
                </p>
              </div>
            </div>

            <div>
              {signInStep === "name" ? (
                <>
                  <label
                    className="block text-xs tracking-widest uppercase text-muted-foreground mb-3"
                    style={{ fontFamily: MONO }}
                  >
                    Your name
                  </label>
                  <input
                    className="w-full bg-card border border-border rounded px-4 py-3.5 text-foreground outline-none focus:border-foreground/25 transition-all placeholder:text-muted-foreground/40 mb-3 text-base"
                    style={{ fontFamily: SANS }}
                    placeholder="First name, last initial"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
                    autoFocus
                  />
                  {signInError && (
                    <p
                      className="text-xs mb-3"
                      style={{ fontFamily: MONO, color: "#ef4444" }}
                    >
                      {signInError}
                    </p>
                  )}
                  <button
                    className="w-full py-3.5 rounded text-sm font-bold tracking-wide transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    style={{
                      fontFamily: SANS,
                      backgroundColor: nameInput.trim()
                        ? "#e2e2e8"
                        : "rgba(255,255,255,0.04)",
                      color: nameInput.trim() ? "#0c0c10" : "#66667a",
                      border: nameInput.trim()
                        ? "none"
                        : "1px solid rgba(255,255,255,0.08)",
                    }}
                    onClick={handleNameSubmit}
                    disabled={!nameInput.trim() || checkingName}
                  >
                    {checkingName ? "Checking…" : "Continue →"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
                    style={{ fontFamily: MONO }}
                    onClick={handleBackToName}
                  >
                    ← {nameInput}
                  </button>
                  <label
                    className="block text-xs tracking-widest uppercase mb-1"
                    style={{
                      fontFamily: MONO,
                      color: accountStatus === "new" ? "#22c55e" : "#e2e2e8",
                    }}
                  >
                    {accountStatus === "new" ? "Create a password" : "Password"}
                  </label>
                  <p className="text-xs text-muted-foreground mb-3">
                    {accountStatus === "existing"
                      ? "Welcome back — enter your password to sign in."
                      : accountStatus === "new"
                        ? "No account found for this name — this will create a new one."
                        : "Enter your password to continue."}
                  </p>
                  <input
                    type="password"
                    className="w-full bg-card border border-border rounded px-4 py-3.5 text-foreground outline-none focus:border-foreground/25 transition-all placeholder:text-muted-foreground/40 mb-3 text-base"
                    style={{ fontFamily: SANS }}
                    placeholder="At least 4 characters"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                    autoComplete={
                      accountStatus === "new"
                        ? "new-password"
                        : "current-password"
                    }
                    autoFocus
                  />
                  {signInError && (
                    <p
                      className="text-xs mb-3"
                      style={{ fontFamily: MONO, color: "#ef4444" }}
                    >
                      {signInError}
                    </p>
                  )}
                  <button
                    className="w-full py-3.5 rounded text-sm font-bold tracking-wide transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    style={{
                      fontFamily: SANS,
                      backgroundColor: passwordInput
                        ? "#e2e2e8"
                        : "rgba(255,255,255,0.04)",
                      color: passwordInput ? "#0c0c10" : "#66667a",
                      border: passwordInput
                        ? "none"
                        : "1px solid rgba(255,255,255,0.08)",
                    }}
                    onClick={handleSignIn}
                    disabled={!passwordInput || signingIn}
                  >
                    {signingIn
                      ? accountStatus === "new"
                        ? "Creating…"
                        : "Signing in…"
                      : accountStatus === "new"
                        ? "Create Account →"
                        : "Sign In →"}
                  </button>
                </>
              )}
            </div>

            <p
              className="text-xs text-muted-foreground/50 mt-8 text-center"
              style={{ fontFamily: MONO }}
            >
              {Math.max(users.length, 6)} colleagues already clocked in
            </p>
          </div>
        </div>
      </>
    );
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{scrollbarStyles}</style>
      <div
        className="h-screen flex flex-col bg-background text-foreground overflow-hidden"
        style={{ fontFamily: SANS }}
      >
        {/* Header */}
        <header className="flex-shrink-0 border-b border-border px-6 lg:px-10 py-4 flex items-center justify-between bg-background/95 backdrop-blur-sm">
          <span
            className="text-base font-black tracking-tighter select-none"
            style={{ fontFamily: SANS }}
          >
            WeHP
          </span>
          <div className="flex items-center gap-3">
            <span
              className="text-sm text-muted-foreground"
              style={{ fontFamily: MONO }}
            >
              {me.name}
            </span>
            <span
              className="text-xs px-2.5 py-1 rounded font-medium"
              style={{
                fontFamily: MONO,
                backgroundColor: me.isWorking
                  ? "rgba(34,197,94,0.1)"
                  : "rgba(234,179,8,0.1)",
                color: me.isWorking ? "#22c55e" : "#eab308",
              }}
            >
              {me.isWorking ? "● working" : "○ on break"}
            </span>
            <button
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              style={{ fontFamily: MONO }}
              onClick={handleSignOut}
              title="Sign out"
            >
              <LogOut size={12} strokeWidth={2.2} />
              sign out
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0 max-w-6xl mx-auto px-6 lg:px-10 py-5 w-full overflow-y-auto scroll-thin">
          {/* Page layout: content left, board right */}
          <div className="flex flex-col lg:flex-row gap-5 h-full min-h-0 max-h-[80vh]">
            <div className="lg:w-2/3 flex flex-col gap-5 h-full min-h-0">
              {/* My HP */}
              <div className="bg-card border border-border rounded-lg p-4 flex-shrink-0">
                <p
                  className="text-xs uppercase tracking-widest text-muted-foreground mb-3"
                  style={{ fontFamily: MONO }}
                >
                  Your HP
                </p>

                <div className="flex items-end justify-between mb-3">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="font-black leading-none tabular-nums"
                      style={{
                        fontFamily: MONO,
                        fontSize: "3rem",
                        color: getHpColor(me.hp),
                        textShadow: `0 0 20px ${getHpColor(me.hp)}60`,
                      }}
                    >
                      {me.hp}
                    </span>
                    <span
                      className="text-muted-foreground text-sm pb-1"
                      style={{ fontFamily: MONO }}
                    >
                      /10
                    </span>
                  </div>
                  <span
                    className="text-sm font-bold pb-1 tracking-wide"
                    style={{ color: getHpColor(me.hp), fontFamily: MONO }}
                  >
                    {getHpStatus(me.hp)}
                  </span>
                </div>

                <HpSegments hp={me.hp} />

                <div className="flex gap-3 mt-4">
                  <button
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded border border-border text-sm font-bold tracking-wide hover:bg-muted transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                    style={{ fontFamily: SANS }}
                    onClick={() => setShowDrainModal(true)}
                    disabled={!me.isWorking || me.hp <= 0}
                  >
                    <div> − 1 HP</div>
                  </button>
                  <button
                    className="flex-1 py-2 rounded text-sm font-bold tracking-wide transition-all"
                    style={{
                      fontFamily: SANS,
                      backgroundColor: me.isWorking
                        ? "rgba(234,179,8,0.1)"
                        : "rgba(34,197,94,0.1)",
                      color: me.isWorking ? "#eab308" : "#22c55e",
                      border: `1px solid ${me.isWorking ? "rgba(234,179,8,0.18)" : "rgba(34,197,94,0.18)"}`,
                    }}
                    onClick={handleToggleBreak}
                  >
                    {me.isWorking ? "Take Break" : "Resume Work"}
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 flex-shrink-0">
                <div className="bg-card border border-border rounded-lg p-4 flex flex-col items-center">
                  <p
                    className="text-xs uppercase tracking-widest text-muted-foreground mb-3 self-start"
                    style={{ fontFamily: MONO }}
                  >
                    Team Avg
                  </p>
                  <div className="flex flex-col h-full justify-center">
                    <BulbIcon
                      color={getHpColor(Math.round(avgHp))}
                      hp={Math.round(avgHp)}
                      off={activeUsers.length === 0}
                    />
                    <div className="flex items-baseline gap-1 mt-3">
                      <span
                        className="text-xl font-black tabular-nums"
                        style={{
                          fontFamily: MONO,
                          color:
                            activeUsers.length === 0
                              ? "#66667a"
                              : getHpColor(Math.round(avgHp)),
                          transition: "color 0.5s",
                        }}
                      >
                        {activeUsers.length === 0 ? "—" : avgHp.toFixed(1)}
                      </span>
                      <span
                        className="text-muted-foreground text-xs"
                        style={{ fontFamily: MONO }}
                      >
                        /10
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p
                      className="text-xs uppercase tracking-widest text-muted-foreground mb-3"
                      style={{ fontFamily: MONO }}
                    >
                      Working
                    </p>
                    <p
                      className="text-2xl font-black tabular-nums text-foreground"
                      style={{ fontFamily: MONO }}
                    >
                      {activeUsers.length}
                    </p>
                    <p
                      className="text-xs text-muted-foreground mt-1"
                      style={{ fontFamily: MONO }}
                    >
                      active now
                    </p>
                  </div>

                  <div className="bg-card border border-border rounded-lg p-4">
                    <p
                      className="text-xs uppercase tracking-widest text-muted-foreground mb-3"
                      style={{ fontFamily: MONO }}
                    >
                      Total
                    </p>
                    <p
                      className="text-2xl font-black tabular-nums text-foreground"
                      style={{ fontFamily: MONO }}
                    >
                      {users.length}
                    </p>
                    <p
                      className="text-xs text-muted-foreground mt-1"
                      style={{ fontFamily: MONO }}
                    >
                      in system
                    </p>
                  </div>
                </div>
              </div>

              {/* User list */}
              <div className="bg-card border border-border rounded-lg p-5 flex flex-col flex-1 min-h-0">
                <p
                  className="text-xs uppercase tracking-widest text-muted-foreground mb-4 flex-shrink-0"
                  style={{ fontFamily: MONO }}
                >
                  All Users
                </p>
                <div className="space-y-3 flex-1 min-h-0 overflow-y-auto scroll-thin pr-1">
                  {users.map((user) => (
                    <div key={user.id} className="flex items-center gap-3">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-300"
                        style={{
                          backgroundColor: user.isWorking
                            ? "#22c55e"
                            : "#eab308",
                        }}
                      />
                      <span
                        className="text-sm flex-1 truncate min-w-0"
                        style={{ fontFamily: SANS }}
                      >
                        {user.name}
                        {user.id === me.id && (
                          <span
                            className="text-muted-foreground text-xs ml-1.5"
                            style={{ fontFamily: MONO }}
                          >
                            you
                          </span>
                        )}
                      </span>
                      <span
                        className="text-xs flex-shrink-0"
                        style={{
                          fontFamily: MONO,
                          color: user.isWorking ? "#22c55e" : "#eab308",
                        }}
                      >
                        {user.isWorking ? "working" : "break"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Board */}
            <div className="lg:w-1/2 min-h-0">
              <div className="bg-card border border-border rounded-lg p-6 flex flex-col h-full">
                <div className="flex items-center justify-between mb-5 flex-shrink-0">
                  <p
                    className="text-xs uppercase tracking-widest text-muted-foreground"
                    style={{ fontFamily: MONO }}
                  >
                    Board
                  </p>
                  <span
                    className="text-xs text-muted-foreground"
                    style={{ fontFamily: MONO }}
                  >
                    {board.length} entries
                  </span>
                </div>

                {/* Entry feed */}
                <div className="space-y-3 flex-1 min-h-0 overflow-y-auto scroll-thin mb-5 pr-1">
                  {board.map((entry) =>
                    entry.type === "potion" ? (
                      <PotionCard
                        key={entry.id}
                        entry={entry}
                        myId={me.id}
                        myHp={me.hp}
                        onClaim={handleClaimPotion}
                      />
                    ) : entry.type === "tired" ? (
                      <TiredCard key={entry.id} entry={entry} />
                    ) : (
                      <PlainEntry key={entry.id} entry={entry} />
                    ),
                  )}
                  <div ref={boardEndRef} />
                </div>

                {actionError && (
                  <p
                    className="text-xs mb-3"
                    style={{ fontFamily: MONO, color: "#ef4444" }}
                  >
                    {actionError}
                  </p>
                )}

                {/* Composer */}
                <div className="pt-5 border-t border-border">
                  <div className="flex items-center gap-1.5 mb-2">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold transition-all"
                      style={{
                        fontFamily: MONO,
                        backgroundColor:
                          sendMode === "message"
                            ? "rgba(255,255,255,0.08)"
                            : "transparent",
                        color: sendMode === "message" ? "#e2e2e8" : "#66667a",
                      }}
                      onClick={() => setSendMode("message")}
                    >
                      <MessageCircle size={12} strokeWidth={2.5} />
                      Message
                    </button>
                    {!teamAvgMaxed && (
                      <button
                        type="button"
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold transition-all"
                        style={{
                          fontFamily: MONO,
                          backgroundColor:
                            sendMode === "potion"
                              ? "rgba(34,197,94,0.12)"
                              : "transparent",
                          color: sendMode === "potion" ? "#22c55e" : "#66667a",
                        }}
                        onClick={() => setSendMode("potion")}
                      >
                        <FlaskConical size={12} strokeWidth={2.5} />
                        Potion
                        {potionOnCooldown && (
                          <span style={{ color: "#66667a" }}>
                            · {Math.ceil(potionRemainingMs / 1000)}s
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3 items-end">
                    <textarea
                      ref={composerInputRef}
                      rows={1}
                      className="flex-1 min-w-0 bg-background border border-border rounded px-4 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 resize-none overflow-y-auto leading-relaxed disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        fontFamily: SANS,
                        borderColor: composerInput.trim()
                          ? sendMode === "potion"
                            ? "rgba(34,197,94,0.3)"
                            : "rgba(255,255,255,0.18)"
                          : undefined,
                      }}
                      placeholder={
                        sendMode === "potion"
                          ? "Say something uplifting..."
                          : "Say something..."
                      }
                      value={composerInput}
                      onChange={(e) => setComposerInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                    />
                    <button
                      className="w-[70px] relative overflow-hidden px-4 py-2.5 rounded text-sm font-bold leading-relaxed transition-all disabled:opacity-25 disabled:cursor-not-allowed flex-shrink-0"
                      style={{
                        fontFamily: SANS,
                        backgroundColor:
                          sendMode === "potion" && potionOnCooldown
                            ? "rgba(255,255,255,0.04)"
                            : composerInput.trim()
                              ? sendMode === "potion"
                                ? "rgba(34,197,94,0.12)"
                                : "rgba(255,255,255,0.08)"
                              : "rgba(255,255,255,0.04)",
                        color:
                          sendMode === "potion" && potionOnCooldown
                            ? "#66667a"
                            : composerInput.trim()
                              ? sendMode === "potion"
                                ? "#22c55e"
                                : "#e2e2e8"
                              : "#66667a",
                        border: `1px solid ${
                          sendMode === "potion" && potionOnCooldown
                            ? "rgba(255,255,255,0.08)"
                            : composerInput.trim()
                              ? sendMode === "potion"
                                ? "rgba(34,197,94,0.25)"
                                : "rgba(255,255,255,0.18)"
                              : "rgba(255,255,255,0.08)"
                        }`,
                      }}
                      onClick={handleSend}
                      disabled={
                        !composerInput.trim() ||
                        sending ||
                        (sendMode === "potion" && potionOnCooldown)
                      }
                    >
                      {sendMode === "potion" && potionOnCooldown && (
                        <span
                          className="absolute inset-y-0 left-0"
                          style={{
                            width: `${potionCooldownProgress * 100}%`,
                            backgroundColor: "rgba(34,197,94,0.14)",
                            transition: "width 0.25s linear",
                          }}
                        />
                      )}
                      <span className="relative">
                        {sending
                          ? "…"
                          : sendMode === "potion" && potionOnCooldown
                            ? `${Math.ceil(potionRemainingMs / 1000)}s`
                            : "Send"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* HP Drain Modal */}
      {showDrainModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-6"
          style={{ backgroundColor: "rgba(12,12,16,0.88)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDrainModal(false);
              setTiredInput("");
            }
          }}
        >
          <div
            className="bg-card border border-border rounded-lg p-6 w-full max-w-sm shadow-2xl"
            style={{ fontFamily: SANS }}
          >
            <span
              className="text-xs uppercase tracking-widest text-muted-foreground block mb-2"
              style={{ fontFamily: MONO }}
            >
              HP Drain
            </span>
            <h3 className="text-lg font-black mb-1">
              What&apos;s making you tired?
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              Let them know what's on your mind. Your words will be posted
              anonymously.
            </p>
            <textarea
              className="w-full bg-background border border-border rounded px-4 py-3 text-sm text-foreground outline-none focus:border-foreground/20 transition-colors resize-none mb-4 placeholder:text-muted-foreground/40"
              style={{ fontFamily: SANS }}
              rows={3}
              placeholder="e.g. Back-to-back meetings with no break..."
              value={tiredInput}
              onChange={(e) => setTiredInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleDrainHp();
                }
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                className="flex-1 py-3 rounded border border-border text-sm font-bold hover:bg-muted transition-colors"
                onClick={() => {
                  setShowDrainModal(false);
                  setTiredInput("");
                }}
              >
                Cancel
              </button>
              <button
                className="flex-1 py-3 rounded text-sm font-bold transition-all disabled:opacity-25 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: tiredInput.trim()
                    ? "rgba(239,68,68,0.14)"
                    : "rgba(255,255,255,0.04)",
                  color: tiredInput.trim() ? "#ef4444" : "#66667a",
                  border: `1px solid ${tiredInput.trim() ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)"}`,
                }}
                onClick={handleDrainHp}
                disabled={!tiredInput.trim() || draining}
              >
                {draining ? "…" : "− 1 HP"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const scrollbarStyles = `
  .scroll-thin::-webkit-scrollbar { width: 3px; }
  .scroll-thin::-webkit-scrollbar-track { background: transparent; }
  .scroll-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
  .scroll-thin { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }

  @keyframes bulb-breathe {
    0%, 100% { opacity: 0.25; transform: translate(-50%, -50%) scale(1); }
    50% { opacity: 0.4; transform: translate(-50%, -50%) scale(1.08); }
  }
`;
