import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Smartphone,
  ShieldCheck,
  QrCode,
  Copy,
  Check,
  KeyRound,
  AlertTriangle,
  Lock,
  CheckCircle2,
  ShieldOff,
  Loader2
} from 'lucide-react';

interface TwoFactorSettingsCardProps {
  variant?: 'card' | 'modal';
}

export const TwoFactorSettingsCard: React.FC<TwoFactorSettingsCardProps> = ({ variant = 'card' }) => {
  const { currentUser, updateCurrentUser, addToast } = useApp();

  // Setup flow state
  const [setupData, setSetupData] = useState<{
    qrCodeDataUrl: string;
    secret: string;
  } | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Backup codes display after activation
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copiedBackups, setCopiedBackups] = useState(false);

  // Disable flow state
  const [isDisableOpen, setIsDisableOpen] = useState(false);
  const [disableMode, setDisableMode] = useState<'password' | 'code'>('password');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disabling, setDisabling] = useState(false);

  const isEnabled = Boolean(currentUser?.twoFactorEnabled);

  const handleStartSetup = async () => {
    setSetupLoading(true);
    setVerifyCode('');
    try {
      const res = await authFetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not initiate 2FA setup.');
      setSetupData({
        qrCodeDataUrl: data.qrCodeDataUrl,
        secret: data.secret
      });
    } catch (err: any) {
      addToast(err.message || 'Failed to generate QR code', 'error');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleCopySecret = async () => {
    if (!setupData?.secret) return;
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      addToast('Copy failed — please copy manually.', 'error');
    }
  };

  const handleVerifySetup = async (e?: React.FormEvent, overrideCode?: string) => {
    if (e) e.preventDefault();
    const token = (overrideCode ?? verifyCode).replace(/\D/g, '');
    if (token.length !== 6) {
      addToast('Please enter the 6-digit code from Google Authenticator.', 'error');
      return;
    }
    setVerifying(true);
    try {
      const res = await authFetch('/api/auth/2fa/verify-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');

      if (data.user) {
        updateCurrentUser(data.user);
      }
      setSetupData(null);
      setVerifyCode('');
      setBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : []);
      addToast('Google Authenticator 2FA is now active on your account!', 'success');
    } catch (err: any) {
      addToast(err.message || 'Invalid 6-digit verification code.', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleCopyBackups = async () => {
    if (!backupCodes?.length) return;
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setCopiedBackups(true);
      setTimeout(() => setCopiedBackups(false), 2000);
      addToast('Recovery backup codes copied to clipboard!', 'success');
    } catch {
      addToast('Could not copy automatically — please save them manually.', 'error');
    }
  };

  const handleDisable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disableMode === 'password' && !disablePassword.trim()) {
      addToast('Please enter your current password.', 'error');
      return;
    }
    if (disableMode === 'code' && disableCode.replace(/\D/g, '').length !== 6) {
      addToast('Please enter a valid 6-digit authenticator code.', 'error');
      return;
    }

    setDisabling(true);
    try {
      const payload =
        disableMode === 'password'
          ? { password: disablePassword.trim() }
          : { code: disableCode.replace(/\D/g, '') };

      const res = await authFetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not disable 2FA.');

      if (data.user) {
        updateCurrentUser(data.user);
      }
      setIsDisableOpen(false);
      setDisablePassword('');
      setDisableCode('');
      setBackupCodes(null);
      addToast('Two-Factor Authentication has been disabled.', 'info');
    } catch (err: any) {
      addToast(err.message || 'Verification failed.', 'error');
    } finally {
      setDisabling(false);
    }
  };

  const wrapperClass =
    variant === 'modal'
      ? 'bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-4'
      : 'bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs space-y-5';

  return (
    <div className={wrapperClass}>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`p-2.5 rounded-2xl border shrink-0 ${
              isEnabled
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-indigo-50 text-indigo-900 border-indigo-200'
            }`}
          >
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Two-Factor Authentication (Google Authenticator)
              </h3>
              {isEnabled ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>2FA Active</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  <span>Not Enabled</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isEnabled
                ? `Your account requires a 6-digit Google Authenticator code on every sign-in (${currentUser?.twoFactorBackupCodesRemaining ?? 0} recovery backup codes left).`
                : 'Protect your admin credentials with a time-based 6-digit verification code from Google Authenticator or Authy.'}
            </p>
          </div>
        </div>

        {/* Action Button */}
        {!isEnabled && !setupData && (
          <button
            type="button"
            onClick={handleStartSetup}
            disabled={setupLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50 self-start sm:self-auto shrink-0"
          >
            {setupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4 text-amber-400" />}
            <span>{setupLoading ? 'Generating QR...' : 'Enable Google Authenticator'}</span>
          </button>
        )}

        {isEnabled && !isDisableOpen && (
          <button
            type="button"
            onClick={() => setIsDisableOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer self-start sm:self-auto shrink-0"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            <span>Disable 2FA</span>
          </button>
        )}
      </div>

      {/* Step: QR Code Scan & 6-digit Verification */}
      {!isEnabled && setupData && (
        <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-5 items-center">
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col items-center justify-center mx-auto md:mx-0">
              <img
                src={setupData.qrCodeDataUrl}
                alt="Google Authenticator Setup QR Code"
                className="w-44 h-44 object-contain rounded-lg"
              />
              <span className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider">
                Scan in Authenticator App
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded mb-1">
                  Step 1 • Scan or Copy Secret Key
                </span>
                <p className="text-slate-600 leading-relaxed">
                  Open <strong>Google Authenticator</strong>, tap <strong>+</strong> &rarr; <strong>Scan a QR code</strong>, or enter this setup key manually:
                </p>
                <div className="mt-2 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                  <code className="text-[11px] font-mono font-bold text-slate-900 break-all flex-1 select-all">
                    {setupData.secret}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer shrink-0"
                    title="Copy secret key"
                  >
                    {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <form onSubmit={handleVerifySetup} className="space-y-2 pt-1">
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                  Step 2 • Enter 6-Digit Verification Code
                </span>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={verifyCode}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setVerifyCode(digits);
                    }}
                    placeholder="000000"
                    className="sm:w-40 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-mono text-base font-bold tracking-[0.3em] text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                  />
                  <button
                    type="submit"
                    disabled={verifying || verifyCode.length !== 6}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  >
                    {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    <span>{verifying ? 'Activating...' : 'Verify & Activate 2FA'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSetupData(null); setVerifyCode(''); }}
                    className="px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-600 font-semibold hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* One-Time Backup Recovery Codes Reveal */}
      {backupCodes && backupCodes.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1 flex-1">
              <div className="font-bold text-amber-950 text-sm">
                Save Your One-Time Backup Recovery Codes
              </div>
              <p className="text-amber-900 leading-relaxed">
                Store these 6 codes securely offline. Each code can be used <strong>once</strong> to sign in if you lose access to your phone. They will not be shown again!
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {backupCodes.map((code, idx) => (
              <div
                key={idx}
                className="bg-white border border-amber-200 rounded-xl px-3 py-2 font-mono text-xs font-bold text-slate-900 text-center select-all"
              >
                {code}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopyBackups}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-amber-300 text-amber-950 text-xs font-bold hover:bg-amber-100 transition-colors cursor-pointer"
            >
              {copiedBackups ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedBackups ? 'Copied!' : 'Copy All Codes'}</span>
            </button>
            <button
              type="button"
              onClick={() => setBackupCodes(null)}
              className="px-4 py-2 rounded-xl bg-amber-900 hover:bg-amber-950 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              I Have Saved These Codes
            </button>
          </div>
        </div>
      )}

      {/* Disable Confirmation Form */}
      {isEnabled && isDisableOpen && (
        <form onSubmit={handleDisable2fa} className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-rose-900">Confirm Disable Two-Factor Authentication</span>
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-rose-200">
              <button
                type="button"
                onClick={() => setDisableMode('password')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                  disableMode === 'password' ? 'bg-rose-600 text-white' : 'text-slate-600'
                }`}
              >
                Use Password
              </button>
              <button
                type="button"
                onClick={() => setDisableMode('code')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                  disableMode === 'code' ? 'bg-rose-600 text-white' : 'text-slate-600'
                }`}
              >
                Use 6-Digit Code
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {disableMode === 'password' ? (
              <div className="relative flex-1">
                <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={disablePassword}
                  onChange={e => setDisablePassword(e.target.value)}
                  placeholder="Enter your current account password"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-rose-200 bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>
            ) : (
              <div className="relative flex-1">
                <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={disableCode}
                  onChange={e => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit authenticator code"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-rose-200 bg-white font-mono font-bold tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={disabling}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer disabled:opacity-50"
            >
              {disabling ? 'Disabling...' : 'Confirm Disable'}
            </button>
            <button
              type="button"
              onClick={() => { setIsDisableOpen(false); setDisablePassword(''); setDisableCode(''); }}
              className="px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
