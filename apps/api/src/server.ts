import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import pg from "pg";
import { z } from "zod";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
import { asyncRoute, errorHandler, notFound } from "./lib/http.js";
import { sendSavedDealExpiryNotifications } from "./lib/push.js";
import { recomputeAllVenueTrust } from "./lib/trust.js";
import { isImageStorageConfigured } from "./lib/image-storage.js";
import { isEmailDeliveryConfigured } from "./lib/email.js";
import { backfillDealTranslations, translationConfigured } from "./lib/deal-translation.js";

const app = express();
const PgSession = connectPgSimple(session);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const SITE_URL = "https://wheretogo.az";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function escapeXml(value: string) {
  return escapeHtml(value);
}

function publicImageUrl(value: string | null) {
  if (!value || value.startsWith("data:")) return `${SITE_URL}/wheretogo-hero-wide.png`;
  try { return new URL(value, SITE_URL).toString(); }
  catch { return `${SITE_URL}/wheretogo-hero-wide.png`; }
}

function replaceMetadata(html: string, metadata: {
  title: string;
  description: string;
  canonical: string;
  image?: string | null;
  type?: "website" | "restaurant";
  robots?: "index, follow" | "noindex, nofollow";
  structuredData?: Record<string, unknown>;
}) {
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const canonical = escapeHtml(metadata.canonical);
  const image = escapeHtml(publicImageUrl(metadata.image ?? null));
  const type = metadata.type ?? "website";
  const robots = metadata.robots ?? "index, follow";
  let output = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`)
    .replace(/<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${robots}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonical}" />`)
    .replace(/<meta property="og:type" content="[^"]*" \/>/, `<meta property="og:type" content="${type}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${image}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${description}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${image}" />`);
  if (metadata.structuredData) {
    const json = JSON.stringify(metadata.structuredData).replace(/</g, "\\u003c");
    output = output.replace(/<script id="page-structured-data" type="application\/ld\+json">[\s\S]*?<\/script>/,
      `<script id="page-structured-data" type="application/ld+json">${json}</script>`);
  }
  return output;
}

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
    const indexFile = resolve(webDist, "index.html");
    app.get("/robots.txt", (_req, res) => {
      res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /merchant\nDisallow: /profile\nDisallow: /saved\nDisallow: /login\nDisallow: /register\nSitemap: ${SITE_URL}/sitemap.xml\n`);
    });
    app.get("/sitemap.xml", asyncRoute(async (_req, res) => {
      const restaurants = await prisma.restaurant.findMany({
        where: { isActive: true },
        select: { id: true },
        orderBy: { name: "asc" },
      });
      const urls = [SITE_URL, ...restaurants.map(({ id }) => `${SITE_URL}/venues/${encodeURIComponent(id)}`)];
      const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
      res.setHeader("Cache-Control", "public, max-age=900");
      res.type("application/xml").send(body);
    }));
    app.get("/venues/:id", asyncRoute(async (req, res) => {
      const id = z.string().parse(req.params.id);
      const restaurant = await prisma.restaurant.findFirst({
        where: { id, isActive: true },
        select: { id: true, name: true, address: true, cuisine: true, lat: true, lng: true, phone: true, photoUrl: true },
      });
      const baseHtml = await readFile(indexFile, "utf8");
      if (!restaurant) {
        res.status(404).type("html").send(replaceMetadata(baseHtml, {
          title: "Venue not found | WhereToGo",
          description: "This venue is not available on WhereToGo.",
          canonical: `${SITE_URL}/venues/${encodeURIComponent(id)}`,
          robots: "noindex, nofollow",
        }));
        return;
      }
      const canonical = `${SITE_URL}/venues/${encodeURIComponent(restaurant.id)}`;
      const image = publicImageUrl(restaurant.photoUrl);
      const description = `${restaurant.name} in Baku — view the menu, location and live offers on WhereToGo.`;
      res.setHeader("Cache-Control", "public, max-age=300");
      res.type("html").send(replaceMetadata(baseHtml, {
        title: `${restaurant.name} — Menu, Location & Offers | WhereToGo`,
        description,
        canonical,
        image,
        type: "restaurant",
        structuredData: {
          "@context": "https://schema.org",
          "@type": "Restaurant",
          name: restaurant.name,
          url: canonical,
          image,
          address: {
            "@type": "PostalAddress",
            streetAddress: restaurant.address,
            addressLocality: "Baku",
            addressCountry: "AZ",
          },
          geo: { "@type": "GeoCoordinates", latitude: restaurant.lat, longitude: restaurant.lng },
          ...(restaurant.phone ? { telephone: restaurant.phone } : {}),
          ...(restaurant.cuisine ? { servesCuisine: restaurant.cuisine } : {}),
          hasMenu: canonical,
        },
      }));
    }));
    app.get("/sw.js", (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.sendFile(resolve(webDist, "sw.js"));
    });
    app.use(express.static(webDist));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      void readFile(indexFile, "utf8").then((baseHtml) => {
        const privateRoute = /^\/(admin|merchant|profile|saved|login|register|verify-email)(\/|$)/.test(req.path);
        const canonical = `${SITE_URL}${req.path === "/" ? "/" : req.path}`;
        res.type("html").send(replaceMetadata(baseHtml, {
          title: "WhereToGo — Great Food. Great Deals. Every Day.",
          description: "Discover restaurants, menus and live food deals near you with WhereToGo.",
          canonical,
          robots: privateRoute ? "noindex, nofollow" : "index, follow",
        }));
      }).catch(next);
    });
  }
}
app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.PORT, env.API_HOST, () => {
  console.log(`Grub Stub API listening on http://${env.API_HOST}:${env.PORT}`);
  if (!env.GOOGLE_MAPS_SERVER_API_KEY) console.warn("[configuration] GOOGLE_MAPS_SERVER_API_KEY is unset; server-side place search is disabled.");
  if (!isImageStorageConfigured()) console.warn("[configuration] Cloudinary is unset; uploaded images use the persistent PostgreSQL fallback.");
  if (!isEmailDeliveryConfigured()) console.warn("[configuration] Gmail verification delivery is disabled; configure the Gmail API OAuth variables.");
  if (!translationConfigured()) console.warn("[configuration] GOOGLE_TRANSLATE_API_KEY is unset; merchant offer text will not be translated.");
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
void backfillDealTranslations().catch((error) => console.error("[translation] Backfill failed:", error));
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
