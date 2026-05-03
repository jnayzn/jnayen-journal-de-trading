import { useState } from "react";
import { 
  useListTrades, 
  getListTradesQueryKey,
  useImportTrades,
  useDeleteTrade,
  ListTradesSide
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Download, Search, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

function formatCurrency(val: number | undefined) {
  if (val === undefined || isNaN(val)) return "$0.00";
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    signDisplay: 'exceptZero'
  }).format(val);
}

export default function Trades() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [side, setSide] = useState<ListTradesSide | "ALL">("ALL");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importData, setImportData] = useState("");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const importMutation = useImportTrades();
  const deleteMutation = useDeleteTrade();

  const queryParams = {
    page,
    pageSize: 50,
    search: search || undefined,
    side: side === "ALL" ? undefined : side
  };

  const { data, isLoading } = useListTrades(queryParams, {
    query: { queryKey: getListTradesQueryKey(queryParams) }
  });

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importData);
      if (!Array.isArray(parsed)) {
        throw new Error("Must be an array of trades");
      }
      
      importMutation.mutate({ data: { trades: parsed } }, {
        onSuccess: (res) => {
          toast({
            title: "Import Complete",
            description: `Imported ${res.imported} trades. Skipped: ${res.skipped}.`,
          });
          setIsImportOpen(false);
          setImportData("");
          queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Import Failed",
            description: err?.data?.error || "Invalid format",
          });
        }
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "JSON Parse Error",
        description: e instanceof Error ? e.message : "Invalid JSON",
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this trade?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Trade Deleted" });
          queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-1">Execution Log</h2>
          <p className="text-muted-foreground font-mono text-sm tracking-wider uppercase">Historical trade data</p>
        </div>
        
        <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="font-mono text-xs uppercase tracking-wider">
              <Download className="mr-2 h-4 w-4" /> Import Data
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] border-border/50 bg-card/95 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle className="font-mono uppercase tracking-wider">Import Trades</DialogTitle>
              <DialogDescription className="text-muted-foreground font-mono text-xs">
                Paste a JSON array of trades exported from MT5 or compatible systems.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Textarea 
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder="[ { ticket: '12345', symbol: 'EURUSD', side: 'BUY', volume: 1.0, ... } ]"
                className="min-h-[300px] font-mono text-sm bg-background/50 border-border/50"
              />
              <Button 
                onClick={handleImport} 
                disabled={importMutation.isPending || !importData.trim()}
                className="w-full font-mono uppercase tracking-wider"
              >
                {importMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Execute Import
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search symbol, ticket..." 
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 font-mono bg-card/60 backdrop-blur-sm border-border/40"
          />
        </div>
        <Select value={side} onValueChange={(v: any) => { setSide(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[180px] font-mono bg-card/60 backdrop-blur-sm border-border/40">
            <SelectValue placeholder="Side" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">ALL SIDES</SelectItem>
            <SelectItem value="BUY">BUY</SelectItem>
            <SelectItem value="SELL">SELL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-background/50">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider">Ticket</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Symbol</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Side</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Volume</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Open</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Close</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-right">PnL</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Open Time</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : data?.trades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center font-mono text-sm text-muted-foreground">
                    NO EXECUTIONS FOUND
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence>
                  {data?.trades.map((trade, i) => (
                    <motion.tr 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      key={trade.id} 
                      className="border-border/40 hover:bg-muted/50 transition-colors group"
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">{trade.ticket}</TableCell>
                      <TableCell className="font-mono font-bold">{trade.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-mono text-[10px] uppercase border-0 rounded ${trade.side === 'BUY' ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'}`}>
                          {trade.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-right">{trade.volume.toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-right">{trade.openPrice}</TableCell>
                      <TableCell className="font-mono text-right">{trade.closePrice}</TableCell>
                      <TableCell className={`font-mono font-bold text-right ${trade.profit >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                        {formatCurrency(trade.profit)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {format(new Date(trade.openTime), "MMM d, HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/20"
                          onClick={() => handleDelete(trade.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between font-mono text-xs text-muted-foreground uppercase tracking-wider">
          <div>Page {data.page} of {data.totalPages}</div>
          <div className="space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="bg-card/60 border-border/40 font-mono uppercase tracking-wider"
            >
              Prev
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="bg-card/60 border-border/40 font-mono uppercase tracking-wider"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
