import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  ShieldCheck,
  UserPlus,
  Trash2,
  Lock,
  User,
  Mail,
  Edit2,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  UserCog,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { AdminUser, Role } from '../../types.ts';

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

export const AdminUsers: React.FC = () => {
  const { currentUser, addToast } = useApp();
  const [users, setUsers] = useState<AdminUser[]>([]);
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

  const [saving, setSaving] = useState(false);

  const isSuperAdmin =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'Super Admin';

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/users');
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch (err) {
      addToast('Error loading staff accounts', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password || !newUser.email || !newUser.name) {
      addToast('Please complete all required fields.', 'error');
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
      await fetchUsers();
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
    setIsEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSaving(true);
    try {
      const payload: any = {
        name: editingUser.name,
        email: editingUser.email,
        username: editingUser.username,
        role: editingUser.role
      };
      if (editingUser.password && editingUser.password.trim()) {
        payload.password = editingUser.password.trim();
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
      await fetchUsers();
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

      addToast(`Role updated to ${newRole}!`, 'success');
      // Optimistic update
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err: any) {
      addToast(err.message || 'Error updating role', 'error');
      await fetchUsers();
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (id === currentUser?.id) {
      addToast('You cannot revoke your own active session account', 'error');
      return;
    }

    if (!confirm(`Are you sure you want to revoke access credentials for ${name}?`)) return;

    try {
      const res = await authFetch(`/api/users/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Deletion failed');

      addToast(`Staff account for ${name} revoked`, 'info');
      await fetchUsers();
    } catch (err: any) {
      addToast(err.message || 'Error deleting account', 'error');
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

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/90 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-serif font-bold text-slate-900">
              Access Control &amp; Staff Roles (RBAC)
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Real-time MongoDB Sync
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Super Administrators can assign and modify officer access levels in real-time. Volunteer Managers review applications, and Content Managers oversee programs and news.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh staff accounts"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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
                              onClick={() => handleDelete(u.id, u.name)}
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
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-950">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-slate-900 leading-none">Provision Staff Account</h3>
                  <span className="text-[11px] text-slate-400">Assign role and initial credentials</span>
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
                  placeholder="fatima@nexgencouncil.org"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                  <input
                    type="password"
                    required
                    value={newUser.password}
                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Min 6 characters"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                  />
                </div>
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
                  disabled={saving}
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
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-900">
                  <UserCog className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-slate-900 leading-none">
                    Edit Account &amp; Assign Role
                  </h3>
                  <span className="text-[11px] text-slate-400">Modify staff details or reset password</span>
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
                  Reset Password (Optional)
                </label>
                <input
                  type="password"
                  value={editingUser.password || ''}
                  onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}
                  placeholder="Leave empty to keep existing password"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                />
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
                  disabled={saving}
                  className="px-5 py-2.5 bg-indigo-950 text-white rounded-xl font-bold hover:bg-indigo-900 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save & Update Permissions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
