import React, { useState } from 'react';
import { useApp, AdminTab, canAccessAdminTab } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import { TwoFactorSettingsCard } from './TwoFactorSettingsCard.tsx';
import { VolunteerIdCardModal } from './VolunteerIdCardModal.tsx';
import {
  LayoutDashboard,
  FileCheck2,
  Users,
  Award,
  Calendar,
  Newspaper,
  UserCheck,
  Image as ImageIcon,
  Mail,
  Settings,
  ShieldCheck,
  Activity,
  LogOut,
  Menu,
  X,
  ExternalLink,
  Bell,
  Search,
  Plus,
  Database,
  RefreshCw,
  Radio,
  Code2,
  Video,
  Send,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Headphones
} from 'lucide-react';

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    adminTab,
    setAdminTab,
    currentUser,
    logout,
    setActivePage,
    isSyncing,
    lastSyncTime,
    pendingApplicationsCount,
    unreadContactsCount,
    triggerRealtimeSync,
    addToast
  } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [showMyIdCard, setShowMyIdCard] = useState(false);
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPwdFields, setShowPwdFields] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdForm.newPassword.length < 8) {
      addToast('New password must be at least 8 characters long.', 'error');
      return;
    }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      addToast('New password and confirmation do not match.', 'error');
      return;
    }
    setSavingPwd(true);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: pwdForm.currentPassword,
          newPassword: pwdForm.newPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password');
      addToast(data.message || 'Password updated successfully!', 'success');
      setIsPasswordModalOpen(false);
      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      addToast(err.message || 'Could not update password', 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  type NavItem = { tab: AdminTab; label: string; icon: React.ElementType; badge?: number };

  const allManagementNav: NavItem[] = [
    { tab: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { tab: 'meetings', label: 'Video Meetings', icon: Video },
    { tab: 'analytics', label: 'Live Analytics', icon: Radio },
    { tab: 'applications', label: 'Applications', icon: FileCheck2, badge: pendingApplicationsCount },
    { tab: 'volunteers', label: 'Volunteers', icon: Users },
    { tab: 'programs', label: 'Programs', icon: Award },
    { tab: 'events', label: 'Events', icon: Calendar },
    { tab: 'news', label: 'News & CMS', icon: Newspaper }
  ];
  const navManagement = allManagementNav.filter(item => canAccessAdminTab(item.tab, currentUser?.role));

  const allOrganizationNav: NavItem[] = [
    { tab: 'team', label: 'Team', icon: UserCheck },
    { tab: 'gallery', label: 'Gallery', icon: ImageIcon },
    { tab: 'contacts', label: 'Inquiries', icon: Mail, badge: unreadContactsCount },
    { tab: 'email', label: 'Send Email', icon: Send },
    { tab: 'settings', label: 'Settings', icon: Settings },
    { tab: 'users', label: 'Access Control', icon: ShieldCheck },
    { tab: 'database', label: 'Database & MongoDB', icon: Database },
    { tab: 'activity', label: 'Activity Logs', icon: Activity }
  ];
  const navOrganization = allOrganizationNav.filter(item => canAccessAdminTab(item.tab, currentUser?.role));

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sleek Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 flex flex-col flex-shrink-0 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 flex items-center justify-between border-b border-slate-800/80">
          <div className="flex items-center gap-3.5">
            <img
              src="/logo.png"
              alt="NexGen Council"
              className="h-12 w-12 object-contain drop-shadow-md flex-shrink-0"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div>
              <h1 className="text-white font-bold text-base tracking-tight leading-none">NEXGEN</h1>
              <p className="text-slate-400 text-[10px] uppercase tracking-widest mt-1 font-semibold">Council Platform</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 px-4 py-5 space-y-6 overflow-y-auto">
          <div>
            <div className="text-slate-500 text-[11px] uppercase tracking-wider mb-2 px-2 font-bold">
              Management
            </div>
            <div className="space-y-1">
              {navManagement.map(item => {
                const Icon = item.icon;
                const isActive = adminTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    onClick={() => {
                      setAdminTab(item.tab);
                      setSidebarOpen(false);
                    }}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer text-left font-medium relative ${
                      isActive
                        ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20 font-semibold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span className="flex-1">{item.label}</span>
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-slate-500 text-[11px] uppercase tracking-wider mb-2 px-2 font-bold">
              Organization
            </div>
            <div className="space-y-1">
              {navOrganization.map(item => {
                const Icon = item.icon;
                const isActive = adminTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    onClick={() => {
                      setAdminTab(item.tab);
                      setSidebarOpen(false);
                    }}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer text-left font-medium relative ${
                      isActive
                        ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20 font-semibold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span className="flex-1">{item.label}</span>
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}

              {canAccessAdminTab('contacts', currentUser?.role) && (
                <button
                  type="button"
                  onClick={() => {
                    setActivePage('support-desk');
                    setSidebarOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer text-left font-semibold text-amber-300 hover:text-amber-200 hover:bg-slate-800/80 border border-amber-400/20 mt-2"
                >
                  <Headphones className="w-4 h-4 text-amber-400" />
                  <span className="flex-1">Live Support App</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-75" />
                </button>
              )}
            </div>
          </div>
        </nav>

        {/* User Footer Profile */}
        <div className="p-4 mt-auto border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center text-white text-xs font-bold shrink-0">
              {currentUser?.avatar ? (
                <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
              ) : (
                currentUser?.name?.slice(0, 2).toUpperCase() || 'AD'
              )}
            </div>
            <div className="flex-1 overflow-hidden min-w-0">
              <p className="text-white text-sm font-medium truncate leading-tight">
                {currentUser?.name || 'Alexander Vance'}
              </p>
              <p className="text-slate-500 text-xs truncate mt-0.5">
                {currentUser?.role || 'Super Admin'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowMyIdCard(true)}
                className="text-slate-400 hover:text-amber-400 p-1.5 rounded-lg transition-colors cursor-pointer"
                title="My Official Digital Council ID Card"
                aria-label="My Official Digital Council ID Card"
              >
                <Award className="w-4 h-4 text-amber-400" />
              </button>
              <button
                onClick={() => setIsPasswordModalOpen(true)}
                className="text-slate-400 hover:text-amber-400 p-1.5 rounded-lg transition-colors cursor-pointer"
                title="Change My Password"
                aria-label="Change my password"
              >
                <KeyRound className="w-4 h-4" />
              </button>
              <button
                onClick={logout}
                className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg transition-colors cursor-pointer"
                title="Sign Out"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Developer Watermark in Sidebar */}
          <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-center">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <Code2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Developed by</span>
              <span className="font-bold text-amber-300">Nisha Aslam</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Sleek Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between flex-shrink-0 z-20">
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search records..."
                className="bg-transparent text-sm border-none focus:outline-none w-36 sm:w-64 text-slate-600 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Realtime Status Indicator */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-slate-600 font-medium">Realtime Live</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 font-mono text-[11px]">
                {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            <button
              onClick={() => triggerRealtimeSync(true)}
              disabled={isSyncing}
              title="Force sync data across server and MongoDB"
              className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
            </button>

            <button
              onClick={() => setActivePage('home')}
              className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <span>Public Website</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {canAccessAdminTab('applications', currentUser?.role) && (
              <button
                onClick={() => setAdminTab('applications')}
                className="relative p-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="View Applications Queue"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {pendingApplicationsCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                )}
              </button>
            )}

            {canAccessAdminTab('programs', currentUser?.role) && (
              <>
                <div className="h-8 w-[1px] bg-slate-200 mx-1 hidden sm:block"></div>
                <button
                  onClick={() => setAdminTab('programs')}
                  className="bg-blue-600 text-white text-xs sm:text-sm font-medium px-3.5 sm:px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">New Program</span>
                  <span className="sm:hidden">New</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Scrollable Dashboard Body */}
        <div className="flex-1 p-4 sm:p-8 overflow-y-auto flex flex-col justify-between">
          <div className="max-w-7xl mx-auto w-full">{children}</div>

          {/* Admin Workspace Footer & Developer Watermark */}
          <footer className="max-w-7xl mx-auto w-full mt-12 pt-6 pb-2 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <p>© {new Date().getFullYear()} NexGen Council Administrative Console. All rights reserved.</p>
            <div className="inline-flex items-center gap-1.5 font-medium text-slate-600 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-2xs">
              <Code2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Platform Developed by</span>
              <span className="font-bold text-slate-900">Nisha Aslam</span>
            </div>
          </footer>
        </div>
      </main>

      {/* Account Profile Security Modal (2FA & Password Rotation) */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-950">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-slate-900 leading-none">
                    Account Security &amp; 2FA
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Google Authenticator protection &amp; password rotation
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsPasswordModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <TwoFactorSettingsCard variant="modal" />

            <form onSubmit={handleChangeOwnPassword} className="space-y-4 text-xs pt-2 border-t border-slate-100">
              <div className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Update Account Password
              </div>
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Current Password *
                </label>
                <div className="relative">
                  <input
                    type={showPwdFields ? 'text' : 'password'}
                    required
                    value={pwdForm.currentPassword}
                    onChange={e => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                    placeholder="Enter your current password"
                    className="w-full px-3 py-2.5 pr-9 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwdFields(!showPwdFields)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPwdFields ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  New Password * (Min 8 chars)
                </label>
                <input
                  type={showPwdFields ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={pwdForm.newPassword}
                  onChange={e => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                  placeholder="Use letters, numbers & symbols"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Confirm New Password *
                </label>
                <input
                  type={showPwdFields ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={pwdForm.confirmPassword}
                  onChange={e => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                  placeholder="Re-enter new password"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-900/20 text-slate-900 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPwd}
                  className="px-5 py-2.5 bg-indigo-950 text-white rounded-xl font-bold hover:bg-indigo-900 transition-colors shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" />
                  <span>{savingPwd ? 'Updating...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Council ID Card Modal for Staff / Admin */}
      {showMyIdCard && currentUser && (
        <VolunteerIdCardModal
          volunteer={{
            id: currentUser.id || 'staff_exec',
            fullName: currentUser.name || currentUser.username || 'Council Executive Officer',
            email: currentUser.email,
            assignedRole: (currentUser.role || 'Executive Member').replace(/_/g, ' '),
            city: 'National Secretariat',
            joinedDate: currentUser.createdAt || '2026-01-01',
            status: 'Active',
            membershipTier: 'Executive Council Member',
            avatar: currentUser.avatar,
            hoursContributed: 120
          }}
          onClose={() => setShowMyIdCard(false)}
        />
      )}
    </div>
  );
};
