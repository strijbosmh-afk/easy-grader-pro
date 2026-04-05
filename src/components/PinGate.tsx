import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const CORRECT_PIN = "0722";
const SESSION_KEY = "pin_unlocked";

interface PinGateProps {
  children: React.ReactNode;
}

export function PinGate({ children }: PinGateProps) {
  const [unlocked, setUnlocked] = useState(() => {
    return sessionStorage.getItem(SESSION_KEY) === "true";
  });
  const [pin, setPin] = useState(["", "", "", ""]);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!unlocked) {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [unlocked]);

  const handleInput = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    setError(false);

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 4 digits filled
    if (value && index === 3) {
      const fullPin = [...newPin].join("");
      if (fullPin === CORRECT_PIN) {
        sessionStorage.setItem(SESSION_KEY, "true");
        // Silently restore existing Supabase session (stored in localStorage).
        // On her one PC this always works. On a new device it signs in anonymously
        // so the app still opens — data just won't be there.
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) {
            supabase.auth.signInAnonymously().catch(() => {});
          }
        });
        setUnlocked(true);
      } else {
        setError(true);
        setShake(true);
        setTimeout(() => {
          setPin(["", "", "", ""]);
          setShake(false);
          inputRefs.current[0]?.focus();
        }, 600);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="w-full max-w-xs text-center space-y-10">
        {/* Brand + greeting */}
        <div className="space-y-4">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <svg className="h-9 w-9 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">GradeAssist</p>
            <h1 className="text-3xl font-bold text-foreground">Welkom, Els!</h1>
            <p className="text-sm text-muted-foreground mt-1">Voer je pincode in om verder te gaan</p>
          </div>
        </div>

        {/* PIN inputs */}
        <div
          className={`flex justify-center gap-4 ${shake ? "animate-[shake_0.5s_ease-in-out]" : ""}`}
          style={shake ? { animation: "shake 0.5s ease-in-out" } : {}}
        >
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={digit}
              onChange={(e) => handleInput(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              style={{ fontSize: '24px' }}
              className={`w-16 h-16 text-center font-bold rounded-xl border-2 bg-card outline-none transition-all
                ${error
                  ? "border-destructive text-destructive"
                  : digit
                  ? "border-primary text-foreground"
                  : "border-border text-foreground"
                }
                focus:border-primary focus:ring-2 focus:ring-primary/20`}
            />
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive font-medium animate-in fade-in">
            Onjuiste pincode, probeer opnieuw
          </p>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
