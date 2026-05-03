import { Router, type IRouter } from "express";
import { db, tradesTable } from "@workspace/db";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { GetStatsCalendarQueryParams } from "@workspace/api-zod";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

router.get("/stats/summary", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const trades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.userId, req.userId!));

  if (trades.length === 0) {
    res.json({
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      profitFactor: 0,
      expectancy: 0,
      avgWin: 0,
      avgLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      avgHoldingTimeHours: 0,
    });
    return;
  }

  const winning = trades.filter((t) => t.profit > 0);
  const losing = trades.filter((t) => t.profit <= 0);

  const totalPnl = trades.reduce((sum, t) => sum + t.profit + t.commission + t.swap, 0);
  const grossWins = winning.reduce((sum, t) => sum + t.profit, 0);
  const grossLosses = Math.abs(losing.reduce((sum, t) => sum + t.profit, 0));

  const winRate = trades.length > 0 ? winning.length / trades.length : 0;
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 999 : 0;
  const avgWin = winning.length > 0 ? grossWins / winning.length : 0;
  const avgLoss = losing.length > 0 ? grossLosses / losing.length : 0;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
  const largestWin = winning.length > 0 ? Math.max(...winning.map((t) => t.profit)) : 0;
  const largestLoss = losing.length > 0 ? Math.min(...losing.map((t) => t.profit)) : 0;

  const totalHoldingMs = trades.reduce(
    (sum, t) => sum + (t.closeTime.getTime() - t.openTime.getTime()),
    0
  );
  const avgHoldingTimeHours = trades.length > 0 ? totalHoldingMs / trades.length / 3600000 : 0;

  res.json({
    totalTrades: trades.length,
    winningTrades: winning.length,
    losingTrades: losing.length,
    winRate: Math.round(winRate * 10000) / 10000,
    totalPnl: Math.round(totalPnl * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    expectancy: Math.round(expectancy * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    largestWin: Math.round(largestWin * 100) / 100,
    largestLoss: Math.round(largestLoss * 100) / 100,
    avgHoldingTimeHours: Math.round(avgHoldingTimeHours * 100) / 100,
  });
});

router.get("/stats/equity", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const trades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.userId, req.userId!))
    .orderBy(tradesTable.closeTime);

  let equity = 0;
  const equityCurve = trades.map((t) => {
    equity += t.profit + t.commission + t.swap;
    return {
      date: t.closeTime,
      equity: Math.round(equity * 100) / 100,
      tradeId: t.id,
      symbol: t.symbol,
      profit: Math.round((t.profit + t.commission + t.swap) * 100) / 100,
    };
  });

  res.json(equityCurve);
});

router.get("/stats/calendar", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = GetStatsCalendarQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { year, month } = parsed.data;
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  const trades = await db
    .select()
    .from(tradesTable)
    .where(
      and(
        eq(tradesTable.userId, req.userId!),
        gte(tradesTable.closeTime, startDate),
        lte(tradesTable.closeTime, endDate)
      )
    );

  // Group by date
  const byDate: Record<string, { pnl: number; trades: number }> = {};
  for (const trade of trades) {
    const dateStr = trade.closeTime.toISOString().split("T")[0];
    if (!byDate[dateStr]) byDate[dateStr] = { pnl: 0, trades: 0 };
    byDate[dateStr].pnl += trade.profit + trade.commission + trade.swap;
    byDate[dateStr].trades += 1;
  }

  const result = Object.entries(byDate).map(([date, data]) => ({
    date,
    pnl: Math.round(data.pnl * 100) / 100,
    trades: data.trades,
  }));

  res.json(result);
});

router.get("/stats/by-symbol", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const trades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.userId, req.userId!));

  const bySymbol: Record<string, { wins: number; losses: number; totalPnl: number; grossWins: number; grossLosses: number }> = {};

  for (const trade of trades) {
    if (!bySymbol[trade.symbol]) {
      bySymbol[trade.symbol] = { wins: 0, losses: 0, totalPnl: 0, grossWins: 0, grossLosses: 0 };
    }
    const net = trade.profit + trade.commission + trade.swap;
    bySymbol[trade.symbol].totalPnl += net;
    if (trade.profit > 0) {
      bySymbol[trade.symbol].wins++;
      bySymbol[trade.symbol].grossWins += trade.profit;
    } else {
      bySymbol[trade.symbol].losses++;
      bySymbol[trade.symbol].grossLosses += Math.abs(trade.profit);
    }
  }

  const result = Object.entries(bySymbol).map(([symbol, data]) => {
    const total = data.wins + data.losses;
    const pf = data.grossLosses > 0 ? data.grossWins / data.grossLosses : data.grossWins > 0 ? 999 : 0;
    return {
      symbol,
      trades: total,
      winRate: total > 0 ? Math.round((data.wins / total) * 10000) / 10000 : 0,
      totalPnl: Math.round(data.totalPnl * 100) / 100,
      avgPnl: total > 0 ? Math.round((data.totalPnl / total) * 100) / 100 : 0,
      profitFactor: Math.round(pf * 100) / 100,
    };
  });

  result.sort((a, b) => b.totalPnl - a.totalPnl);
  res.json(result);
});

router.get("/stats/insights", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const trades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.userId, req.userId!))
    .orderBy(tradesTable.closeTime);

  if (trades.length < 5) {
    res.json({
      score: 50,
      findings: [
        {
          type: "info",
          severity: "info",
          title: "Not enough data",
          description: "Import at least 5 trades to get personalized insights.",
        },
      ],
    });
    return;
  }

  const findings: Array<{ type: string; severity: string; title: string; description: string }> = [];
  let score = 100;

  const winning = trades.filter((t) => t.profit > 0);
  const winRate = winning.length / trades.length;

  // Revenge trading detection: losing trade immediately followed by a trade within 5 min
  let revengeCount = 0;
  for (let i = 0; i < trades.length - 1; i++) {
    if (trades[i].profit < 0) {
      const gapMs = trades[i + 1].openTime.getTime() - trades[i].closeTime.getTime();
      if (gapMs >= 0 && gapMs < 5 * 60 * 1000) {
        revengeCount++;
      }
    }
  }

  if (revengeCount > trades.length * 0.1) {
    score -= 20;
    findings.push({
      type: "revenge_trading",
      severity: "danger",
      title: "Revenge Trading Detected",
      description: `You opened ${revengeCount} trades within 5 minutes of a loss. This is a classic revenge trading pattern that amplifies losses.`,
    });
  }

  // Overtrading: more than 10 trades per day on average
  const byDate: Record<string, number> = {};
  for (const t of trades) {
    const d = t.closeTime.toISOString().split("T")[0];
    byDate[d] = (byDate[d] || 0) + 1;
  }
  const tradingDays = Object.keys(byDate).length;
  const avgTradesPerDay = trades.length / tradingDays;
  if (avgTradesPerDay > 10) {
    score -= 15;
    findings.push({
      type: "overtrading",
      severity: "warning",
      title: "Overtrading",
      description: `You average ${avgTradesPerDay.toFixed(1)} trades per day. Consider focusing on fewer, higher-quality setups.`,
    });
  }

  // Win rate assessment
  if (winRate >= 0.55) {
    findings.push({
      type: "good_discipline",
      severity: "success",
      title: "Strong Win Rate",
      description: `Your win rate of ${(winRate * 100).toFixed(1)}% is above average. Keep maintaining your edge.`,
    });
  } else if (winRate < 0.4) {
    score -= 10;
    findings.push({
      type: "risk_warning",
      severity: "warning",
      title: "Low Win Rate",
      description: `Your win rate is ${(winRate * 100).toFixed(1)}%. Make sure your average win is significantly larger than your average loss.`,
    });
  }

  // Consistency check: are recent trades better than older ones?
  const halfway = Math.floor(trades.length / 2);
  const oldWinRate = trades.slice(0, halfway).filter((t) => t.profit > 0).length / halfway;
  const newWinRate = trades.slice(halfway).filter((t) => t.profit > 0).length / (trades.length - halfway);
  if (newWinRate > oldWinRate + 0.05) {
    findings.push({
      type: "improving",
      severity: "success",
      title: "Improving Performance",
      description: `Your recent win rate (${(newWinRate * 100).toFixed(1)}%) is higher than your earlier performance (${(oldWinRate * 100).toFixed(1)}%). You're getting better.`,
    });
  }

  // Consistent trading
  const profitabledays = Object.values(byDate).filter((_, i) => {
    const dayKey = Object.keys(byDate)[i];
    const dayTrades = trades.filter((t) => t.closeTime.toISOString().split("T")[0] === dayKey);
    return dayTrades.reduce((sum, t) => sum + t.profit, 0) > 0;
  });

  if (tradingDays >= 5 && profitabledays.length / tradingDays >= 0.6) {
    findings.push({
      type: "consistent",
      severity: "success",
      title: "Consistent Profitable Days",
      description: `${Math.round((profitabledays.length / tradingDays) * 100)}% of your trading days are profitable. Great consistency.`,
    });
  }

  if (findings.length === 0) {
    findings.push({
      type: "info",
      severity: "info",
      title: "Keep going",
      description: "No major behavioral patterns detected. Continue logging trades for more specific insights.",
    });
  }

  res.json({ score: Math.max(0, Math.min(100, score)), findings });
});

export default router;
