import React, { useState } from 'react';
import { useApp, AdminTab } from '../../context/AppContext.tsx';
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
  ChevronRight,
  Bell,
  Search,
  Plus,
  Database,
  RefreshCw,
  Radio
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
    triggerRealtimeSync
  } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navManagement: { tab: AdminTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { tab: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { tab: 'analytics', label: 'Live Analytics', icon: Radio },
    { tab: 'applications', label: 'Applications', icon: FileCheck2, badge: pendingApplicationsCount },
    { tab: 'volunteers', label: 'Volunteers', icon: Users },
    { tab: 'programs', label: 'Programs', icon: Award },
    { tab: 'events', label: 'Events', icon: Calendar },
    { tab: 'news', label: 'News & CMS', icon: Newspaper }
  ];

  const navOrganization: { tab: AdminTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { tab: 'team', label: 'Team', icon: UserCheck },
    { tab: 'gallery', label: 'Gallery', icon: ImageIcon },
    { tab: 'contacts', label: 'Inquiries', icon: Mail, badge: unreadContactsCount },
    { tab: 'settings', label: 'Settings', icon: Settings },
    { tab: 'users', label: 'Access Control', icon: ShieldCheck },
    { tab: 'database', label: 'Database & MongoDB', icon: Database },
    { tab: 'activity', label: 'Activity Logs', icon: Activity }
  ];

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
              <h1 className="text-white font-bold text-base tracking-tight leading-none">NEXTGEN</h1>
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
            </div>
          </div>
        </nav>

        {/* User Footer Profile */}
        <div className="p-4 mt-auto border-t border-slate-800">
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
              onClick={triggerRealtimeSync}
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

            <button
              onClick={() => setAdminTab('applications')}
              className="relative p-2 text-slate-400 hover:text-slate-600 cursor-pointer"
              title="View Applications Queue"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>

            <div className="h-8 w-[1px] bg-slate-200 mx-1 hidden sm:block"></div>

            <button
              onClick={() => setAdminTab('programs')}
              className="bg-blue-600 text-white text-xs sm:text-sm font-medium px-3.5 sm:px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Program</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </header>

        {/* Scrollable Dashboard Body */}
        <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
};
