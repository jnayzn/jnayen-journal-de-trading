import { 
  useGetStatsInsights, 
  getGetStatsInsightsQueryKey,
  useGetStatsBySymbol,
  getGetStatsBySymbolQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, Info, Loader2, TrendingUp, AlertTriangle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
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

export default function Analytics() {
  const { data: insights, isLoading: isLoadingInsights } = useGetStatsInsights(undefined, {
    query: { queryKey: getGetStatsInsightsQueryKey() }
  });

  const { data: symbolStats, isLoading: isLoadingSymbols } = useGetStatsBySymbol(undefined, {
    query: { queryKey: getGetStatsBySymbolQueryKey() }
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'success': return <CheckCircle2 className="h-5 w-5 text-[#22c55e]" />;
      case 'danger': return <AlertCircle className="h-5 w-5 text-[#ef4444]" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-[#eab308]" />;
      default: return <Info className="h-5 w-5 text-primary" />;
    }
  };

  const getSeverityClass = (severity: string) => {
    switch (severity) {
      case 'success': return 'bg-[#22c55e]/10 border-[#22c55e]/30 text-[#22c55e]';
      case 'danger': return 'bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]';
      case 'warning': return 'bg-[#eab308]/10 border-[#eab308]/30 text-[#eab308]';
      default: return 'bg-primary/10 border-primary/30 text-primary';
    }
  };

  const sortedSymbols = symbolStats ? [...symbolStats].sort((a, b) => b.totalPnl - a.totalPnl) : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight mb-1">Advanced Analytics</h2>
        <p className="text-muted-foreground font-mono text-sm tracking-wider uppercase">Behavioral insights & symbol performance</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm md:col-span-1 flex flex-col justify-center items-center p-6 text-center">
          <h3 className="font-mono text-sm uppercase tracking-widest text-muted-foreground mb-4">Trader Score</h3>
          {isLoadingInsights ? (
             <Skeleton className="h-32 w-32 rounded-full" />
          ) : (
            <div className="relative">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-muted/20"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={`${(insights?.score || 0) * 3.51} 351`}
                  className={
                    (insights?.score || 0) >= 80 ? "text-[#22c55e]" : 
                    (insights?.score || 0) >= 50 ? "text-[#eab308]" : "text-[#ef4444]"
                  }
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl font-bold font-mono tracking-tighter">{insights?.score || 0}</span>
              </div>
            </div>
          )}
          <p className="mt-4 font-mono text-xs text-muted-foreground">Based on discipline, consistency, and risk management.</p>
        </Card>

        <Card className="border-border/40 bg-card/60 backdrop-blur-sm md:col-span-2">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase tracking-widest text-muted-foreground">Behavioral Findings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingInsights ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : insights?.findings && insights.findings.length > 0 ? (
              insights.findings.map((finding, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={i} 
                  className={`flex gap-4 p-4 rounded-lg border ${getSeverityClass(finding.severity)}`}
                >
                  <div className="flex-shrink-0 mt-1">
                    {getSeverityIcon(finding.severity)}
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">{finding.title}</h4>
                    <p className="text-sm opacity-80">{finding.description}</p>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="py-8 text-center text-muted-foreground font-mono text-sm">
                Insufficient data to generate insights. Keep trading!
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-mono text-sm uppercase tracking-widest text-muted-foreground">Performance by Symbol</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingSymbols ? (
             <div className="h-[400px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
             </div>
          ) : sortedSymbols.length > 0 ? (
             <div className="h-[400px] w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={sortedSymbols} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                   <XAxis 
                     dataKey="symbol" 
                     stroke="hsl(var(--muted-foreground))"
                     fontSize={12}
                     tickLine={false}
                     axisLine={false}
                     dy={10}
                   />
                   <YAxis 
                     stroke="hsl(var(--muted-foreground))"
                     fontSize={12}
                     tickLine={false}
                     axisLine={false}
                     tickFormatter={(val) => `$${val}`}
                   />
                   <RechartsTooltip 
                     cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
                     contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                     itemStyle={{ color: 'hsl(var(--foreground))', fontFamily: 'monospace' }}
                     labelStyle={{ color: 'hsl(var(--muted-foreground))', fontFamily: 'monospace', marginBottom: '4px', fontWeight: 'bold' }}
                     formatter={(value: number) => [formatCurrency(value), 'Total PnL']}
                   />
                   <Bar dataKey="totalPnl" radius={[4, 4, 0, 0]}>
                     {sortedSymbols.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={entry.totalPnl >= 0 ? "hsl(var(--chart-3))" : "hsl(var(--chart-2))"} />
                     ))}
                   </Bar>
                 </BarChart>
               </ResponsiveContainer>
             </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground font-mono text-sm">
              No symbol performance data available.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
