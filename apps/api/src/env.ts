import dotenv from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

dotenv.config({ path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")] });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  SESSION_SECRET: z.string().min(16),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:hello@example.com"),
  GMAIL_SENDER_EMAIL: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_VISION_MODEL: z.string().default("gpt-4o"),
});

export const env = schema.parse(process.env);
