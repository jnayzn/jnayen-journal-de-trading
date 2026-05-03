import { useState } from "react";
import { 
  useGetStatsCalendar, 
  getGetStatsCalendarQueryKey 
} from "@workspace/api-client-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";

function formatCurrency(val: number | undefined) {
  if (val === undefined || isNaN(val)) return "$0.00";
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    signDisplay: 'exceptZero'
  }).format(val);
}

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1; // 1-indexed

  const { data, isLoading } = useGetStatsCalendar({ year, month }, {
    query: { queryKey: getGetStatsCalendarQueryKey({ year, month }) }
  });

  const [, setLocation] = useLocation();

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  const startDay = getDay(monthStart); // 0 = Sunday
  
  const blanks = Array.from({ length: startDay }, (_, i) => i);

  const getDayData = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return data?.find(d => d.date === dateStr);
  };

  const getPnlColor = (pnl: number | undefined) => {
    if (pnl === undefined) return "bg-card/40 border-border/40 text-muted-foreground";
    if (pnl > 0) {
      // Scale intensity based on value (just a simple approach, in a real app might want min/max bounds)
      return "bg-[#22c55e]/20 border-[#22c55e]/50 text-[#22c55e]";
    }
    if (pnl < 0) {
      return "bg-[#ef4444]/20 border-[#ef4444]/50 text-[#ef4444]";
    }
    return "bg-card/60 border-border/40 text-foreground";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-1">Performance Calendar</h2>
          <p className="text-muted-foreground font-mono text-sm tracking-wider uppercase">Daily PnL Heatmap</p>
        </div>
        
        <div className="flex items-center space-x-4 bg-card/60 border border-border/40 rounded-md p-1 backdrop-blur-sm">
          <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="font-mono font-bold tracking-wider uppercase w-[120px] text-center">
            {format(currentDate, "MMMM yyyy")}
          </div>
          <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-6">
          {isLoading ? (
            <div className="h-[400px] flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2 sm:gap-4">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground py-2">
                  {day}
                </div>
              ))}
              
              {blanks.map(b => (
                <div key={`blank-${b}`} className="min-h-[100px] rounded-md opacity-20 bg-background/30" />
              ))}
              
              <AnimatePresence mode="popLayout">
                {daysInMonth.map((day, i) => {
                  const dayData = getDayData(day);
                  const colorClass = getDayData(day) ? getPnlColor(dayData?.pnl) : "bg-card/40 border-border/40 text-muted-foreground/30";
                  
                  return (
                    <motion.div 
                      key={day.toISOString()}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.01 }}
                      onClick={() => {
                        if (dayData && dayData.trades > 0) {
                          // In a real app we might pass date filter to trades page
                          setLocation('/trades');
                        }
                      }}
                      className={`min-h-[100px] p-2 border rounded-md flex flex-col justify-between transition-all duration-200 ${dayData && dayData.trades > 0 ? 'cursor-pointer hover:brightness-125 hover:shadow-lg' : ''} ${colorClass}`}
                    >
                      <div className="text-right font-mono text-sm opacity-80">
                        {format(day, "d")}
                      </div>
                      
                      {dayData && dayData.trades > 0 && (
                        <div className="text-center pb-1">
                          <div className="font-mono font-bold text-sm sm:text-base">
                            {formatCurrency(dayData.pnl)}
                          </div>
                          <div className="font-mono text-[10px] opacity-80 uppercase tracking-widest mt-1">
                            {dayData.trades} Exec{dayData.trades !== 1 && 's'}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
