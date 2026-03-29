import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Mail, ArrowLeft } from "lucide-react";

export default function Login() {
  const { loginWithGoogle, loginWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");

  // Forgot password
  const [resetEmail, setResetEmail] = useState("");

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch {
      setGoogleLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailLoading(true);
    try {
      await loginWithEmail(loginEmail, loginPassword);
    } catch (err: any) {
      toast.error(err.message || "Inloggen mislukt");
      setEmailLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupPassword !== signupConfirm) {
      toast.error("Wachtwoorden komen niet overeen");
      return;
    }
    if (signupPassword.length < 6) {
      toast.error("Wachtwoord moet minimaal 6 tekens bevatten");
      return;
    }
    setEmailLoading(true);
    try {
      const { needsConfirmation } = await signUpWithEmail(signupEmail, signupPassword, signupName);
      if (needsConfirmation) {
        toast.success("Controleer je e-mail om je account te bevestigen!");
      } else {
        toast.success("Account aangemaakt!");
      }
    } catch (err: any) {
      toast.error(err.message || "Registratie mislukt");
    } finally {
      setEmailLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailLoading(true);
    try {
      await resetPassword(resetEmail);
      toast.success("Wachtwoord-reset link verstuurd naar je e-mail!");
      setShowForgotPassword(false);
    } catch (err: any) {
      toast.error(err.message || "Fout bij verzenden reset-link");
    } finally {
      setEmailLoading(false);
    }
  };

  const GoogleIcon = () => (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );

  if (showForgotPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center space-y-1">
            <CardTitle className="text-2xl font-bold">Wachtwoord vergeten</CardTitle>
            <CardDescription>Voer je e-mailadres in om een reset-link te ontvangen</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resetEmail">E-mailadres</Label>
                <Input
                  id="resetEmail"
                  type="email"
                  placeholder="naam@voorbeeld.be"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={emailLoading}>
                {emailLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                Verstuur reset-link
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setShowForgotPassword(false)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Terug naar inloggen
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-2xl font-bold">GradeIt</CardTitle>
          <CardDescription>Log in om je beoordelingen te beheren</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google OAuth */}
          <Button className="w-full gap-3" onClick={handleGoogleLogin} disabled={googleLoading} variant="outline">
            {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
            Doorgaan met Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">of</span>
            </div>
          </div>

          {/* Email tabs */}
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Inloggen</TabsTrigger>
              <TabsTrigger value="signup">Registreren</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleEmailLogin} className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="loginEmail">E-mailadres</Label>
                  <Input
                    id="loginEmail"
                    type="email"
                    placeholder="naam@voorbeeld.be"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loginPassword">Wachtwoord</Label>
                  <Input
                    id="loginPassword"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={emailLoading}>
                  {emailLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Inloggen
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => setShowForgotPassword(true)}
                >
                  Wachtwoord vergeten?
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="signupName">Naam</Label>
                  <Input
                    id="signupName"
                    type="text"
                    placeholder="Je volledige naam"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signupEmail">E-mailadres</Label>
                  <Input
                    id="signupEmail"
                    type="email"
                    placeholder="naam@voorbeeld.be"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signupPassword">Wachtwoord</Label>
                  <Input
                    id="signupPassword"
                    type="password"
                    placeholder="Minimaal 6 tekens"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signupConfirm">Bevestig wachtwoord</Label>
                  <Input
                    id="signupConfirm"
                    type="password"
                    placeholder="••••••••"
                    value={signupConfirm}
                    onChange={(e) => setSignupConfirm(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={emailLoading}>
                  {emailLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Account aanmaken
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
