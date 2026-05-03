import { Router, type IRouter } from "express";
import { db, tradesTable } from "@workspace/db";
import { eq, and, ilike, or, asc, desc, sql } from "drizzle-orm";
import {
  CreateTradeBody,
  ListTradesQueryParams,
  GetTradeParams,
  DeleteTradeParams,
  ImportTradesBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

// Alias map for flexible CSV/JSON import
const HEADER_ALIASES: Record<string, string> = {
  // ticket
  "ticket": "ticket", "order": "ticket", "position": "ticket", "position_id": "ticket",
  // symbol
  "symbol": "symbol", "instrument": "symbol", "pair": "symbol",
  // side
  "side": "side", "type": "side", "direction": "side", "order_type": "side", "action": "side",
  // volume
  "volume": "volume", "lots": "volume", "size": "volume", "quantity": "volume",
  // open_price
  "open_price": "openPrice", "openprice": "openPrice", "open": "openPrice", "price_open": "openPrice",
  // close_price
  "close_price": "closePrice", "closeprice": "closePrice", "close": "closePrice", "price_close": "closePrice",
  // open_time
  "open_time": "openTime", "opentime": "openTime", "open_date": "openTime", "time_open": "openTime",
  // close_time
  "close_time": "closeTime", "closetime": "closeTime", "close_date": "closeTime", "time_close": "closeTime",
  // profit
  "profit": "profit", "pnl": "profit", "net_profit": "profit", "gain": "profit",
  // commission
  "commission": "commission", "fee": "commission", "fees": "commission",
  // swap
  "swap": "swap", "rollover": "swap", "interest": "swap",
  // mae
  "mae": "mae", "max_adverse_excursion": "mae",
  // mfe
  "mfe": "mfe", "max_favorable_excursion": "mfe",
  // magic_number
  "magic_number": "magicNumber", "magicnumber": "magicNumber", "magic": "magicNumber", "ea_id": "magicNumber",
  // notes
  "notes": "notes", "comment": "notes", "comments": "notes",
};

function normalizeSide(v: string): string {
  const lower = v.toLowerCase().trim();
  if (lower === "buy" || lower === "long" || lower === "0") return "BUY";
  if (lower === "sell" || lower === "short" || lower === "1") return "SELL";
  return v.toUpperCase();
}

function normalizeRawTrade(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const normalized = HEADER_ALIASES[k.toLowerCase().replace(/ /g, "_")];
    if (normalized && result[normalized] === undefined) {
      result[normalized] = v;
    }
  }
  if (typeof result["side"] === "string") {
    result["side"] = normalizeSide(result["side"]);
  }
  // Ensure ticket is a string
  if (result["ticket"] !== undefined) {
    result["ticket"] = String(result["ticket"]);
  }
  return result;
}

router.get("/trades", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = ListTradesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { page, pageSize, symbol, side, search } = parsed.data;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(tradesTable.userId, req.userId!)];
  if (symbol) conditions.push(eq(tradesTable.symbol, symbol));
  if (side) conditions.push(eq(tradesTable.side, side));
  if (search) {
    conditions.push(
      or(
        ilike(tradesTable.symbol, `%${search}%`),
        ilike(tradesTable.ticket, `%${search}%`),
        ilike(tradesTable.notes ?? sql`''`, `%${search}%`),
      )!
    );
  }

  const where = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tradesTable)
    .where(where);

  const trades = await db
    .select()
    .from(tradesTable)
    .where(where)
    .orderBy(desc(tradesTable.closeTime))
    .limit(pageSize)
    .offset(offset);

  const totalPages = Math.ceil(count / pageSize);

  res.json({ trades, total: count, page, pageSize, totalPages });
});

router.post("/trades", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateTradeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [trade] = await db
    .insert(tradesTable)
    .values({ ...parsed.data, userId: req.userId! })
    .returning();

  res.status(201).json(trade);
});

router.post("/trades/import", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = ImportTradesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const rawTrade of parsed.data.trades) {
    try {
      const normalized = normalizeRawTrade(rawTrade as Record<string, unknown>);
      const tradeParsed = CreateTradeBody.safeParse(normalized);
      if (!tradeParsed.success) {
        errors.push(`Trade ${normalized["ticket"] ?? "?"}: ${tradeParsed.error.message}`);
        continue;
      }

      const existing = await db
        .select({ id: tradesTable.id })
        .from(tradesTable)
        .where(and(eq(tradesTable.userId, req.userId!), eq(tradesTable.ticket, tradeParsed.data.ticket)));

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await db.insert(tradesTable).values({ ...tradeParsed.data, userId: req.userId! });
      imported++;
    } catch (e) {
      errors.push(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  res.json({ imported, skipped, errors });
});

router.get("/trades/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const params = GetTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [trade] = await db
    .select()
    .from(tradesTable)
    .where(and(eq(tradesTable.id, params.data.id), eq(tradesTable.userId, req.userId!)));

  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  res.json(trade);
});

router.delete("/trades/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const params = DeleteTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [trade] = await db
    .delete(tradesTable)
    .where(and(eq(tradesTable.id, params.data.id), eq(tradesTable.userId, req.userId!)))
    .returning();

  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
