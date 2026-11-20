import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  ShieldCheck,
  UserPlus,
  Trash2,
  Lock,
  Edit2,
  CheckCircle2,
  KeyRound,
  UserCog,
  RefreshCw,
  ShieldAlert,
  Shield,
  LogOut,
  Eye,
  EyeOff
} from 'lucide-react';
import { AdminUser, Role } from '../../types.ts';
import { TwoFactorSettingsCard } from './TwoFactorSettingsCard.tsx';

interface SecurityStatus {
  pbkdf2Iterations: number;
  sessionTtlHours: number;
  bruteForceShieldActive: boolean;
  maxLoginAttempts: number;
  activeLockouts: number;
  blockedAttemptsCount: number;
  csrfOriginProtection: boolean;
  httpsSecureCookies: boolean;
  svgUploadBlocked: boolean;
}

const ROLE_OPTIONS = [
  {
    value: 'SUPER_ADMIN',
    label: 'Super Admin',
    desc: 'Full administrative authority, database access, settings & user management',
    badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-200'
  },
  {
    value: 'VOLUNTEER_MANAGER',
    label: 'Volunteer Manager',
    desc: 'Review & approve applications, manage active volunteers & applicant tracking',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200'
  },
  {
    value: 'CONTENT_MANAGER',
    label: 'Content Manager',
    desc: 'Publish & edit programs, community events, news articles, team & media gallery',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200'
  },
  {
    value: 'VIEWER',
    label: 'Viewer (Read-Only)',
    desc: 'Read-only access to dashboard statistics, visitor telemetry & activity logs',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200'
  }
];

function evaluatePasswordStrength(pwd: string): {
  score: number;
  label: string;
  barClass: string;
  textClass: string;
  hint: string;
} {
  if (!pwd) {
    return {
      score: 0,
      label: 'Required',
      barClass: 'bg-slate-200 w-0',
      textClass: 'text-slate-400',
      hint: 'Minimum 8 characters required'
    };
  }
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

  if (pwd.length < 8 || score <= 1) {
    return {
      score,
      label: 'Weak',
      barClass: 'bg-rose-500 w-1/4',
      textClass: 'text-rose-600',
      hint: pwd.length < 8 ? 'Must be at least 8 characters' : 'Add uppercase, numbers & symbols'
    };
  }
  if (score === 2) {
    return {
      score,
      label: 'Fair',
      barClass: 'bg-amber-500 w-2/4',
      textClass: 'text-amber-600',
      hint: 'Add numbers or symbols for stronger protection'
    };
  }
  if (score === 3 || score === 4) {
    return {
      score,
      label: 'Strong',
      barClass: 'bg-emerald-500 w-3/4',
      textClass: 'text-emerald-600',
      hint: 'Good cryptographic strength'
    };
  }
  return {
    score,
    label: 'Fortress',
    barClass: 'bg-indigo-600 w-full',
    textClass: 'text-indigo-700',
    hint: 'Excellent high-entropy passphrase'
  };
}

export const AdminUsers: React.FC = () => {
  const { currentUser, addToast, logout } = useApp();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    name: '',
    email: '',
    password: '',
    role: 'VOLUNTEER_MANAGER' as Role
  });
  const [showCreatePwd, setShowCreatePwd] = useState(false);

  // Edit modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{
    id: string;
    username: string;
    name: string;
    email: string;
    role: Role;
    password?: string;
  } | null>(null);
  const [showEditPwd, setShowEditPwd] = useState(false);

  // Change own password modal
  const [isOwnPwdOpen, setIsOwnPwdOpen] = useState(false);
  const [ownPwdForm, setOwnPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showOwnPwd, setShowOwnPwd] = useState(false);

  // Confirmation modals
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [isRevokeAllConfirmOpen, setIsRevokeAllConfirmOpen] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);

  const [saving, setSaving] = useState(false);

  const isSuperAdmin =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'Super Admin';

  const fetchSecurityAndUsers = async () => {
    setLoading(true);
    try {
      const [usersRes, secRes] = await Promise.all([
        authFetch('/api/users'),
        isSuperAdmin ? authFetch('/api/system/security-status') : Promise.resolve(null)
      ]);
      const data = await usersRes.json();
      if (Array.isArray(data)) setUsers(data);

      if (secRes && secRes.ok) {
        const secData = await secRes.json();
        setSecurityStatus(secData);
      }
    } catch {
      addToast('Error loading staff accounts', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityAndUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password || !newUser.email || !newUser.name) {
      addToast('Please complete all required fields.', 'error');
      return;
    }
    if (newUser.password.trim().length < 8) {
      addToast('Security policy requires at least 8 characters for staff passwords.', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      addToast(`Staff account for ${data.name} created successfully!`, 'success');
      setIsCreateOpen(false);
      setNewUser({ username: '', name: '', email: '', password: '', role: 'VOLUNTEER_MANAGER' });
      await fetchSecurityAndUsers();
    } catch (err: any) {
      addToast(err.message || 'Error creating user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (user: AdminUser) => {
    setEditingUser({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      password: ''
    });
    setShowEditPwd(false);
    setIsEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const trimmedNewPwd = editingUser.password?.trim() || '';
    if (trimmedNewPwd && trimmedNewPwd.length < 8) {
      addToast('Reset password must be at least 8 characters long.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, string> = {
        name: editingUser.name,
        email: editingUser.email,
        username: editingUser.username,
        role: editingUser.role
      };
      if (trimmedNewPwd) {
        payload.password = trimmedNewPwd;
      }

      const res = await authFetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user');

      addToast(`Permissions and role updated for ${data.name}!`, 'success');
      setIsEditOpen(false);
      setEditingUser(null);
      await fetchSecurityAndUsers();
    } catch (err: any) {
      addToast(err.message || 'Error updating staff account', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickRoleChange = async (userId: string, newRole: Role) => {
    if (!isSuperAdmin) return;
    try {
      const res = await authFetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update role');

      addToast(`Role updated to ${newRole}. Old tokens invalidated.`, 'success');
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err: any) {
      addToast(err.message || 'Error updating role', 'error');
      await fetchSecurityAndUsers();
    }
  };

  const handleConfirmDelete = async () => {
    if (!revokeTarget) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/users/${revokeTarget.id}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Deletion failed');

      addToast(`Staff account for ${revokeTarget.name} permanently revoked`, 'info');
      setRevokeTarget(null);
      await fetchSecurityAndUsers();
    } catch (err: any) {
      addToast(err.message || 'Error deleting account', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    setRevokingAll(true);
    try {
      const res = await authFetch('/api/auth/revoke-all', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke sessions');
      addToast(data.message || 'All active admin sessions invalidated.', 'info');
      setIsRevokeAllConfirmOpen(false);
      await logout();
    } catch (err: any) {
      addToast(err.message || 'Error revoking sessions', 'error');
    } finally {
      setRevokingAll(false);
    }
  };

  const handleOwnPasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ownPwdForm.newPassword.length < 8) {
      addToast('New password must be at least 8 characters long.', 'error');
      return;
    }
    if (ownPwdForm.newPassword !== ownPwdForm.confirmPassword) {
      addToast('New password and confirmation do not match.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: ownPwdForm.currentPassword,
          newPassword: ownPwdForm.newPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password update failed');
      addToast(data.message || 'Password updated cleanly!', 'success');
      setIsOwnPwdOpen(false);
      setOwnPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      addToast(err.message || 'Failed to update password', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const norm = role.toUpperCase().replace(/[\s-]+/g, '_');
    if (norm === 'SUPER_ADMIN') {
      return { label: 'Super Admin', color: 'bg-indigo-100 text-indigo-950 border-indigo-200' };
    }
    if (norm === 'VOLUNTEER_MANAGER') {
      return { label: 'Volunteer Manager', color: 'bg-emerald-100 text-emerald-950 border-emerald-200' };
    }
    if (norm === 'CONTENT_MANAGER' || norm === 'EDITOR') {
      return { label: 'Content Manager', color: 'bg-amber-100 text-amber-950 border-amber-200' };
    }
    return { label: 'Viewer', color: 'bg-slate-100 text-slate-800 border-slate-200' };
  };

  const createStrength = evaluatePasswordStrength(newUser.password);
  const editStrength = evaluatePasswordStrength(editingUser?.password || '');
  const ownStrength = evaluatePasswordStrength(ownPwdForm.newPassword);

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/90 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-serif font-bold text-slate-900">
              Access Control &amp; Security Shield (RBAC)
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Hardened Auth Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Manage officer roles, enforce strong PBKDF2-SHA512 credentials, monitor blocked brute-force attacks, and invalidate all active sessions instantly.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <button
            onClick={fetchSecurityAndUsers}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh security telemetry & staff accounts"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsOwnPwdOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-indigo-700" />
            <span>Change My Password</span>
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-950 text-white text-xs font-bold hover:bg-indigo-900 transition-all shadow-sm hover:shadow-indigo-950/20 cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-amber-300" />
              <span>Provision Staff Account</span>
            </button>
          )}
        </div>
      </div>

      {/* Two-Factor Authentication (Google Authenticator) */}
      <TwoFactorSettingsCard variant="card" />

      {/* Security Shield & Emergency Session Revocation Panel */}
      {isSuperAdmin && securityStatus && (
        <div className="bg-slate-950 text-white rounded-3xl p-6 border border-slate-800 shadow-lg space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Active Server Security Shield</span>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Protected
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time defense status against brute-force logins, CSRF, session hijacking, and malicious SVG uploads.
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsRevokeAllConfirmOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer self-start md:self-auto"
            >
              <LogOut className="w-4 h-4" />
              <span>Revoke All Active Sessions</span>
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Password Hashing</span>
              <div className="font-bold text-emerald-300">
                PBKDF2-SHA512 ({(securityStatus.pbkdf2Iterations / 1000).toFixed(0)}k)
              </div>
              <span className="text-[11px] text-slate-400 block">Salted constant-time verify</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Brute-Force Shield</span>
              <div className="font-bold text-amber-300">
                {securityStatus.blockedAttemptsCount} Blocked • {securityStatus.activeLockouts} Locked
              </div>
              <span className="text-[11px] text-slate-400 block">
                Max {securityStatus.maxLoginAttempts} attempts / 15m lock
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Session &amp; CSRF Guard</span>
              <div className="font-bold text-blue-300">
                {securityStatus.sessionTtlHours}h TTL + Origin Check
              </div>
              <span className="text-[11px] text-slate-400 block">30m idle auto-logout + JTI revocation</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Upload &amp; Cookie Guard</span>
              <div className="font-bold text-indigo-300">
                {securityStatus.httpsSecureCookies ? 'HTTPS Secure Cookie' : 'HttpOnly SameSite=Lax'}
              </div>
              <span className="text-[11px] text-slate-400 block">
                {securityStatus.svgUploadBlocked ? 'SVG XSS uploads blocked' : 'Strict mime validation'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Role explanation cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {ROLE_OPTIONS.map(opt => (
          <div key={opt.value} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${opt.badgeClass}`}>
                {opt.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {opt.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Staff accounts table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4 font-bold">Staff Member</th>
                <th className="py-3.5 px-4 font-bold">Username</th>
                <th className="py-3.5 px-4 font-bold">Current Role</th>
                <th className="py-3.5 px-4 font-bold">Quick Role Reassignment</th>
                <th className="py-3.5 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-900" />
                      <span>Loading staff database...</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    No staff accounts found.
                  </td>
                </tr>
              ) : (
                users.map(u => {
                  const badge = getRoleBadge(u.role);
                  const isCurrentSession = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          {u.avatar ? (
                            <img
                              src={u.avatar}
                              alt={u.name}
                              className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0">
                              {u.name.slice(0, 1)}
                            </div>
                          )}
                          <div>
                            <strong className="text-slate-900 block text-xs font-semibold">
                              {u.name} {isCurrentSession && <span className="text-[10px] font-normal text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded ml-1">You</span>}
                            </strong>
                            <span className="text-[11px] text-slate-400 block">{u.email}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-800 font-semibold">
                        @{u.username}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {isSuperAdmin && !isCurrentSession ? (
                          <select
                            value={u.role}
                            onChange={e => handleQuickRoleChange(u.id, e.target.value as Role)}
                            className="text-[11px] font-semibold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer shadow-2xs"
                          >
                            <option value="SUPER_ADMIN">Super Admin</option>
                            <option value="VOLUNTEER_MANAGER">Volunteer Manager</option>
                            <option value="CONTENT_MANAGER">Content Manager</option>
                            <option value="VIEWER">Viewer</option>
                          </select>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            {isCurrentSession ? 'Current Active Session' : 'Protected'}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isSuperAdmin && (
                            <button
                              onClick={() => openEditModal(u)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-900 hover:bg-indigo-50 transition-colors cursor-pointer"
                              title="Edit Credentials & Permissions"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {!isCurrentSession && isSuperAdmin && (
                            <button
                              onClick={() => setRevokeTarget({ id: u.id, name: u.name })}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Revoke Credentials"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Staff Account */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-950">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-slate-900 leading-none">Provision Staff Account</h3>
                  <span className="text-[11px] text-slate-400">Enforces minimum 8-char strong credentials</span>
                </div>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newUser.name}
                  onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="e.g. Fatima Tariq"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Official Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="fatima@nexgencouncil.bond"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={newUser.username}
                    onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                    placeholder="fatima.tariq"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                    Initial Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showCreatePwd ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={newUser.password}
                      onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                      placeholder="Min 8 characters"
                      className="w-full px-3 py-2.5 pr-8 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreatePwd(!showCreatePwd)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showCreatePwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password Strength Meter */}
              <div className="space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-slate-500 uppercase tracking-wider">Password Strength</span>
                  <span className={createStrength.textClass}>{createStrength.label}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-300 ${createStrength.barClass}`} />
                </div>
                <p className="text-[10px] text-slate-500">{createStrength.hint}</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Assigned Access Level (Role) *
                </label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value as Role })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                >
                  <option value="VOLUNTEER_MANAGER">Volunteer Manager — Review &amp; Approve Candidates</option>
                  <option value="CONTENT_MANAGER">Content Manager — Programs, Events &amp; News</option>
                  <option value="SUPER_ADMIN">Super Admin — Full Administrative Control</option>
                  <option value="VIEWER">Viewer — Read-Only Reports &amp; Telemetry</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || newUser.password.trim().length < 8}
                  className="px-5 py-2.5 bg-indigo-950 text-white rounded-xl font-bold hover:bg-indigo-900 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Provision Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Staff Account & Assign Role */}
      {isEditOpen && editingUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-900">
                  <UserCog className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-slate-900 leading-none">
                    Edit Account &amp; Assign Role
                  </h3>
                  <span className="text-[11px] text-slate-400">Role or password edits invalidate old sessions</span>
                </div>
              </div>
              <button
                onClick={() => { setIsEditOpen(false); setEditingUser(null); }}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editingUser.name}
                  onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Official Email Address
                </label>
                <input
                  type="email"
                  required
                  value={editingUser.email}
                  onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={editingUser.username}
                  onChange={e => setEditingUser({ ...editingUser, username: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Assigned Role &amp; Permissions Level
                </label>
                <select
                  value={editingUser.role}
                  onChange={e => setEditingUser({ ...editingUser, role: e.target.value as Role })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-900/20"
                >
                  <option value="SUPER_ADMIN">Super Admin (Full Administrative Authority)</option>
                  <option value="VOLUNTEER_MANAGER">Volunteer Manager (Review &amp; Approve Candidates)</option>
                  <option value="CONTENT_MANAGER">Content Manager (Programs, Events, News &amp; Media)</option>
                  <option value="VIEWER">Viewer (Read-Only Reports &amp; Telemetry)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Reset Password (Optional, min 8 chars)
                </label>
                <div className="relative">
                  <input
                    type={showEditPwd ? 'text' : 'password'}
                    value={editingUser.password || ''}
                    onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}
                    placeholder="Leave empty to keep existing password"
                    className="w-full px-3 py-2.5 pr-9 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPwd(!showEditPwd)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showEditPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {editingUser.password && editingUser.password.length > 0 && (
                  <div className="mt-2 space-y-1 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className="text-slate-500 uppercase tracking-wider">New Password Strength</span>
                      <span className={editStrength.textClass}>{editStrength.label}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-300 ${editStrength.barClass}`} />
                    </div>
                    <p className="text-[10px] text-slate-500">{editStrength.hint}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsEditOpen(false); setEditingUser(null); }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || (Boolean(editingUser.password?.trim()) && (editingUser.password?.trim().length || 0) < 8)}
                  className="px-5 py-2.5 bg-indigo-950 text-white rounded-xl font-bold hover:bg-indigo-900 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save & Update Permissions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Change My Password */}
      {isOwnPwdOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-950">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-slate-900 leading-none">
                    Change My Password
                  </h3>
                  <span className="text-[11px] text-slate-400">All other active sessions will be signed out</span>
                </div>
              </div>
              <button
                onClick={() => setIsOwnPwdOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleOwnPasswordUpdate} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Current Password *
                </label>
                <div className="relative">
                  <input
                    type={showOwnPwd ? 'text' : 'password'}
                    required
                    value={ownPwdForm.currentPassword}
                    onChange={e => setOwnPwdForm({ ...ownPwdForm, currentPassword: e.target.value })}
                    placeholder="Enter current password"
                    className="w-full px-3 py-2.5 pr-9 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOwnPwd(!showOwnPwd)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showOwnPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  New Password * (Min 8 chars)
                </label>
                <input
                  type={showOwnPwd ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={ownPwdForm.newPassword}
                  onChange={e => setOwnPwdForm({ ...ownPwdForm, newPassword: e.target.value })}
                  placeholder="Strong password with symbols & numbers"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                />
                {ownPwdForm.newPassword && (
                  <div className="mt-2 space-y-1 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className="text-slate-500 uppercase tracking-wider">Strength</span>
                      <span className={ownStrength.textClass}>{ownStrength.label}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-300 ${ownStrength.barClass}`} />
                    </div>
                    <p className="text-[10px] text-slate-500">{ownStrength.hint}</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Confirm New Password *
                </label>
                <input
                  type={showOwnPwd ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={ownPwdForm.confirmPassword}
                  onChange={e => setOwnPwdForm({ ...ownPwdForm, confirmPassword: e.target.value })}
                  placeholder="Re-enter new password"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOwnPwdOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || ownPwdForm.newPassword.length < 8}
                  className="px-5 py-2.5 bg-indigo-950 text-white rounded-xl font-bold hover:bg-indigo-900 transition-colors shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" />
                  <span>{saving ? 'Updating...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Revoke Single Staff Account */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-base text-slate-900">Revoke Staff Access?</h3>
                <p className="text-[11px] text-slate-500">Immediate credential invalidation</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently remove access credentials for{' '}
              <strong className="text-slate-900">{revokeTarget.name}</strong>? Any active tokens for this user will stop working immediately.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Revoking...' : 'Yes, Revoke Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Emergency Revoke All Sessions */}
      {isRevokeAllConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-base text-slate-900">
                  Force Sign-Out All Devices?
                </h3>
                <p className="text-[11px] text-slate-500">Global token invalidation kill-switch</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              This will immediately invalidate every active admin session token across all browsers, phones, and staff devices—including your current session. Everyone will be required to sign in again.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsRevokeAllConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={revokingAll}
                onClick={handleRevokeAllSessions}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {revokingAll ? 'Invalidating...' : 'Invalidate All Sessions Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
