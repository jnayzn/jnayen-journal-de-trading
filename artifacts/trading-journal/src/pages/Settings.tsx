import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRegenerateToken } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Copy, RefreshCw, LogOut, Loader2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { motion } from "framer-motion";

export default function Settings() {
  const { user, logout, updateUser } = useAuth();
  const { toast } = useToast();
  const regenerateMutation = useRegenerateToken();
  
  const [showToken, setShowToken] = useState(false);

  const handleCopyToken = () => {
    if (user?.token) {
      navigator.clipboard.writeText(user.token);
      toast({
        title: "Copied to clipboard",
        description: "API token has been copied to your clipboard.",
      });
    }
  };

  const handleRegenerateToken = () => {
    regenerateMutation.mutate(undefined, {
      onSuccess: (data) => {
        toast({
          title: "Token Regenerated",
          description: "Your new API token is ready to use. Old tokens are now invalid.",
        });
        updateUser(data);
        setShowToken(true);
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Failed to regenerate",
          description: err?.data?.error || "Unknown error occurred.",
        });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight mb-1">System Configuration</h2>
        <p className="text-muted-foreground font-mono text-sm tracking-wider uppercase">Identity & API Access</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-mono uppercase tracking-widest text-sm text-primary">Identity Profile</CardTitle>
            <CardDescription className="font-mono text-xs">Your core trading identity details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Trader ID (Username)</Label>
              <Input 
                value={user?.username || ""} 
                disabled 
                className="bg-background/50 font-mono border-border/40 font-bold"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Account Created</Label>
              <Input 
                value={user?.createdAt ? new Date(user.createdAt).toLocaleString() : ""} 
                disabled 
                className="bg-background/50 font-mono border-border/40"
              />
            </div>
          </CardContent>
          <CardFooter className="border-t border-border/40 pt-6">
            <Button variant="destructive" onClick={logout} className="font-mono uppercase tracking-wider font-bold">
              <LogOut className="mr-2 h-4 w-4" />
              Terminate Session
            </Button>
          </CardFooter>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-mono uppercase tracking-widest text-sm text-primary">API Connectivity</CardTitle>
            <CardDescription className="font-mono text-xs">
              Use this token to authenticate external platforms like MT5 EAs or scripts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Bearer Token</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input 
                    type={showToken ? "text" : "password"} 
                    value={user?.token || ""} 
                    readOnly
                    className="bg-background/50 font-mono border-border/40 pr-10 tracking-widest"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button variant="outline" onClick={handleCopyToken} className="border-border/40 font-mono uppercase tracking-wider">
                  <Copy className="mr-2 h-4 w-4" /> Copy
                </Button>
              </div>
            </div>

            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4">
              <h4 className="font-bold text-destructive font-mono text-sm uppercase tracking-wider mb-2 flex items-center">
                <AlertTriangle className="mr-2 h-4 w-4" /> Danger Zone
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Regenerating your token will immediately invalidate your current token. Any active scripts or EAs will fail until updated.
              </p>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="font-mono uppercase tracking-wider text-xs">
                    <RefreshCw className="mr-2 h-4 w-4" /> Regenerate Token
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-border/50">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-mono uppercase tracking-wider">Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription className="font-mono text-sm">
                      This action cannot be undone. This will permanently invalidate your current API token.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="font-mono uppercase tracking-wider text-xs">Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleRegenerateToken} 
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono uppercase tracking-wider text-xs"
                      disabled={regenerateMutation.isPending}
                    >
                      {regenerateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Execute
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
