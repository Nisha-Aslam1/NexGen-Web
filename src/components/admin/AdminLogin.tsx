import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  ShieldCheck,
  Lock,
  User,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  AlertCircle,
  Fingerprint,
  Code2,
  ShieldAlert,
  Clock,
  Smartphone,
  KeyRound
} from 'lucide-react';

export const AdminLogin: React.FC = () => {
  const { login, verifyTwoFactorLogin, setActivePage } = useApp();
  // Strictly secure - no prefilled credentials or sample passwords
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  // Two-Factor Authentication step state
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<{
    temp2faToken: string;
    userPreview?: { name: string; email: string };
  } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [twoFactorExpirySeconds, setTwoFactorExpirySeconds] = useState(0);
  const twoFactorInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds(prev => {
        if (prev <= 1) {
          setErrorMessage(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  useEffect(() => {
    if (!twoFactorChallenge || twoFactorExpirySeconds <= 0) return;
    const timer = setInterval(() => {
      setTwoFactorExpirySeconds(prev => {
        if (prev <= 1) {
          setTwoFactorChallenge(null);
          setTwoFactorCode('');
          setErrorMessage('Two-factor session expired after 5 minutes. Please sign in again.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [twoFactorChallenge, twoFactorExpirySeconds]);

  useEffect(() => {
    if (twoFactorChallenge && twoFactorInputRef.current) {
      twoFactorInputRef.current.focus();
    }
  }, [twoFactorChallenge, useBackupCode]);

  const formatCountdown = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    setErrorMessage(null);

    const trimmedUser = username.trim();
    const trimmedPass = password.trim();

    if (!trimmedUser || !trimmedPass) {
      setErrorMessage('Please enter both username/email and password.');
      return;
    }

    setIsSubmitting(true);
    const result = await login(trimmedUser, trimmedPass);
    setIsSubmitting(false);

    if (result.requires2FA && result.temp2faToken) {
      setPassword('');
      setTwoFactorChallenge({
        temp2faToken: result.temp2faToken,
        userPreview: result.userPreview
      });
      setTwoFactorCode('');
      setUseBackupCode(false);
      setTwoFactorExpirySeconds(300);
      setErrorMessage(null);
      return;
    }

    if (!result.ok) {
      setPassword('');
      if (result.retryAfterSeconds && result.retryAfterSeconds > 0) {
        setLockoutSeconds(result.retryAfterSeconds);
      }
      setErrorMessage(result.error || 'Invalid username or password. Please verify your credentials.');
    }
  };

  const submitTwoFactorCode = async (codeValue: string) => {
    if (!twoFactorChallenge || isSubmitting) return;
    const cleaned = useBackupCode
      ? codeValue.trim().toUpperCase()
      : codeValue.replace(/\D/g, '');

    if (!useBackupCode && cleaned.length !== 6) {
      setErrorMessage('Please enter the 6-digit code from Google Authenticator.');
      return;
    }
    if (useBackupCode && cleaned.replace(/[^A-Z0-9]/g, '').length < 6) {
      setErrorMessage('Please enter a valid 8-character backup recovery code.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    const result = await verifyTwoFactorLogin(twoFactorChallenge.temp2faToken, cleaned);
    setIsSubmitting(false);

    if (!result.ok) {
      setTwoFactorCode('');
      if (result.expired) {
        setTwoFactorChallenge(null);
        setTwoFactorExpirySeconds(0);
      }
      setErrorMessage(result.error || 'Verification failed. Please check the code and try again.');
    }
  };

  const handleTwoFactorInputChange = (val: string) => {
    if (errorMessage) setErrorMessage(null);
    if (useBackupCode) {
      setTwoFactorCode(val.toUpperCase());
      return;
    }
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setTwoFactorCode(digits);
    if (digits.length === 6) {
      void submitTwoFactorCode(digits);
    }
  };

  const isLocked = lockoutSeconds > 0;

  // Step 2: Dark-Mode Two-Factor Verification Step
  if (twoFactorChallenge) {
    return (
      <div className="min-h-[88vh] flex items-center justify-center px-4 py-12 bg-slate-900/60 font-sans backdrop-blur-xs">
        <div className="max-w-md w-full bg-slate-950 text-white rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-10 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-400 via-blue-500 to-amber-400" />

          <div className="text-center space-y-2 pt-2">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30 shadow-lg shadow-emerald-950/30">
              {useBackupCode ? <KeyRound className="w-8 h-8 text-amber-400" /> : <Smartphone className="w-8 h-8 text-emerald-400" />}
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Two-Factor Verification
            </h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              {useBackupCode
                ? 'Enter one of your single-use backup recovery codes to unlock admin access.'
                : 'Enter the 6-digit verification code from your Google Authenticator app.'}
            </p>
          </div>

          {twoFactorChallenge.userPreview && (
            <div className="flex items-center justify-between gap-2 py-2 px-3.5 bg-slate-900 border border-slate-800 rounded-xl text-[11px]">
              <div className="min-w-0">
                <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Verifying Account</span>
                <span className="font-bold text-slate-100 truncate block">{twoFactorChallenge.userPreview.name}</span>
              </div>
              <div className="inline-flex items-center gap-1 font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg shrink-0">
                <Clock className="w-3 h-3" />
                <span>{formatCountdown(twoFactorExpirySeconds)}</span>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-950/70 border border-rose-500/40 rounded-xl flex items-start gap-2.5 text-rose-200 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          <form
            onSubmit={e => {
              e.preventDefault();
              void submitTwoFactorCode(twoFactorCode);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 text-center">
                {useBackupCode ? 'Backup Recovery Code' : '6-Digit Authenticator Code'}
              </label>
              <input
                ref={twoFactorInputRef}
                type="text"
                inputMode={useBackupCode ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                disabled={isSubmitting}
                maxLength={useBackupCode ? 12 : 6}
                value={twoFactorCode}
                onChange={e => handleTwoFactorInputChange(e.target.value)}
                placeholder={useBackupCode ? 'XXXX-XXXX' : '••••••'}
                className={`w-full px-4 py-4 rounded-2xl bg-slate-900 border border-slate-700 text-white text-center font-mono font-black focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-colors placeholder:text-slate-600 ${
                  useBackupCode ? 'text-xl tracking-[0.2em] uppercase' : 'text-3xl tracking-[0.45em]'
                }`}
              />
              {!useBackupCode && (
                <p className="text-[11px] text-slate-400 text-center mt-2">
                  Auto-verifies automatically once all 6 digits are entered
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || (!useBackupCode && twoFactorCode.length !== 6) || (useBackupCode && twoFactorCode.trim().length < 6)}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-sm font-black transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify &amp; Enter Admin Console</span>
                </>
              )}
            </button>
          </form>

          <div className="flex flex-col gap-2 pt-3 border-t border-slate-800 text-center">
            <button
              type="button"
              onClick={() => {
                setUseBackupCode(prev => !prev);
                setTwoFactorCode('');
                setErrorMessage(null);
              }}
              className="text-xs font-semibold text-amber-300 hover:text-amber-200 transition-colors cursor-pointer py-1"
            >
              {useBackupCode
                ? 'Use 6-Digit Google Authenticator Code Instead'
                : 'Lost access to phone? Use a Backup Recovery Code'}
            </button>

            <button
              type="button"
              onClick={() => {
                setTwoFactorChallenge(null);
                setTwoFactorCode('');
                setErrorMessage(null);
              }}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer py-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Username &amp; Password
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[88vh] flex items-center justify-center px-4 py-12 bg-slate-900/60 font-sans backdrop-blur-xs">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200/90 shadow-2xl p-6 sm:p-10 space-y-6 relative overflow-hidden">
        {/* Top security accent line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-amber-500" />

        {/* Header */}
        <div className="text-center space-y-2 pt-2">
          <div className="w-16 h-16 rounded-2xl bg-slate-950 text-white flex items-center justify-center mx-auto shadow-lg shadow-indigo-950/20 border border-slate-800">
            <ShieldCheck className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            NexGen Council Admin
          </h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Authorized officer access with role-based permissions &amp; realtime audit logging
          </p>
        </div>

        {/* Security badge banner */}
        <div className="flex items-center justify-center gap-2 py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 font-medium">
          <Fingerprint className="w-3.5 h-3.5 text-blue-600" />
          <span>Brute-Force Shield • 2FA TOTP • RBAC</span>
        </div>

        {/* Lockout Alert Banner */}
        {isLocked && (
          <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-amber-900 text-xs">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="font-bold">Temporary Security Lockout Active</div>
              <p className="text-[11px] text-amber-800">
                Too many failed login attempts were detected. Access is locked to prevent unauthorized attacks.
              </p>
              <div className="inline-flex items-center gap-1.5 font-mono font-bold text-amber-950 bg-amber-200/70 px-2 py-0.5 rounded-md mt-1">
                <Clock className="w-3 h-3" />
                <span>Retry in {formatCountdown(lockoutSeconds)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Error notification */}
        {errorMessage && !isLocked && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600 mt-0.5" />
            <div className="flex-1 font-medium">{errorMessage}</div>
          </div>
        )}

        {/* Secure Form (No pre-filled values) */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Username or Staff Email
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                disabled={isLocked || isSubmitting}
                autoComplete="username"
                value={username}
                onChange={e => {
                  setUsername(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Enter username or official email"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors text-slate-900 placeholder:text-slate-400 font-medium disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Password
              </label>
              <span className="text-[11px] text-slate-400">Case-sensitive</span>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                disabled={isLocked || isSubmitting}
                autoComplete="current-password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Enter security password"
                className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors text-slate-900 placeholder:text-slate-400 font-medium disabled:bg-slate-100 disabled:text-slate-400"
              />
              <button
                type="button"
                disabled={isLocked}
                onClick={() => setShowPassword(!showPassword)}
                className="p-1.5 text-slate-400 hover:text-slate-600 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer disabled:opacity-40"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isLocked}
            className="w-full py-3.5 bg-slate-950 hover:bg-slate-900 text-white rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isLocked ? (
              <>
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Locked ({formatCountdown(lockoutSeconds)})</span>
              </>
            ) : (
              <>
                <span>Sign In to Admin Workspace</span>
                <ArrowRight className="w-4 h-4 text-amber-400" />
              </>
            )}
          </button>
        </form>

        {/* Back to Public Site & Developer Watermark */}
        <div className="text-center pt-3 border-t border-slate-100 space-y-2.5">
          <button
            type="button"
            onClick={() => setActivePage('home')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer py-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Return to Public Council Website
          </button>

          <div className="pt-1 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <Code2 className="w-3.5 h-3.5 text-amber-500" />
            <span>Engineered &amp; Developed by</span>
            <span className="font-bold text-slate-800">Nisha Aslam</span>
          </div>
        </div>
      </div>
    </div>
  );
};
