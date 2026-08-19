import passport from "passport";
import { prisma } from "../db.js";

const publicUser = (user: { id: string; email: string; name: string; role: "CONSUMER" | "MERCHANT" | "ADMIN" }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
});

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user?.passwordHash && user.emailVerifiedAt ? publicUser(user) : false);
  } catch (error) {
    done(error);
  }
});

export { passport };
