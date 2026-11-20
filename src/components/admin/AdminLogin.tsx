import React, { useState, useEffect } from 'react';
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
  Clock
} from 'lucide-react';

export const AdminLogin: React.FC = () => {
  const { login, setActivePage } = useApp();
  // Strictly secure - no prefilled credentials or sample passwords
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

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

    if (!result.ok) {
      setPassword('');
      if (result.retryAfterSeconds && result.retryAfterSeconds > 0) {
        setLockoutSeconds(result.retryAfterSeconds);
      }
      setErrorMessage(result.error || 'Invalid username or password. Please verify your credentials.');
    }
  };

  const isLocked = lockoutSeconds > 0;

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
          <span>Brute-Force Shield • Role-Based Access Control</span>
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
