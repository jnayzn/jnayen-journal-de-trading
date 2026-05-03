import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Download, Copy, Wifi, WifiOff, Clock, Terminal, CheckCircle, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

function useBridgeStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["bridge-status"],
    queryFn: async () => {
      const res = await fetch("/api/bridge/status", {
        headers: { Authorization: `Bearer ${localStorage.getItem("tradej_token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch bridge status");
      return res.json() as Promise<{ lastSyncAt: string | null }>;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

function isOnline(lastSyncAt: string | null): boolean {
  if (!lastSyncAt) return false;
  const diffMs = Date.now() - new Date(lastSyncAt).getTime();
  return diffMs < 60 * 1000; // online if synced within last 60s
}

export default function Bridge() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: status, isLoading } = useBridgeStatus();
  const [showToken, setShowToken] = useState(false);

  const token = user?.token ?? "";
  const apiUrl = window.location.origin + "/api";
  const online = isOnline(status?.lastSyncAt ?? null);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied", description: `${label} copied to clipboard.` });
    });
  };

  const handleDownload = async () => {
    const res = await fetch("/api/bridge/download", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Download failed" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tradj_bridge.py";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: "tradj_bridge.py ready to use." });
  };

  const watchCommand = `python tradj_bridge.py --api-url ${apiUrl} --api-token ${showToken ? token : "***YOUR_TOKEN***"} --watch --interval 15`;
  const installCommand = `pip install MetaTrader5 requests`;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight mb-1">MT5 Bridge</h2>
        <p className="text-muted-foreground font-mono text-sm tracking-wider uppercase">
          Connexion automatique MetaTrader 5
        </p>
      </div>

      {/* Status card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className={`border-2 ${online ? "border-green-500/40 bg-green-500/5" : "border-border/40 bg-card/60"}`}>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono uppercase tracking-widest text-sm">Statut Bridge</CardTitle>
              <Badge
                variant={online ? "default" : "secondary"}
                className={`font-mono uppercase text-xs tracking-wider ${online ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-muted text-muted-foreground"}`}
              >
                {online ? <Wifi className="mr-1.5 h-3 w-3" /> : <WifiOff className="mr-1.5 h-3 w-3" />}
                {online ? "Connecté" : "Déconnecté"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
              <Clock className="h-4 w-4" />
              <span>Dernière synchro :</span>
              <span className={`font-semibold ${online ? "text-green-400" : "text-foreground"}`}>
                {isLoading ? "..." : formatRelativeTime(status?.lastSyncAt ?? null)}
              </span>
            </div>
            {!online && (
              <p className="mt-3 text-xs text-muted-foreground">
                Le bridge n'est pas actif. Suis les étapes ci-dessous pour le lancer sur ton PC Windows avec MT5.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Steps */}
      <div className="space-y-4">
        {/* Step 1 */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <Card className="border-border/40 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs flex items-center justify-center font-bold">1</span>
                Télécharge le script bridge
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                Script Python à exécuter sur ton PC Windows où MT5 est installé.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleDownload} className="font-mono uppercase tracking-wider text-xs">
                <Download className="mr-2 h-4 w-4" />
                Télécharger tradj_bridge.py
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Step 2 */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
          <Card className="border-border/40 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs flex items-center justify-center font-bold">2</span>
                Installe les dépendances
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                Dans un terminal PowerShell ou CMD sur ton PC Windows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative group">
                <div className="flex items-center gap-2 rounded-md bg-background border border-border/50 px-4 py-3 font-mono text-sm text-primary">
                  <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                  <code className="flex-1 overflow-x-auto">{installCommand}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={() => copyText(installCommand, "Commande d'installation")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Step 3 */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }}>
          <Card className="border-border/40 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs flex items-center justify-center font-bold">3</span>
                Lance le bridge en mode temps réel
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                Ouvre MT5 d'abord, puis lance cette commande. Les trades se synchronisent toutes les 15 secondes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative group">
                <div className="rounded-md bg-background border border-border/50 px-4 py-3 font-mono text-xs text-primary overflow-x-auto">
                  <div className="flex items-start gap-2">
                    <Terminal className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-muted-foreground">python tradj_bridge.py \</span>
                      <br />
                      <span className="text-muted-foreground pl-4">--api-url </span>
                      <span className="text-cyan-400">{apiUrl}</span>
                      <span className="text-muted-foreground"> \</span>
                      <br />
                      <span className="text-muted-foreground pl-4">--api-token </span>
                      <span className="text-yellow-400">
                        {showToken ? token : token.slice(0, 8) + "•".repeat(16) + token.slice(-4)}
                      </span>
                      <span className="text-muted-foreground"> \</span>
                      <br />
                      <span className="text-muted-foreground pl-4">--watch --interval </span>
                      <span className="text-green-400">15</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={() => copyText(watchCommand, "Commande bridge")}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs border-border/40"
                onClick={() => {
                  setShowToken(!showToken);
                  if (!showToken) {
                    copyText(watchCommand.replace("***YOUR_TOKEN***", token), "Commande complète");
                  }
                }}
              >
                {showToken ? "Masquer" : "Révéler & copier"} le token
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Tips */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.4 }}>
          <Card className="border-border/40 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-400" />
                Conseils
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground font-mono">
                <li className="flex gap-2"><span className="text-primary">•</span> MT5 doit être ouvert et connecté à ton broker avant de lancer le bridge.</li>
                <li className="flex gap-2"><span className="text-primary">•</span> Le bridge synchronise uniquement les positions <strong className="text-foreground">fermées</strong>.</li>
                <li className="flex gap-2"><span className="text-primary">•</span> Laisse le terminal ouvert en arrière-plan pendant ta session de trading.</li>
                <li className="flex gap-2"><span className="text-primary">•</span> Si tu régénères ton token (Settings), mets à jour la commande bridge.</li>
                <li className="flex gap-2"><span className="text-primary">•</span> Utilise <code className="text-yellow-400">--days 90</code> sans <code className="text-yellow-400">--watch</code> pour importer l'historique complet une fois.</li>
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        {/* Requirements */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.5 }}>
          <Card className="border-border/40 bg-card/60 border-amber-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center gap-2 text-amber-400">
                <AlertCircle className="h-4 w-4" />
                Prérequis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm text-muted-foreground font-mono">
                <li className="flex gap-2"><span className="text-amber-400">•</span> Windows 10/11 (le package MetaTrader5 est Windows uniquement)</li>
                <li className="flex gap-2"><span className="text-amber-400">•</span> MetaTrader 5 installé et connecté</li>
                <li className="flex gap-2"><span className="text-amber-400">•</span> Python 3.8+ (<code>python.org</code>)</li>
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
