import { Router, type IRouter } from "express";
import { db, tradesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

function buildPrompt(stats: {
  winRate: number;
  profitFactor: number;
  expectancy: number;
  rr: number;
  drawdown: number;
  totalTrades: number;
}): string {
  return `You are an expert trading coach. Analyze these stats and give a SHORT, punchy diagnosis. No fluff, no filler.

Stats: Win Rate ${(stats.winRate * 100).toFixed(1)}% | Profit Factor ${stats.profitFactor} | Expectancy ${stats.expectancy} | R/R ${stats.rr} | Max Drawdown ${stats.drawdown.toFixed(1)}% | Trades ${stats.totalTrades}

Reply in exactly 3 sections. Each section must be SHORT (2-4 lines max). Use plain language. No markdown headers beyond ### numbers. No --- separators.

### 1. Verdict
One sentence on the trader profile. Then 1-2 sentences on the biggest strength and biggest weakness based on the actual numbers.

### 2. Critical Issues
3 bullet points max. Each bullet = one specific problem with the exact number that proves it. No generic advice.

### 3. Priority Action
1 concrete thing to fix first. Make it specific and actionable in one sentence.`;
}

router.get("/analysis/stream", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const trades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.userId, req.userId!))
    .orderBy(tradesTable.closeTime);

  if (trades.length < 3) {
    res.status(400).json({ error: "Not enough trades. Import at least 3 trades to get an AI analysis." });
    return;
  }

  const winning = trades.filter((t) => t.profit > 0);
  const losing = trades.filter((t) => t.profit <= 0);

  const winRate = winning.length / trades.length;
  const grossWins = winning.reduce((s, t) => s + t.profit, 0);
  const grossLosses = Math.abs(losing.reduce((s, t) => s + t.profit, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 99 : 0;
  const avgWin = winning.length > 0 ? grossWins / winning.length : 0;
  const avgLoss = losing.length > 0 ? grossLosses / losing.length : 0;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
  const rr = avgLoss > 0 ? avgWin / avgLoss : 0;

  // Max drawdown calculation from equity curve
  let peak = 0;
  let equity = 0;
  let maxDrawdown = 0;
  for (const t of trades) {
    equity += t.profit + t.commission + t.swap;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((equity - peak) / peak) * 100 : 0;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  const stats = {
    winRate: Math.round(winRate * 10000) / 10000,
    profitFactor: Math.round(profitFactor * 100) / 100,
    expectancy: Math.round(expectancy * 100) / 100,
    rr: Math.round(rr * 100) / 100,
    drawdown: Math.abs(Math.round(maxDrawdown * 100) / 100),
    totalTrades: trades.length,
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send the computed stats first so the frontend can display them
  res.write(`data: ${JSON.stringify({ type: "stats", stats })}\n\n`);

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: buildPrompt(stats) }],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ type: "token", content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", message: "AI analysis failed. Please try again." })}\n\n`);
  }

  res.end();
});

export default router;
