import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { hashPassword, verifyPassword, generateToken, requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, username));

  if (existing) {
    res.status(400).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const token = generateToken();

  const [user] = await db.insert(usersTable).values({ username, passwordHash, token }).returning();

  res.status(201).json({
    token: user.token,
    user: { id: user.id, username: user.username, createdAt: user.createdAt },
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  res.json({
    token: user.token,
    user: { id: user.id, username: user.username, createdAt: user.createdAt },
  });
});

router.get("/auth/me", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!));

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json({ id: user.id, username: user.username, createdAt: user.createdAt, token: user.token });
});

router.post("/auth/regenerate-token", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const newToken = generateToken();

  const [user] = await db
    .update(usersTable)
    .set({ token: newToken })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json({ id: user.id, username: user.username, createdAt: user.createdAt, token: user.token });
});

export default router;
