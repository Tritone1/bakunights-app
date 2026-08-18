import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import pg from "pg";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { passport } from "./auth/passport.js";
import { prisma } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { dealsRouter } from "./routes/deals.js";
import { usersRouter } from "./routes/users.js";
import { restaurantsRouter } from "./routes/restaurants.js";
import { merchantRouter } from "./routes/merchant.js";
import { adminRouter } from "./routes/admin.js";
import { pushRouter } from "./routes/push.js";
import { placesRouter } from "./routes/places.js";
import { errorHandler, notFound } from "./lib/http.js";
import { sendSavedDealExpiryNotifications } from "./lib/push.js";
import { recomputeAllVenueTrust } from "./lib/trust.js";
import { isImageStorageConfigured } from "./lib/image-storage.js";

const app = express();
const PgSession = connectPgSimple(session);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

app.set("trust proxy", 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      frameSrc: ["'self'", "https://www.openstreetmap.org", "https://www.google.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "https://maps.googleapis.com", "https://maps.gstatic.com"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      connectSrc: ["'self'", "https://maps.googleapis.com", "https://maps.gstatic.com", "https://router.project-osrm.org", "https://routing.openstreetmap.de"],
      workerSrc: ["'self'", "blob:"],
    },
  },
}));
app.use(cors({
  origin(origin, callback) {
    const allowedOrigins = new Set([
      env.WEB_ORIGIN,
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
      "http://127.0.0.1:5175",
    ]);
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
}));
// Offer/menu photos are sent as validated data URLs (client limit: 2 MB).
app.use(express.json({ limit: "4mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  name: "haragedek.sid",
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));
app.use(passport.initialize());
app.use(passport.session());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRouter);
app.use("/api/deals", dealsRouter);
app.use("/api/users", usersRouter);
app.use("/api/restaurants", restaurantsRouter);
app.use("/api/merchant", merchantRouter);
app.use("/api/admin", adminRouter);
app.use("/api/push", pushRouter);
app.use("/api/places", placesRouter);
if (env.NODE_ENV === "production") {
  const webDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
      res.sendFile(resolve(webDist, "index.html"));
    });
  }
}
app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.PORT, env.API_HOST, () => {
  console.log(`Grub Stub API listening on http://${env.API_HOST}:${env.PORT}`);
  if (!env.GOOGLE_MAPS_API_KEY) console.warn("[configuration] GOOGLE_MAPS_API_KEY is unset; server-side place search is disabled.");
  if (!env.VITE_GOOGLE_MAPS_API_KEY) console.warn("[configuration] VITE_GOOGLE_MAPS_API_KEY was unset at build/runtime; the web app will use OpenStreetMap.");
  if (!isImageStorageConfigured()) console.warn("[configuration] Cloudinary is unset; uploaded images use the persistent PostgreSQL fallback.");
});

async function expireStaleDeals() {
  await prisma.deal.updateMany({
    where: { isActive: true, endsAt: { lte: new Date() } }, data: { isActive: false, status: "expired" },
  });
  await sendSavedDealExpiryNotifications();
}
void expireStaleDeals().catch(console.error);
const expiryTimer = setInterval(() => void expireStaleDeals().catch(console.error), 15 * 60 * 1000);
void recomputeAllVenueTrust().catch(console.error);
const trustTimer = setInterval(() => void recomputeAllVenueTrust().catch(console.error), 24 * 60 * 60 * 1000);

async function shutdown() {
  clearInterval(expiryTimer);
  clearInterval(trustTimer);
  server.close(async () => {
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
