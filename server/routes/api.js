import { Router } from "express";
import * as store from "../store.js";

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

// Create a new user session ("sign in")
router.post(
  "/session",
  handle((req) => {
    const user = store.createSession(req.body?.name);
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
  handle((req) => store.toggleBreak(req.body?.userId))
);

// Post a "tired" entry and drain 1 HP
router.post(
  "/drain",
  handle((req) => store.drainHp(req.body?.userId, req.body?.text))
);

// Post a positive "potion" message to the board
router.post(
  "/potion",
  handle((req) => store.addPotion(req.body?.userId, req.body?.text))
);

// Claim a potion for +1 HP
router.post(
  "/potion/:id/claim",
  handle((req) => store.claimPotion(req.body?.userId, req.params.id))
);

export default router;
