import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Route not found" });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof Error && error.name === "MulterError") {
    res.status(400).json({ error: error.message.includes("File too large") ? "Venue image must be 2 MB or smaller." : "The venue image could not be uploaded.", code: "INVALID_VENUE_IMAGE" });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Please check the highlighted fields.", issues: error.issues });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, code: error.code, ...error.details });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
}
