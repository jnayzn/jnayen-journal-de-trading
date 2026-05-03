import { useState, useCallback, useMemo } from "react";
import {
  useGetStatsEquity,
  getGetStatsEquityQueryKey,
  useGetStatsSummary,
  getGetStatsSummaryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain, Sparkles, RefreshCw, TrendingUp, AlertTriangle,
  Target, BarChart2, Shield, LineChart, Activity, TrendingDown,
  Layers, Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const TOKEN_KEY = "tradej_token";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", signDisplay: "exceptZero",
  }).format(v);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px", fontFamily: "monospace" },
  itemStyle: { color: "hsl(var(--foreground))" },
  labelStyle: { color: "hsl(var(--muted-foreground))", marginBottom: "4px" },
};

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface EquityPoint { date: string; equity: number; profit: number; symbol: string }
interface AiStats {
  winRate: number; profitFactor: number; expectancy: number;
  rr: number; drawdown: number; totalTrades: number;
}
type Status = "idle" | "loading" | "streaming" | "done" | "error";

// ─── Derived data ────────────────────────────────────────────────────────────

function computeDrawdown(data: EquityPoint[]) {
  let peak = -Infinity;
  return data.map((p) => {
    if (p.equity > peak) peak = p.equity;
    const dd = peak > 0 ? ((p.equity - peak) / peak) * 100 : 0;
    return { date: p.date, drawdown: Math.round(dd * 100) / 100 };
  });
}

function buildHistogram(data: EquityPoint[], bins = 12) {
  if (!data.length) return [];
  const profits = data.map((d) => d.profit);
  const min = Math.min(...profits);
  const max = Math.max(...profits);
  if (min === max) return [{ label: fmt(min), count: profits.length, positive: min >= 0 }];
  const size = (max - min) / bins;
  return Array.from({ length: bins }, (_, i) => {
    const lo = min + i * size;
    const hi = lo + size;
    const count = profits.filter((p) => (i === bins - 1 ? p <= hi : p < hi) && p >= lo).length;
    const mid = (lo + hi) / 2;
    return { label: fmt(mid), count, positive: mid >= 0 };
  }).filter((b) => b.count > 0);
}

// ─── Stat badge ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, good, icon }: { label: string; value: string; good: boolean | null; icon: React.ReactNode }) {
  const [bg, border, text] =
    good === true  ? ["bg-[#22c55e]/8",  "border-[#22c55e]/30", "text-[#22c55e]"]  :
    good === false ? ["bg-[#ef4444]/8",  "border-[#ef4444]/30", "text-[#ef4444]"]  :
                    ["bg-[#eab308]/8",  "border-[#eab308]/30", "text-[#eab308]"];
  return (
    <div className={`rounded-xl border ${bg} ${border} p-4 flex flex-col gap-2`}>
      <div className={`flex items-center gap-2 text-xs font-mono uppercase tracking-widest opacity-60 ${text}`}>
        {icon}
        {label}
      </div>
      <p className={`text-2xl font-bold font-mono tracking-tight ${text}`}>{value}</p>
    </div>
  );
}

// ─── Chart wrapper ───────────────────────────────────────────────────────────

function ChartCard({ title, icon, children, isLoading, height = 220 }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; isLoading?: boolean; height?: number;
}) {
  return (
    <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          {icon}{title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-4">
        {isLoading ? (
          <Skeleton style={{ height }} className="w-full rounded-lg" />
        ) : (
          <div style={{ height }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              {children as React.ReactElement}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Markdown renderer ───────────────────────────────────────────────────────

const CHART_ICONS: Record<string, React.ReactNode> = {
  line: <LineChart className="h-3.5 w-3.5" />,
  area: <Activity className="h-3.5 w-3.5" />,
  bar:  <BarChart2 className="h-3.5 w-3.5" />,
  histogram: <BarChart2 className="h-3.5 w-3.5" />,
  pie:  <Layers className="h-3.5 w-3.5" />,
};
function chartIcon(type: string) {
  const key = Object.keys(CHART_ICONS).find((k) => type.toLowerCase().includes(k));
  return key ? CHART_ICONS[key] : <BarChart2 className="h-3.5 w-3.5" />;
}

interface ChartBlock { name: string; type: string; data: string; insight: string }
function parseChart(lines: string[], idx: number): { block: ChartBlock; end: number } | null {
  const m = lines[idx].match(/^\*\s+Chart:\s*(.+)$/i);
  if (!m) return null;
  const block: ChartBlock = { name: m[1].trim(), type: "", data: "", insight: "" };
  let i = idx + 1;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.startsWith("  ") && l.trim() !== "") break;
    const tm = l.match(/^\s+Type:\s*(.+)$/i);
    const dm = l.match(/^\s+Data:\s*(.+)$/i);
    const im = l.match(/^\s+Insight:\s*(.+)$/i);
    if (tm) block.type = tm[1].trim();
    else if (dm) block.data = dm[1].trim();
    else if (im) block.insight = im[1].trim();
    i++;
  }
  if (!block.type && !block.data && !block.insight) return null;
  return { block, end: i - 1 };
}

function inlineText(raw: string) {
  return raw.split(/\*\*(.*?)\*\*/g).map((p, j) =>
    j % 2 === 1 ? <strong key={j} className="text-foreground font-semibold">{p}</strong> : p
  );
}

function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={i} className="font-bold text-primary font-mono uppercase tracking-widest text-[11px] mt-7 mb-3 border-b border-primary/20 pb-1.5 flex items-center gap-2">
          <Zap className="h-3 w-3" />{line.slice(4)}
        </h3>
      );
      i++; continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={i} className="font-bold text-foreground text-sm mt-5 mb-2">{line.slice(3)}</h2>
      );
      i++; continue;
    }
    if ((line.startsWith("* Chart:") || line.startsWith("* chart:")) && lines[i + 1]?.startsWith("  ")) {
      const res = parseChart(lines, i);
      if (res) {
        nodes.push(
          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="border border-primary/20 rounded-xl bg-primary/5 p-4 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-primary font-bold text-sm font-mono">
                {chartIcon(res.block.type)}{res.block.name}
              </span>
              <Badge variant="outline" className="font-mono text-[10px] border-primary/25 text-primary/70 shrink-0">
                {res.block.type}
              </Badge>
            </div>
            {res.block.data && (
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span className="font-mono text-primary/50 font-bold shrink-0 w-12">DATA</span>
                <span>{res.block.data}</span>
              </div>
            )}
            {res.block.insight && (
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span className="font-mono text-primary/50 font-bold shrink-0 w-12">WHY</span>
                <span>{res.block.insight}</span>
              </div>
            )}
          </motion.div>
        );
        i = res.end + 1; continue;
      }
    }
    if (line.match(/^\s+(Type|Data|Insight):/i)) { i++; continue; }
    if (line.startsWith("* ") || line.startsWith("- ")) {
      nodes.push(
        <div key={i} className="flex gap-2.5 items-start">
          <span className="text-primary mt-0.5 shrink-0 text-xs">▸</span>
          <span className="text-muted-foreground text-sm leading-relaxed">{inlineText(line.replace(/^[*-] /, ""))}</span>
        </div>
      );
      i++; continue;
    }
    if (line.trim() === "") { nodes.push(<div key={i} className="h-1" />); i++; continue; }
    nodes.push(
      <p key={i} className="text-muted-foreground text-sm leading-relaxed">{inlineText(line)}</p>
    );
    i++;
  }
  return <div className="space-y-2">{nodes}</div>;
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AiAnalysis() {
  const [status, setStatus]   = useState<Status>("idle");
  const [aiStats, setAiStats] = useState<AiStats | null>(null);
  const [analysis, setAnalysis] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: equityData, isLoading: loadingEquity } = useGetStatsEquity(undefined, {
    query: { queryKey: getGetStatsEquityQueryKey() },
  });
  const { data: summary, isLoading: loadingSummary } = useGetStatsSummary(undefined, {
    query: { queryKey: getGetStatsSummaryQueryKey() },
  });

  const drawdownData = useMemo(() =>
    equityData ? computeDrawdown(equityData as EquityPoint[]) : [],
    [equityData]
  );
  const histogramData = useMemo(() =>
    equityData ? buildHistogram(equityData as EquityPoint[]) : [],
    [equityData]
  );
  const perTradeData = useMemo(() =>
    equityData ? (equityData as EquityPoint[]).map((d, i) => ({
      trade: i + 1,
      profit: Math.round(d.profit * 100) / 100,
      symbol: d.symbol,
    })) : [],
    [equityData]
  );
  const winLossData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: "Avg Win",  value: Math.abs(summary.avgWin),  fill: "#22c55e" },
      { name: "Avg Loss", value: Math.abs(summary.avgLoss), fill: "#ef4444" },
    ];
  }, [summary]);

  const startAnalysis = useCallback(() => {
    setStatus("loading");
    setAnalysis("");
    setAiStats(null);
    setErrorMsg("");

    const token = localStorage.getItem(TOKEN_KEY) ?? "";
    fetch(`${BASE_URL}/api/analysis/stream`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErrorMsg((d as { error?: string }).error ?? "Analysis failed.");
        setStatus("error");
        return;
      }
      if (!res.body) { setErrorMsg("Streaming not supported."); setStatus("error"); return; }

      setStatus("streaming");
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(chunk.slice(6)) as { type: string; stats?: AiStats; content?: string; message?: string };
            if (ev.type === "stats" && ev.stats)    setAiStats(ev.stats);
            else if (ev.type === "token" && ev.content) setAnalysis((p) => p + ev.content);
            else if (ev.type === "done")             setStatus("done");
            else if (ev.type === "error")            { setErrorMsg(ev.message ?? "Unknown error"); setStatus("error"); }
          } catch { /* ignore */ }
        }
      }
      setStatus((s) => (s === "streaming" ? "done" : s));
    }).catch(() => { setErrorMsg("Connection failed. Please try again."); setStatus("error"); });
  }, []);

  const wr    = aiStats?.winRate    ?? 0;
  const pf    = aiStats?.profitFactor ?? 0;
  const rr    = aiStats?.rr         ?? 0;
  const dd    = aiStats?.drawdown   ?? 0;
  const exp   = aiStats?.expectancy ?? 0;
  const tot   = aiStats?.totalTrades ?? 0;

  const hasData  = equityData && equityData.length > 0;
  const isLoading = loadingEquity || loadingSummary;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            AI Analysis
          </h2>
          <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
            Performance evaluation · charts · diagnosis
          </p>
        </div>
        <Button
          onClick={startAnalysis}
          disabled={status === "loading" || status === "streaming"}
          size="sm"
          className="gap-2 font-mono uppercase tracking-wider text-xs shrink-0"
        >
          {status === "loading" || status === "streaming"
            ? <><RefreshCw className="h-4 w-4 animate-spin" />Analyzing…</>
            : <><Sparkles className="h-4 w-4" />{status === "done" || status === "error" ? "Re-analyze" : "Run Analysis"}</>}
        </Button>
      </div>

      {/* ── AI Metric cards (shown after analysis) ── */}
      <AnimatePresence>
        {aiStats && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard label="Trades"      value={String(tot)} good={tot >= 20 ? true : null}                                          icon={<BarChart2 className="h-3 w-3" />} />
              <MetricCard label="Win Rate"    value={`${(wr * 100).toFixed(1)}%`} good={wr >= 0.6 ? true : wr >= 0.4 ? null : false}     icon={<TrendingUp className="h-3 w-3" />} />
              <MetricCard label="Prof. Factor" value={pf.toFixed(2)} good={pf >= 2 ? true : pf >= 1.5 ? null : false}                     icon={<Zap className="h-3 w-3" />} />
              <MetricCard label="Expectancy"  value={fmt(exp)} good={exp > 0.2 ? true : exp > 0 ? null : false}                          icon={<Target className="h-3 w-3" />} />
              <MetricCard label="Risk/Reward" value={`${rr.toFixed(2)}R`} good={rr >= 1.5 ? true : rr >= 1 ? null : false}              icon={<Layers className="h-3 w-3" />} />
              <MetricCard label="Max Drawdown" value={`${dd.toFixed(1)}%`} good={dd <= 10 ? true : dd <= 20 ? null : false}              icon={<TrendingDown className="h-3 w-3" />} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Charts section — always visible ── */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          {[220, 200, 200, 200, 200].map((h, i) => (
            <Skeleton key={i} style={{ height: h }} className={`rounded-xl ${i === 0 ? "md:col-span-2" : ""}`} />
          ))}
        </div>
      )}

      {!isLoading && hasData && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

          {/* Row 1 — Equity Curve (full width) */}
          <ChartCard title="Equity Curve" icon={<LineChart className="h-3.5 w-3.5" />} height={240}>
            <AreaChart data={equityData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey="date" tickFormatter={fmtDate} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} domain={["auto", "auto"]} />
              <RechartTooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmt(v), "Equity"]} labelFormatter={fmtDate} />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="4 2" />
              <Area type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#eqGrad)" dot={false} />
            </AreaChart>
          </ChartCard>

          {/* Row 2 — Drawdown | Win vs Loss */}
          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard title="Drawdown Curve" icon={<TrendingDown className="h-3.5 w-3.5" />} height={210}>
              <AreaChart data={drawdownData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="date" tickFormatter={fmtDate} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toFixed(1)}%`} domain={["auto", 0]} />
                <RechartTooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(2)}%`, "Drawdown"]} labelFormatter={fmtDate} />
                <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={2} fill="url(#ddGrad)" dot={false} />
              </AreaChart>
            </ChartCard>

            <ChartCard title="Win vs Loss — Avg Size" icon={<Target className="h-3.5 w-3.5" />} height={210}>
              <BarChart data={winLossData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <RechartTooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmt(v), "Average"]} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={80}>
                  {winLossData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ChartCard>
          </div>

          {/* Row 3 — Performance per Trade | Profit Distribution */}
          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard title="Performance per Trade" icon={<BarChart2 className="h-3.5 w-3.5" />} height={210}>
              <BarChart data={perTradeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="trade" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} label={{ value: "Trade #", position: "insideBottom", offset: -2, fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <RechartTooltip {...TOOLTIP_STYLE} formatter={(v: number, _: string, p: { payload: { symbol: string } }) => [fmt(v), p.payload.symbol]} labelFormatter={(l) => `Trade #${l}`} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="4 2" />
                <Bar dataKey="profit" radius={[3, 3, 0, 0]}>
                  {perTradeData.map((d, i) => <Cell key={i} fill={d.profit >= 0 ? "#22c55e" : "#ef4444"} />)}
                </Bar>
              </BarChart>
            </ChartCard>

            <ChartCard title="Profit Distribution" icon={<Activity className="h-3.5 w-3.5" />} height={210}>
              <BarChart data={histogramData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <RechartTooltip {...TOOLTIP_STYLE} formatter={(v: number) => [v, "Trades"]} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {histogramData.map((d, i) => <Cell key={i} fill={d.positive ? "#22c55e" : "#ef4444"} />)}
                </Bar>
              </BarChart>
            </ChartCard>
          </div>
        </motion.div>
      )}

      {!isLoading && !hasData && status === "idle" && (
        <Card className="border-border/40 bg-card/60">
          <CardContent className="py-16 text-center">
            <Brain className="h-14 w-14 text-primary/20 mx-auto mb-5" />
            <h3 className="font-bold text-lg mb-2">No trading data yet</h3>
            <p className="text-muted-foreground font-mono text-sm">Import your trades to unlock charts and AI analysis.</p>
          </CardContent>
        </Card>
      )}

      {/* ── AI Loading ── */}
      {status === "loading" && (
        <Card className="border-border/40 bg-card/60">
          <CardContent className="py-10 text-center space-y-3">
            <div className="relative mx-auto w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Brain className="h-6 w-6 text-primary animate-pulse" />
              </div>
            </div>
            <p className="text-muted-foreground font-mono text-sm">Computing statistics…</p>
            <p className="text-muted-foreground/50 font-mono text-xs">The AI is reading your performance data</p>
          </CardContent>
        </Card>
      )}

      {/* ── AI Report ── */}
      <AnimatePresence>
        {(status === "streaming" || status === "done") && analysis && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
              <CardHeader className="border-b border-border/30 pb-4 bg-gradient-to-r from-primary/5 to-transparent">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    AI Evaluation Report
                  </CardTitle>
                  {status === "streaming" ? (
                    <Badge variant="outline" className="font-mono text-[10px] border-primary/40 text-primary animate-pulse gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      Generating
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="font-mono text-[10px] border-[#22c55e]/40 text-[#22c55e] gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                      Complete
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-6 pb-8">
                <MarkdownRenderer text={analysis} />
                {status === "streaming" && (
                  <span className="inline-block w-2 h-4 bg-primary/80 animate-pulse ml-1 rounded-sm align-middle" />
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Idle CTA (only when no data analysis run yet) ── */}
      {status === "idle" && hasData && (
        <Card className="border-border/40 bg-card/60 border-dashed">
          <CardContent className="py-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-3">
              <Brain className="h-5 w-5 text-primary/50" />
              <p className="text-muted-foreground font-mono text-sm">
                Charts loaded — run AI analysis for full diagnosis & recommendations
              </p>
            </div>
            <Button onClick={startAnalysis} variant="outline" size="sm" className="gap-2 font-mono text-xs uppercase tracking-wider border-primary/30 text-primary hover:bg-primary/10">
              <Sparkles className="h-3.5 w-3.5" />
              Generate AI Report
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Error ── */}
      {status === "error" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="border-[#ef4444]/30 bg-[#ef4444]/5">
            <CardContent className="py-8 text-center">
              <AlertTriangle className="h-8 w-8 text-[#ef4444] mx-auto mb-3" />
              <p className="text-[#ef4444] font-mono text-sm">{errorMsg}</p>
              <Button onClick={startAnalysis} variant="outline" size="sm" className="mt-4 font-mono text-xs border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/10">
                Try again
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
