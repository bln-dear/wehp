import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import apiRouter from "./routes/api.js";
import { attach as attachWebSocket } from "./ws.js";
import { initBulbSync } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();

app.use(express.json());

// API routes
app.use("/api", apiRouter);

// Serve built frontend
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// SPA fallback (single page app, no client-side router)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(publicDir, "index.html"));
});

const server = createServer(app);
attachWebSocket(server);

server.listen(PORT, () => {
  console.log(`WeHP server listening on http://localhost:${PORT}`);
  initBulbSync();
});
