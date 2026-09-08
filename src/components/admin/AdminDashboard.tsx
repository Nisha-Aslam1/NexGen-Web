import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Users,
  Clock,
  CheckCircle2,
  FileText,
  Award,
  Calendar,
  Mail,
  Download,
  Plus,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Activity,
  AlertCircle,
  RefreshCw,
  Database,
  ShieldCheck,
  Zap,
  Globe,
  Eye,
  Smartphone,
  Laptop,
  Radio,
  Compass
} from 'lucide-react';
import { DashboardStats, VolunteerApplication, ActivityLog } from '../../types.ts';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export const AdminDashboard: React.FC = () => {
  const { setAdminTab, addToast, isSyncing, triggerRealtimeSync } = useApp();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentApps, setRecentApps] = useState<VolunteerApplication[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [realtimeInsights, setRealtimeInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statsRes, appsRes, logsRes, realtimeRes] = await Promise.all([
        authFetch('/api/analytics').then(r => r.json()),
        authFetch('/api/applications?limit=5').then(r => r.json()),
        authFetch('/api/activity-logs?limit=6').then(r => r.json()),
        authFetch('/api/analytics/realtime').then(r => r.json()).catch(() => null)
      ]);

      setStats(statsRes);
      const appsList = Array.isArray(appsRes) ? appsRes : (Array.isArray(appsRes?.data) ? appsRes.data : []);
      setRecentApps(appsList.slice(0, 5));
      if (Array.isArray(logsRes)) setLogs(logsRes.slice(0, 6));
      if (realtimeRes) setRealtimeInsights(realtimeRes);
    } catch (err: any) {
      if (!silent) {
        console.error(err);
        addToast('Error refreshing analytics metrics', 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // Real-time polling every 6 seconds for live telemetry
    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchDashboardData(true), triggerRealtimeSync()]);
    setRefreshing(false);
    addToast('Dashboard data updated in realtime.', 'success');
  };

  const handleQuickApprove = async (e: React.MouseEvent, appId: string, appName: string) => {
    e.stopPropagation();
    try {
      const res = await authFetch(`/api/applications/${appId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Approved' })
      });
      if (res.ok) {
        addToast(`Application for ${appName} approved!`, 'success');
        setRecentApps(prev => prev.map(a => a.id === appId ? { ...a, status: 'Approved' } : a));
        fetchDashboardData(true);
      }
    } catch {
      addToast('Error approving application', 'error');
    }
  };

  const handleExportCSV = () => {
    window.open('/api/applications/export/csv', '_blank');
    addToast('Initiating volunteer applications export...', 'info');
  };

  const monthlyData = stats?.monthlyApplications && stats.monthlyApplications.length > 0
    ? stats.monthlyApplications.map(m => ({ month: m.month, apps: m.count }))
    : [];

  const interestData = (stats?.interestDistribution && stats.interestDistribution.length > 0)
    ? stats.interestDistribution.map((item, idx) => ({
        name: item.name,
        value: item.count,
        color: ['#2563eb', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#06b6d4'][idx % 6]
      }))
    : [];

  return (
    <div className="space-y-8 font-sans">
      {/* Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold text-slate-900">Organization Overview</h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Realtime Active
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-0.5">
            Real-time tracking of mission impact, volunteer intake, and program metrics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
            title="Refresh analytics data"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            onClick={() => setAdminTab('applications')}
            className="bg-blue-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
          >
            Review Queue
          </button>
        </div>
      </div>

      {/* Infrastructure & Live Telemetry Quick Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 px-5 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center flex-shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">MongoDB &amp; Live Telemetry Engine</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Connected &amp; Live
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Zero mock data. Real-time telemetry pipeline tracking active visitors and database collections.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdminTab('analytics')}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Open Live Analytics</span>
          </button>
          <button
            onClick={() => setAdminTab('database')}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/60 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <span>Database Status</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-emerald-600 text-xs font-bold">Realtime</span>
          </div>
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Total Volunteers</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.totalVolunteers ?? 0}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <span className="text-blue-600 text-xs font-bold">Active</span>
          </div>
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Active Programs</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.totalPrograms ?? 0}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-amber-600 text-xs font-bold">Queue</span>
          </div>
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Pending Applications</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.pendingApplications ?? 0}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
            <span className="text-emerald-600 text-xs font-bold">Scheduled</span>
          </div>
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Upcoming Events</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.totalEvents ?? 0}</p>
        </div>
      </div>

      {/* Realtime Traffic & Live Visitor Analytics Hub */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 border border-indigo-900/60 shadow-lg space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-indigo-800/40 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">Real-Time Traffic &amp; Visitor Telemetry</h3>
              <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                MongoDB Aggregation
              </span>
            </div>
            <p className="text-xs text-indigo-200/80 mt-1">
              Live streaming audience insights, real-time page hits, and active sessions tracked persistently.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-xl bg-indigo-900/50 border border-indigo-700/40 flex items-center gap-2 text-xs text-indigo-200">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Auto-refresh: <strong>6s</strong></span>
            </div>
          </div>
        </div>

        {/* Real-time KPI Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-800/60 backdrop-blur-xs rounded-2xl p-4 border border-indigo-500/20">
            <div className="flex items-center justify-between text-indigo-300 text-xs font-semibold mb-2">
              <span>Active Right Now</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <p className="text-3xl font-extrabold text-white tracking-tight">
              {realtimeInsights?.activeVisitors ?? 1}
            </p>
            <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Concurrent visitors
            </p>
          </div>

          <div className="bg-slate-800/60 backdrop-blur-xs rounded-2xl p-4 border border-indigo-500/20">
            <div className="flex items-center justify-between text-indigo-300 text-xs font-semibold mb-2">
              <span>Today's Views</span>
              <Eye className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <p className="text-3xl font-extrabold text-white tracking-tight">
              {realtimeInsights?.todayPageViews ?? 0}
            </p>
            <p className="text-[11px] text-indigo-300 mt-1">
              Total site views: {realtimeInsights?.totalPageViews ?? 0}
            </p>
          </div>

          <div className="bg-slate-800/60 backdrop-blur-xs rounded-2xl p-4 border border-indigo-500/20">
            <div className="flex items-center justify-between text-indigo-300 text-xs font-semibold mb-2">
              <span>Unique Reach</span>
              <Globe className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <p className="text-3xl font-extrabold text-white tracking-tight">
              {realtimeInsights?.uniqueVisitors ?? 0}
            </p>
            <p className="text-[11px] text-purple-300 mt-1">Unique client sessions</p>
          </div>

          <div className="bg-slate-800/60 backdrop-blur-xs rounded-2xl p-4 border border-indigo-500/20">
            <div className="flex items-center justify-between text-indigo-300 text-xs font-semibold mb-2">
              <span>Conversion Rate</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <p className="text-3xl font-extrabold text-amber-300 tracking-tight">
              {realtimeInsights?.conversionRate ?? 0}%
            </p>
            <p className="text-[11px] text-amber-200/80 mt-1">Visitor to Volunteer ratio</p>
          </div>
        </div>

        {/* Real-time Charts & Live Visitor Streams */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
          {/* Traffic Flow Graph */}
          <div className="lg:col-span-2 bg-slate-800/40 rounded-2xl p-5 border border-indigo-500/20 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-semibold text-white text-sm">24-Hour Traffic Trend</h4>
                <p className="text-[11px] text-indigo-300">Live hourly impressions distribution</p>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                Today
              </span>
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={realtimeInsights?.hourlyTraffic || []}>
                  <defs>
                    <linearGradient id="trafficGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #312e81', color: '#fff', fontSize: '11px' }}
                  />
                  <Area type="monotone" dataKey="views" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#trafficGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Top Visited Pages row */}
            <div className="mt-4 pt-3 border-t border-indigo-800/40">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300 mb-2">
                Top Visited Content
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(realtimeInsights?.topPages || []).slice(0, 4).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-slate-900/50 border border-indigo-900/30 text-xs">
                    <span className="text-slate-200 font-medium truncate max-w-[140px]">/{p.page}</span>
                    <span className="px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 font-mono text-[11px] font-bold">
                      {p.views} views
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Real-time Visitor Stream & Devices */}
          <div className="bg-slate-800/40 rounded-2xl p-5 border border-indigo-500/20 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-white text-sm">Live Stream Activity</h4>
                <span className="text-[10px] text-emerald-400 font-mono animate-pulse">● STREAMING</span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {(realtimeInsights?.recentActivity || []).length === 0 ? (
                  <p className="text-xs text-indigo-300/60 py-4 text-center">No visitor events recorded yet.</p>
                ) : (
                  (realtimeInsights?.recentActivity || []).slice(0, 5).map((act: any, idx: number) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-slate-900/60 border border-indigo-900/30 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {act.device === 'Mobile' ? (
                          <Smartphone className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        ) : (
                          <Laptop className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        )}
                        <div>
                          <p className="text-slate-200 font-medium leading-none">Viewed /{act.page}</p>
                          <p className="text-[10px] text-indigo-400/80 mt-0.5">{act.browser} &bull; {act.device}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Device breakdown */}
            <div className="pt-3 border-t border-indigo-800/40">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300 mb-2">
                Device Platforms
              </p>
              <div className="flex items-center gap-3">
                {(realtimeInsights?.deviceBreakdown || []).map((dev: any, i: number) => (
                  <div key={i} className="flex-1 p-2 rounded-xl bg-slate-900/50 border border-indigo-900/30 text-center">
                    <p className="text-[10px] text-slate-400 font-medium">{dev.name}</p>
                    <p className="text-xs font-bold text-white mt-0.5">{dev.percentage}%</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Applications & Impact Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Applications Table (Col Span 2) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Recent Volunteer Applications</h3>
            <button
              onClick={() => setAdminTab('applications')}
              className="text-blue-600 text-xs font-semibold hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 text-slate-400 text-[11px] uppercase tracking-wider font-bold">
                  <th className="px-6 py-4">Applicant</th>
                  <th className="px-6 py-4">Interest Area</th>
                  <th className="px-6 py-4">Applied Date</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {recentApps.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-xs">
                      No applications currently in queue.
                    </td>
                  </tr>
                ) : (
                  recentApps.map(app => (
                    <tr
                      key={app.id}
                      onClick={() => setAdminTab('applications')}
                      className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 text-xs shrink-0">
                          {app.fullName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 leading-none">{app.fullName}</p>
                          <p className="text-slate-500 text-[11px] mt-1">{app.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-xs">
                        {app.preferredRole || 'Community Outreach'}
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {new Date(app.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase ${
                            app.status === 'Approved'
                              ? 'bg-emerald-50 text-emerald-700'
                              : app.status === 'Under Review'
                              ? 'bg-blue-50 text-blue-700'
                              : app.status === 'Pending'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {app.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {app.status !== 'Approved' ? (
                          <button
                            onClick={(e) => handleQuickApprove(e, app.id, app.fullName)}
                            title="Quickly approve application"
                            className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                          >
                            Approve
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">Approved ✓</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Impact Statistics & Activity Feed (Col Span 1) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 mb-6">Impact Statistics</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-500">Approved Volunteers</span>
                  <span className="text-blue-600 font-bold">
                    {stats?.approvedApplications || stats?.totalVolunteers || 0} active
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, ((stats?.approvedApplications || 0) / Math.max(1, stats?.totalApplications || 1)) * 100))}%`
                    }}
                  ></div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-500">Applications Under Review</span>
                  <span className="text-amber-600 font-bold">
                    {stats?.pendingApplications || 0} in queue
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, ((stats?.pendingApplications || 0) / Math.max(1, stats?.totalApplications || 1)) * 100))}%`
                    }}
                  ></div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">
                    Activity Feed
                  </p>
                  <ul className="space-y-3 mt-3">
                    {logs.length === 0 ? (
                      <li className="text-xs text-slate-400">No activity logged yet.</li>
                    ) : (
                      logs.slice(0, 3).map((log, idx) => (
                        <li key={log.id} className="flex gap-3 text-xs">
                          <div
                            className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${
                              idx % 2 === 0 ? 'bg-blue-600' : 'bg-amber-500'
                            }`}
                          ></div>
                          <p className="text-slate-600 leading-snug">
                            <strong className="text-slate-800">{log.userName}</strong>: {log.action.replace(/_/g, ' ')}
                            {log.target && <span className="text-slate-400 block text-[11px]">{log.target}</span>}
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => setAdminTab('activity')}
            className="w-full py-3 mt-6 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Download Activity Log
          </button>
        </div>
      </div>

      {/* Trajectory & Interest Distribution Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Volunteer Intake Trajectory</h3>
              <p className="text-xs text-slate-500">Monthly applicant submissions across tracks</p>
            </div>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">
              Live Submissions
            </span>
          </div>

          <div className="h-60 w-full pt-2">
            {monthlyData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Awaiting incoming volunteer applications
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '12px', border: 'none' }}
                  />
                  <Bar dataKey="apps" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Interest Distribution</h3>
            <p className="text-xs text-slate-500">Candidate track selections</p>
          </div>

          <div className="h-44 w-full">
            {interestData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Awaiting applicant track selections
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={interestData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={4}>
                    {interestData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '11px', border: 'none' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="space-y-1.5 text-xs text-slate-600">
            {interestData.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center">No categories recorded yet</p>
            ) : (
              interestData.map((d, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 truncate max-w-[170px]">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="truncate">{d.name}</span>
                  </div>
                  <strong className="text-slate-800 shrink-0">{d.value}</strong>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
