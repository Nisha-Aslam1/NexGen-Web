import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Activity,
  Radio,
  Eye,
  Users,
  TrendingUp,
  RefreshCw,
  Clock,
  Compass,
  Laptop,
  Smartphone,
  Tablet,
  Globe,
  CheckCircle2,
  Database,
  ArrowUpRight,
  Sparkles,
  Zap,
  BarChart3,
  Calendar,
  AlertCircle
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export const AdminAnalytics: React.FC = () => {
  const { addToast } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [activeRange, setActiveRange] = useState<'realtime' | 'today' | 'all'>('realtime');

  const fetchAnalytics = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await authFetch('/api/analytics/realtime');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastUpdated(new Date());
      }
    } catch (err: any) {
      if (!silent) {
        addToast('Unable to fetch real-time analytics', 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    // Real-time polling every 5 seconds
    const interval = setInterval(() => {
      fetchAnalytics(true);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics(true);
    setRefreshing(false);
    addToast('Analytics refreshed with live telemetry', 'success');
  };

  const handleTestPing = async () => {
    setPinging(true);
    try {
      const samplePaths = ['/', '/volunteer', '/programs', '/events', '/about', '/contact'];
      const randomPath = samplePaths[Math.floor(Math.random() * samplePaths.length)];
      
      const res = await fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: `test_${Math.random().toString(36).substring(2, 9)}`,
          path: randomPath,
          device: window.innerWidth < 768 ? 'Mobile' : 'Desktop',
          browser: 'Admin Console (Live)',
          os: navigator.userAgent.includes('Mac') ? 'macOS' : (navigator.userAgent.includes('Win') ? 'Windows' : 'Linux'),
          screenWidth: window.innerWidth
        })
      });

      if (res.ok) {
        addToast(`Simulated telemetry event recorded for "${randomPath}"`, 'success');
        await fetchAnalytics(true);
      }
    } catch (err: any) {
      addToast(err.message || 'Error recording test event', 'error');
    } finally {
      setPinging(false);
    }
  };

  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];

  const deviceIcons: Record<string, React.ReactNode> = {
    Desktop: <Laptop className="w-4 h-4 text-blue-500" />,
    Mobile: <Smartphone className="w-4 h-4 text-emerald-500" />,
    Tablet: <Tablet className="w-4 h-4 text-purple-500" />
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Top Header & Realtime Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Real-Time Analytics &amp; Visitor Insights
            </h2>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Live Pipeline
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Real-time telemetry engine synchronized with MongoDB. Zero mock data.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="text-xs text-slate-400 font-medium mr-2 hidden sm:block">
            Updated: <span className="text-slate-700 font-mono">{lastUpdated.toLocaleTimeString()}</span>
          </div>

          <button
            onClick={handleTestPing}
            disabled={pinging}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            title="Simulate a real telemetry ping to observe live reaction"
          >
            <Zap className={`w-3.5 h-3.5 ${pinging ? 'animate-bounce text-blue-600' : 'text-blue-500'}`} />
            <span>{pinging ? 'Pinging...' : 'Send Test Ping'}</span>
          </button>

          <button
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Real-time KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Visitors */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-slate-900 to-slate-950 text-white rounded-3xl p-5 border border-emerald-500/30 shadow-sm relative overflow-hidden">
          <div className="absolute top-4 right-4">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Radio className="w-4 h-4" /> Live Active Visitors
          </div>
          <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            {data?.activeVisitors || 0}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-emerald-400" /> Currently active (last 5 min)
          </p>
        </div>

        {/* Card 2: Today Page Views */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Today's Impressions</span>
            <Eye className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {data?.todayPageViews || 0}
          </div>
          <p className="text-xs text-slate-500">
            Real visitor impressions logged today
          </p>
        </div>

        {/* Card 3: Unique Sessions */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Unique Visitors</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {data?.uniqueVisitors || 0}
          </div>
          <p className="text-xs text-slate-500">
            Distinct visitor sessions logged
          </p>
        </div>

        {/* Card 4: Conversion Rate */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Intake Conversion</span>
            <TrendingUp className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {data?.conversionRate || 0}%
          </div>
          <p className="text-xs text-slate-500">
            Applications per unique visitor
          </p>
        </div>
      </div>

      {/* Live Hourly Traffic Chart */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              Hourly Traffic Volume (Last 12 Hours)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time impressions stream aggregated by hourly intervals
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 self-start sm:self-auto">
            Total Views: {data?.totalPageViews || 0}
          </span>
        </div>

        <div className="h-64 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.hourlyTraffic || []}>
              <defs>
                <linearGradient id="areaTraffic" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderRadius: '12px',
                  border: 'none',
                  color: '#fff',
                  fontSize: '12px'
                }}
              />
              <Area
                type="monotone"
                dataKey="views"
                stroke="#2563eb"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#areaTraffic)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Middle Grid: Top Visited Pages & Demographics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Top Content Pages (Col span 7) */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Compass className="w-4 h-4 text-purple-600" />
                Top Visited Pages
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Breakdown of visited routes and engagement share
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {(data?.topPages || []).length} paths logged
            </span>
          </div>

          {(data?.topPages || []).length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Awaiting visitor telemetry. Click 'Send Test Ping' to trigger a visit.
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {(data?.topPages || []).map((pageItem: any, idx: number) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-800 font-mono">{pageItem.page}</span>
                    <span className="text-slate-500">
                      {pageItem.views} {pageItem.views === 1 ? 'view' : 'views'} ({pageItem.percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pageItem.percentage, 4)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Platform & Devices (Col span 5) */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 shadow-2xs p-6 space-y-5">
          <div className="pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600" />
              Audience &amp; Platform Environment
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live device, browser, and operating system mix
            </p>
          </div>

          {/* Device Distribution */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              Device Form Factor
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {['Desktop', 'Mobile', 'Tablet'].map(deviceType => {
                const found = (data?.deviceBreakdown || []).find((d: any) => d.name === deviceType);
                const count = found?.count || 0;
                const percentage = found?.percentage || 0;
                return (
                  <div key={deviceType} className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-center">
                    <div className="flex justify-center mb-1">
                      {deviceIcons[deviceType] || <Laptop className="w-4 h-4 text-slate-500" />}
                    </div>
                    <div className="text-xs font-bold text-slate-800">{deviceType}</div>
                    <div className="text-sm font-black text-blue-600 mt-0.5">{percentage}%</div>
                    <div className="text-[10px] text-slate-400 font-mono">{count} visits</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Browser & OS Lists */}
          <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Top Browsers
              </h4>
              <div className="space-y-1.5 text-xs">
                {(data?.browserBreakdown || []).slice(0, 4).map((b: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-slate-700">
                    <span className="truncate max-w-[90px]">{b.name}</span>
                    <span className="font-bold font-mono text-slate-900">{b.percentage}%</span>
                  </div>
                ))}
                {(data?.browserBreakdown || []).length === 0 && (
                  <p className="text-[11px] text-slate-400">Awaiting data</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Operating Systems
              </h4>
              <div className="space-y-1.5 text-xs">
                {(data?.osBreakdown || []).slice(0, 4).map((o: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-slate-700">
                    <span className="truncate max-w-[90px]">{o.name}</span>
                    <span className="font-bold font-mono text-slate-900">{o.percentage}%</span>
                  </div>
                ))}
                {(data?.osBreakdown || []).length === 0 && (
                  <p className="text-[11px] text-slate-400">Awaiting data</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Visitor Sessions Monitor */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
              Live Active Visitor Sessions
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Visitors active within the last 5 minutes (via real-time heartbeat)
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            {data?.activeSessionsList?.length || 0} active now
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="px-6 py-3.5">Session ID</th>
                <th className="px-6 py-3.5">Current Route</th>
                <th className="px-6 py-3.5">Device / Platform</th>
                <th className="px-6 py-3.5">Browser &bull; OS</th>
                <th className="px-6 py-3.5">IP Address</th>
                <th className="px-6 py-3.5 text-right">Last Ping</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {(data?.activeSessionsList || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    No active sessions detected at this instant. Visit the website in another tab or send a test ping above.
                  </td>
                </tr>
              ) : (
                (data?.activeSessionsList || []).map((session: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3.5 font-mono text-slate-900 font-semibold">
                      {session.sessionId?.substring(0, 16)}...
                    </td>
                    <td className="px-6 py-3.5 font-mono text-blue-600 font-bold">
                      {session.currentPath || '/'}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[11px]">
                        {session.device || 'Desktop'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-slate-600">
                      {session.browser || 'Chrome'} on {session.os || 'Windows'}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-slate-400 text-[11px]">
                      {session.ip || '127.0.0.1'}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-slate-500">
                      {new Date(session.lastSeen).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Event Stream Feed */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              Live Telemetry Audit Feed
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Chronological log of real visitor navigation events
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Last {(data?.recentActivity || []).length} events
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="px-6 py-3.5">Time</th>
                <th className="px-6 py-3.5">Route</th>
                <th className="px-6 py-3.5">Device</th>
                <th className="px-6 py-3.5">Browser &bull; OS</th>
                <th className="px-6 py-3.5 text-right">Session</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {(data?.recentActivity || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    No visitor events recorded yet.
                  </td>
                </tr>
              ) : (
                (data?.recentActivity || []).map((act: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 font-mono text-slate-500">
                      {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-6 py-3 font-mono font-bold text-blue-600">
                      {act.path || '/'}
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
                        {act.device || 'Desktop'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {act.browser || 'Unknown'} &bull; {act.os || 'Unknown'}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-slate-400 text-[11px]">
                      {act.sessionId?.substring(0, 10)}...
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
