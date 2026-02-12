import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Tab = "login" | "signup" | "forgot";

export default function Auth() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (authLoading) return null;
  if (user) return <Navigate to="/" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Check your email to confirm your account.");
      setTab("login");
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password reset email sent.");
      setTab("login");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">TimeTracker</span>
          </div>
          <CardTitle className="text-xl">
            {tab === "login" && "Sign In"}
            {tab === "signup" && "Create Account"}
            {tab === "forgot" && "Reset Password"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={tab === "login" ? handleLogin : tab === "signup" ? handleSignUp : handleForgot} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            {tab !== "forgot" && (
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tab === "login" && "Sign In"}
              {tab === "signup" && "Sign Up"}
              {tab === "forgot" && "Send Reset Link"}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm space-y-1">
            {tab === "login" && (
              <>
                <button onClick={() => setTab("forgot")} className="text-muted-foreground hover:text-foreground underline">
                  Forgot password?
                </button>
                <p className="text-muted-foreground">
                  No account?{" "}
                  <button onClick={() => setTab("signup")} className="text-primary underline">
                    Sign up
                  </button>
                </p>
              </>
            )}
            {tab !== "login" && (
              <button onClick={() => setTab("login")} className="text-primary underline">
                Back to sign in
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
