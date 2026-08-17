import { Router } from "express";
import * as store from "../store.js";
import { broadcast } from "../ws.js";

const router = Router();

function handle(fn) {
  return (req, res) => {
    try {
      const result = fn(req, res);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      res.status(status).json({ error: err.message || "Something went wrong." });
    }
  };
}

// Check whether a name is already registered (used to warn on sign-in)
router.get(
  "/account/exists",
  handle((req) => ({ exists: store.accountExists(req.query.name) }))
);

// Create a new user session ("sign in")
router.post(
  "/session",
  handle((req) => {
    const user = store.createSession(req.body?.name, req.body?.password);
    broadcast({ type: "update" });
    return { userId: user.id, user };
  })
);

// Full dashboard snapshot for a given user (polled by the client)
router.get(
  "/dashboard",
  handle((req) => store.getDashboard(req.query.userId))
);

// Toggle working / on-break status
router.post(
  "/break/toggle",
  handle((req) => {
    const result = store.toggleBreak(req.body?.userId);
    broadcast({ type: "update" });
    return result;
  })
);

// Post a "tired" entry and drain 1 HP
router.post(
  "/drain",
  handle((req) => {
    const result = store.drainHp(req.body?.userId, req.body?.text);
    broadcast({ type: "update" });
    return result;
  })
);

// Post a positive "potion" message to the board
router.post(
  "/potion",
  handle((req) => {
    const result = store.addPotion(req.body?.userId, req.body?.text);
    broadcast({ type: "update" });
    return result;
  })
);

// Claim a potion for +1 HP
router.post(
  "/potion/:id/claim",
  handle((req) => {
    const result = store.claimPotion(req.body?.userId, req.params.id);
    broadcast({ type: "update" });
    return result;
  })
);

export default router;
