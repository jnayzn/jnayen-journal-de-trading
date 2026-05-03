import { 
  useGetStatsSummary, 
  getGetStatsSummaryQueryKey,
  useGetStatsEquity,
  getGetStatsEquityQueryKey,
  useGetStatsBySymbol,
  getGetStatsBySymbolQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from "recharts";
import { motion } from "framer-motion";

function formatCurrency(val: number | undefined) {
  if (val === undefined || isNaN(val)) return "$0.00";
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    signDisplay: 'exceptZero'
  }).format(val);
}

function StatCard({ title, value, className = "", isLoading = false }: { title: string, value: React.ReactNode, className?: string, isLoading?: boolean }) {
  return (
    <Card className={`border-border/40 shadow-sm bg-card/60 backdrop-blur-sm ${className}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-mono tracking-wider uppercase text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold tracking-tight font-mono">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetStatsSummary(undefined, { 
    query: { queryKey: getGetStatsSummaryQueryKey() } 
  });
  
  const { data: equityData, isLoading: isLoadingEquity } = useGetStatsEquity(undefined, {
    query: { queryKey: getGetStatsEquityQueryKey() }
  });

  const { data: symbolStats, isLoading: isLoadingSymbols } = useGetStatsBySymbol(undefined, {
    query: { queryKey: getGetStatsBySymbolQueryKey() }
  });

  const pnlColorClass = summary && summary.totalPnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]";
  const winRateColorClass = summary && summary.winRate >= 0.5 ? "text-[#22c55e]" : "text-[#ef4444]";
  const pfColorClass = summary && summary.profitFactor >= 1.5 ? "text-[#22c55e]" : summary && summary.profitFactor >= 1.0 ? "text-primary" : "text-[#ef4444]";

  const topSymbols = symbolStats ? [...symbolStats].sort((a, b) => b.totalPnl - a.totalPnl).slice(0, 5) : [];
  const worstSymbols = symbolStats ? [...symbolStats].sort((a, b) => a.totalPnl - b.totalPnl).slice(0, 5) : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight mb-1">Terminal Overview</h2>
        <p className="text-muted-foreground font-mono text-sm tracking-wider uppercase">Real-time performance metrics</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard 
          title="Total Net PnL" 
          value={<span className={pnlColorClass}>{formatCurrency(summary?.totalPnl)}</span>} 
          isLoading={isLoadingSummary}
        />
        <StatCard 
          title="Win Rate" 
          value={<span className={winRateColorClass}>{summary ? `${(summary.winRate * 100).toFixed(1)}%` : "0.0%"}</span>} 
          isLoading={isLoadingSummary}
        />
        <StatCard 
          title="Profit Factor" 
          value={<span className={pfColorClass}>{summary ? summary.profitFactor.toFixed(2) : "0.00"}</span>} 
          isLoading={isLoadingSummary}
        />
        <StatCard 
          title="Expectancy" 
          value={formatCurrency(summary?.expectancy)} 
          isLoading={isLoadingSummary}
        />
        <StatCard 
          title="Total Trades" 
          value={summary?.totalTrades?.toString() || "0"} 
          isLoading={isLoadingSummary}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">Equity Curve</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingEquity ? (
              <Skeleton className="h-[300px] w-full" />
            ) : equityData && equityData.length > 0 ? (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `$${val}`}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      itemStyle={{ color: 'hsl(var(--foreground))', fontFamily: 'monospace' }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))', fontFamily: 'monospace', marginBottom: '4px' }}
                      formatter={(value: number) => [formatCurrency(value), 'Equity']}
                      labelFormatter={(label) => new Date(label).toLocaleString()}
                    />
                    <Area 
                      type="stepAfter" 
                      dataKey="equity" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorEquity)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] w-full flex items-center justify-center text-muted-foreground font-mono text-sm">
                No equity data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">Top Symbols</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSymbols ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : topSymbols.length > 0 ? (
              <div className="space-y-4">
                {topSymbols.map((sym, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={sym.symbol} 
                    className="flex items-center justify-between p-2 rounded bg-background/50 border border-border/50"
                  >
                    <div>
                      <div className="font-bold font-mono text-sm">{sym.symbol}</div>
                      <div className="text-xs text-muted-foreground font-mono">{sym.trades} trades</div>
                    </div>
                    <div className={`font-mono font-bold ${sym.totalPnl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                      {formatCurrency(sym.totalPnl)}
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
               <div className="h-[200px] flex items-center justify-center text-muted-foreground font-mono text-sm">
                No symbol data
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
