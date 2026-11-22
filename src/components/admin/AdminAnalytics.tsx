import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Activity,
  Radio,
  Eye,
  Users,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Clock,
  Compass,
  Laptop,
  Smartphone,
  Tablet,
  Globe,
  Zap,
  Download,
  Pause,
  Play,
  Search,
  Filter,
  ArrowUpRight,
  MapPin,
  Mail,
  Video,
  MessageSquare,
  X,
  ExternalLink,
  Layers
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
  CartesianGrid
} from 'recharts';

type TimeRange = '1h' | '24h' | '7d' | '30d' | 'all';

function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.round(totalSeconds || 0));
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  if (mins < 60) return `${mins}m ${rem.toString().padStart(2, '0')}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function formatRouteLabel(route?: string): string {
  if (!route || route === '/' || route === 'home') return '/home';
  return route.startsWith('/') ? route : `/${route}`;
}

export const AdminAnalytics: React.FC = () => {
  const { addToast } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Interactive Controls
  const [range, setRange] = useState<TimeRange>('24h');
  const [includeAdmin, setIncludeAdmin] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [chartView, setChartView] = useState<'timeline' | 'heatmap'>('timeline');
  const [contentTab, setContentTab] = useState<'top' | 'entry' | 'exit'>('top');
  const [acqTab, setAcqTab] = useState<'channels' | 'referrers' | 'campaigns'>('channels');
  const [monitorTab, setMonitorTab] = useState<'sessions' | 'events'>('sessions');
  const [searchQuery, setSearchQuery] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<'All' | 'Desktop' | 'Mobile' | 'Tablet'>('All');
  const [inspectedRecord, setInspectedRecord] = useState<{ kind: 'session' | 'event'; record: any } | null>(null);

  const fetchAnalytics = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await authFetch(
          `/api/analytics/realtime?range=${range}&includeAdmin=${includeAdmin}`
        );
        if (res.ok) {
          const json = await res.json();
          setData(json);
          setLastUpdated(new Date());
        }
      } catch {
        if (!silent) {
          addToast('Unable to fetch real-time analytics', 'error');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [range, includeAdmin, addToast]
  );

  useEffect(() => {
    fetchAnalytics(data !== null);
  }, [fetchAnalytics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchAnalytics(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAnalytics]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics(true);
    setRefreshing(false);
    addToast('Analytics synchronized with latest telemetry', 'success');
  };

  const handleTestPing = async () => {
    setPinging(true);
    try {
      const samplePaths = ['home', 'volunteer', 'programs', 'events', 'about', 'contact', 'track'];
      const sampleSources = [
        { referrer: '', trafficSource: 'Direct', referrerDomain: 'Direct' },
        { referrer: 'https://www.google.com/', trafficSource: 'Organic Search', referrerDomain: 'google.com' },
        { referrer: 'https://www.linkedin.com/', trafficSource: 'Social Media', referrerDomain: 'linkedin.com' },
        { referrer: 'https://l.instagram.com/', trafficSource: 'Social Media', referrerDomain: 'l.instagram.com' }
      ];
      const randomPath = samplePaths[Math.floor(Math.random() * samplePaths.length)];
      const randomSrc = sampleSources[Math.floor(Math.random() * sampleSources.length)];
      const simSession = `sim_${Math.random().toString(36).substring(2, 10)}`;

      const res = await fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: simSession,
          visitorId: `vis_${simSession}`,
          isReturning: Math.random() > 0.55,
          isAdmin: false,
          path: randomPath,
          referrer: randomSrc.referrer || undefined,
          referrerDomain: randomSrc.referrerDomain,
          trafficSource: randomSrc.trafficSource,
          device: window.innerWidth < 768 ? 'Mobile' : 'Desktop',
          browser: navigator.userAgent.includes('Edg/') ? 'Edge' : 'Chrome',
          os: navigator.userAgent.includes('Mac')
            ? 'macOS'
            : navigator.userAgent.includes('Win')
            ? 'Windows'
            : 'Linux',
          screenWidth: window.innerWidth,
          screenResolution: `${window.screen.width}x${window.screen.height}`,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator.language
        })
      });

      if (res.ok) {
        addToast(`Telemetry event logged for "/${randomPath}" (${randomSrc.trafficSource})`, 'success');
        await fetchAnalytics(true);
      }
    } catch (err: any) {
      addToast(err.message || 'Error recording test event', 'error');
    } finally {
      setPinging(false);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await authFetch(
        `/api/analytics/export?range=${range}&includeAdmin=${includeAdmin}&format=csv`
      );
      if (!res.ok) {
        throw new Error('Failed to generate analytics export');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexgen-analytics-${range}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      addToast('Analytics CSV report downloaded', 'success');
    } catch (err: any) {
      addToast(err.message || 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  const filteredSessions = useMemo(() => {
    const list = data?.activeSessionsList || [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((s: any) => {
      if (deviceFilter !== 'All' && (s.device || 'Desktop') !== deviceFilter) return false;
      if (!q) return true;
      return [
        s.sessionId,
        s.currentPath,
        s.entryPath,
        s.device,
        s.browser,
        s.os,
        s.trafficSource,
        s.referrerDomain,
        s.timezone,
        s.ip
      ]
        .filter(Boolean)
        .some(val => String(val).toLowerCase().includes(q));
    });
  }, [data?.activeSessionsList, searchQuery, deviceFilter]);

  const filteredEvents = useMemo(() => {
    const list = data?.recentActivity || [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((ev: any) => {
      if (deviceFilter !== 'All' && (ev.device || 'Desktop') !== deviceFilter) return false;
      if (!q) return true;
      return [
        ev.path,
        ev.sessionId,
        ev.device,
        ev.browser,
        ev.os,
        ev.trafficSource,
        ev.referrerDomain,
        ev.timezone,
        ev.ip
      ]
        .filter(Boolean)
        .some(val => String(val).toLowerCase().includes(q));
    });
  }, [data?.recentActivity, searchQuery, deviceFilter]);

  const deviceIcons: Record<string, React.ReactNode> = {
    Desktop: <Laptop className="w-4 h-4 text-blue-600" />,
    Mobile: <Smartphone className="w-4 h-4 text-emerald-600" />,
    Tablet: <Tablet className="w-4 h-4 text-indigo-600" />
  };

  const rangeLabels: { key: TimeRange; label: string }[] = [
    { key: '1h', label: '1H' },
    { key: '24h', label: '24H' },
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: 'all', label: 'All Time' }
  ];

  const engagement = data?.engagement || {};
  const org = data?.orgIntelligence || {};
  const funnel = data?.conversionFunnel || [];

  const renderDelta = (delta: number | null | undefined) => {
    if (delta === null || delta === undefined) {
      return <span className="text-[11px] text-slate-400 font-mono">Prior window: no baseline</span>;
    }
    const positive = delta >= 0;
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-mono font-semibold tabular-nums ${
          positive ? 'text-emerald-600' : 'text-rose-600'
        }`}
      >
        {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {positive ? `+${delta}%` : `${delta}%`} vs prior
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-14 bg-white border border-slate-200 rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-8 h-80 bg-white border border-slate-200 rounded-2xl" />
          <div className="xl:col-span-4 h-80 bg-white border border-slate-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans text-slate-900">
      {/* Top Bar & Control Ribbon */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Analytics &amp; Telemetry Command Center
            </h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-700">
              {autoRefresh && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                </span>
              )}
              {autoRefresh ? 'Live Stream (5s)' : 'Stream Paused'}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-mono">
            Storage: {data?.rangeMeta?.storageMode === 'mongodb' ? 'MongoDB Cluster' : 'Local Persistent Engine'}
            {' · '}
            Last sync: {lastUpdated.toLocaleTimeString()}
            {' · '}
            Scope: {includeAdmin ? 'Public + Admin Routes' : 'Public Audience Only'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Segmented Control */}
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            {rangeLabels.map(item => (
              <button
                key={item.key}
                onClick={() => setRange(item.key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  range === item.key
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Public vs All Scope Switch */}
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              onClick={() => setIncludeAdmin(false)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                !includeAdmin ? 'bg-white text-slate-900 border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Public Site
            </button>
            <button
              onClick={() => setIncludeAdmin(true)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                includeAdmin ? 'bg-white text-slate-900 border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Traffic
            </button>
          </div>

          {/* Live Sync Pause/Resume */}
          <button
            onClick={() => setAutoRefresh(prev => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              autoRefresh
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
            }`}
            title={autoRefresh ? 'Pause 5-second auto-refresh' : 'Resume live 5-second updates'}
          >
            {autoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{autoRefresh ? 'Live' : 'Paused'}</span>
          </button>

          <button
            onClick={handleTestPing}
            disabled={pinging}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
            title="Send a realistic public visitor telemetry ping"
          >
            <Zap className={`w-3.5 h-3.5 ${pinging ? 'animate-bounce' : ''}`} />
            <span>{pinging ? 'Sending...' : 'Test Ping'}</span>
          </button>

          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {/* Executive 6-Metric KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* KPI 1: Live Active Visitors */}
        <div className="bg-slate-900 text-white rounded-2xl p-4 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-emerald-400">
            <span>Active Now</span>
            <Radio className="w-3.5 h-3.5" />
          </div>
          <div className="text-3xl font-black tracking-tight tabular-nums font-mono mt-2">
            {data?.activeVisitors ?? 0}
          </div>
          <p className="text-[11px] text-slate-400 font-mono mt-1.5 tabular-nums">
            Public: {data?.activePublicVisitors ?? 0} · Admin: {data?.activeAdminVisitors ?? 0}
          </p>
        </div>

        {/* KPI 2: Range Impressions */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <span>Impressions</span>
            <Eye className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight tabular-nums font-mono mt-2">
            {(data?.rangePageViews ?? data?.totalPageViews ?? 0).toLocaleString()}
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            {renderDelta(engagement.viewsDeltaPct)}
          </div>
        </div>

        {/* KPI 3: Unique Sessions & New/Returning */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <span>Unique Sessions</span>
            <Users className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight tabular-nums font-mono mt-2">
            {(engagement.rangeUniqueSessions ?? data?.uniqueVisitors ?? 0).toLocaleString()}
          </div>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {renderDelta(engagement.sessionsDeltaPct)}
            <span className="text-[11px] text-slate-500 font-mono tabular-nums">
              New: {engagement.newVisitors ?? 0} · Ret: {engagement.returningVisitors ?? 0}
            </span>
          </div>
        </div>

        {/* KPI 4: Avg Session Duration */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <span>Avg. Dwell Time</span>
            <Clock className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight tabular-nums font-mono mt-2">
            {formatDuration(engagement.avgSessionDurationSec || 0)}
          </div>
          <p className="text-[11px] text-slate-500 font-mono mt-1.5 tabular-nums">
            {engagement.avgPagesPerSession ?? 0} pages / session
          </p>
        </div>

        {/* KPI 5: Bounce Rate */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <span>Bounce Rate</span>
            <Activity className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight tabular-nums font-mono mt-2">
            {engagement.bounceRate ?? 0}%
          </div>
          <p className="text-[11px] text-slate-500 font-mono mt-1.5 tabular-nums">
            Returning rate: {engagement.returningRate ?? 0}%
          </p>
        </div>

        {/* KPI 6: Volunteer Intake Conversion */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <span>Intake Conversion</span>
            <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight tabular-nums font-mono mt-2">
            {data?.conversionRate ?? 0}%
          </div>
          <p className="text-[11px] text-slate-500 font-mono mt-1.5 tabular-nums">
            Apps: {org.totalApplications ?? 0} · Approved: {org.approvedApplications ?? 0}
          </p>
        </div>
      </div>

      {/* Primary Row: Traffic Trajectory / Peak Hours (8 Cols) + Conversion Funnel & Ops Mix (4 Cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Traffic & Peak Analysis Chart */}
        <div className="xl:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" />
                {chartView === 'timeline'
                  ? `Traffic & Session Trajectory (${range.toUpperCase()})`
                  : '24-Hour Peak Activity Distribution'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">
                {chartView === 'timeline'
                  ? `Today: ${data?.todayPageViews ?? 0} views · All-time: ${(data?.totalPageViews ?? 0).toLocaleString()} views`
                  : `Peak traffic window: ${data?.peakHourLabel || 'No traffic yet'}`}
              </p>
            </div>

            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
              <button
                onClick={() => setChartView('timeline')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  chartView === 'timeline' ? 'bg-white text-slate-900 border border-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Timeline
              </button>
              <button
                onClick={() => setChartView('heatmap')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  chartView === 'heatmap' ? 'bg-white text-slate-900 border border-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Peak Hours
              </button>
            </div>
          </div>

          <div className="h-72 w-full pt-5">
            <ResponsiveContainer width="100%" height="100%">
              {chartView === 'timeline' ? (
                <AreaChart data={data?.trafficTimeline || []}>
                  <defs>
                    <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="sessionsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '10px',
                      border: '1px solid #1e293b',
                      color: '#fff',
                      fontSize: '12px'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    name="Page Views"
                    stroke="#2563eb"
                    strokeWidth={2.25}
                    fillOpacity={1}
                    fill="url(#viewsGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="sessions"
                    name="Unique Sessions"
                    stroke="#16a34a"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#sessionsGrad)"
                  />
                </AreaChart>
              ) : (
                <BarChart data={data?.hourlyHeatmap || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} interval={2} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '10px',
                      border: '1px solid #1e293b',
                      color: '#fff',
                      fontSize: '12px'
                    }}
                  />
                  <Bar dataKey="views" name="Impressions" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Series Legend Footer */}
          <div className="pt-3 mt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block" /> Page Views
              </span>
              {chartView === 'timeline' && (
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" /> Unique Sessions
                </span>
              )}
            </div>
            <span className="font-mono text-[11px] tabular-nums">
              Peak Hour: <strong className="text-slate-800">{data?.peakHourLabel || 'N/A'}</strong>
            </span>
          </div>
        </div>

        {/* Visitor-to-Volunteer Funnel + Secretariat Operations Mix */}
        <div className="xl:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col justify-between space-y-5">
          <div>
            <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Recruitment Funnel
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visitor reach to approved volunteer pipeline
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-500 tabular-nums">
                {org.pendingApplications ?? 0} pending
              </span>
            </div>

            <div className="space-y-3 pt-4">
              {funnel.map((step: any, i: number) => (
                <div key={step.stage} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">
                      {i + 1}. {step.stage}
                    </span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {(step.count ?? 0).toLocaleString()} ({step.percentage ?? 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-sm overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        i === 0
                          ? 'bg-slate-800'
                          : i === 1
                          ? 'bg-blue-600'
                          : i === 2
                          ? 'bg-indigo-600'
                          : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.max(step.count > 0 ? 4 : 0, step.percentage || 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Inquiry Attribution & Council Ops Snapshot */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Secretariat &amp; Channel Telemetry
            </h4>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Widget Inquiries</span>
                  <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                  {org.widgetInquiries ?? 0}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Contact Page</span>
                  <Globe className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                  {org.contactPageInquiries ?? 0}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Emails Dispatched</span>
                  <Mail className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                  {org.totalEmailsSent ?? 0}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Council Meetings</span>
                  <Video className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                  {org.totalMeetings ?? 0}
                  {org.liveMeetings > 0 && (
                    <span className="text-[11px] font-semibold text-emerald-600 ml-1">
                      ({org.liveMeetings} live)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Analytical Row: Content Routes (5 Cols) · Traffic Acquisition (4 Cols) · Outreach Reach (3 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Content Performance: Top / Entry / Exit Pages */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Compass className="w-4 h-4 text-blue-600" />
                Route Intelligence
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Views, unique reach &amp; route dwell</p>
            </div>
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
              {(
                [
                  { k: 'top', l: 'Top' },
                  { k: 'entry', l: 'Entry' },
                  { k: 'exit', l: 'Exit' }
                ] as const
              ).map(t => (
                <button
                  key={t.k}
                  onClick={() => setContentTab(t.k)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    contentTab === t.k ? 'bg-white text-slate-900 border border-slate-200' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.l}
                </button>
              ))}
            </div>
          </div>

          {contentTab === 'top' && (
            <div className="space-y-3">
              {(data?.topPages || []).length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-400">
                  No route hits in this timeframe. Click Test Ping or browse public pages.
                </p>
              ) : (
                (data?.topPages || []).slice(0, 7).map((p: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-mono font-semibold text-slate-800 truncate">
                        {formatRouteLabel(p.page)}
                      </span>
                      <span className="font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {p.views} views · {p.uniqueVisitors} sess · {formatDuration(p.avgDwellSec)} avg ({p.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${Math.max(p.percentage || 0, 3)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {contentTab !== 'top' && (
            <div className="space-y-3">
              {((contentTab === 'entry'
                ? data?.entryExitPages?.topEntryPages
                : data?.entryExitPages?.topExitPages) || []
              ).length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-400">No session path data yet.</p>
              ) : (
                (
                  (contentTab === 'entry'
                    ? data?.entryExitPages?.topEntryPages
                    : data?.entryExitPages?.topExitPages) || []
                ).map((item: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-slate-800">
                        {formatRouteLabel(item.page)}
                      </span>
                      <span className="font-mono text-slate-600 tabular-nums">
                        {item.sessions} sessions ({item.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-sm overflow-hidden">
                      <div
                        className={`h-full ${contentTab === 'entry' ? 'bg-emerald-600' : 'bg-amber-600'}`}
                        style={{ width: `${Math.max(item.percentage || 0, 3)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Acquisition Channels, Referrer Domains & UTM Campaigns */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                Acquisition
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Traffic sources &amp; campaigns</p>
            </div>
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
              {(
                [
                  { k: 'channels', l: 'Channels' },
                  { k: 'referrers', l: 'Referrers' },
                  { k: 'campaigns', l: 'UTM' }
                ] as const
              ).map(t => (
                <button
                  key={t.k}
                  onClick={() => setAcqTab(t.k)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    acqTab === t.k ? 'bg-white text-slate-900 border border-slate-200' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.l}
                </button>
              ))}
            </div>
          </div>

          {acqTab === 'channels' && (
            <div className="space-y-3">
              {(data?.acquisition?.channels || []).length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-400">No channel telemetry in range.</p>
              ) : (
                (data?.acquisition?.channels || []).map((ch: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">{ch.name}</span>
                      <span className="font-mono text-slate-600 tabular-nums">
                        {ch.sessions} sess · {ch.count} views ({ch.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-emerald-600"
                        style={{ width: `${Math.max(ch.percentage || 0, 3)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {acqTab === 'referrers' && (
            <div className="space-y-2.5">
              {(data?.acquisition?.referrers || []).length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-400">No referrer domains captured yet.</p>
              ) : (
                (data?.acquisition?.referrers || []).map((ref: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0 text-xs"
                  >
                    <span className="font-mono font-medium text-slate-800 flex items-center gap-1.5 truncate">
                      <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                      {ref.domain}
                    </span>
                    <span className="font-mono font-semibold text-slate-700 tabular-nums">
                      {ref.count} ({ref.percentage}%)
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {acqTab === 'campaigns' && (
            <div className="space-y-2.5">
              {(data?.acquisition?.campaigns || []).length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                  <p>No UTM campaign parameters detected yet.</p>
                  <p className="font-mono text-[11px] text-slate-400">
                    Share links with ?utm_source=...&amp;utm_campaign=...
                  </p>
                </div>
              ) : (
                (data?.acquisition?.campaigns || []).map((c: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">{c.campaign}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {c.source} / {c.medium}
                      </div>
                    </div>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">{c.count} hits</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Organizational Outreach: Applicant Cities & Interest Tracks */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-600" />
              Outreach Reach
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Applicant cities &amp; focus tracks</p>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Top Applicant Cities
            </h4>
            {(org.cityDistribution || []).length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No city data submitted yet</p>
            ) : (
              <div className="space-y-1.5 text-xs">
                {(org.cityDistribution || []).map((c: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-slate-700">
                    <span className="truncate font-medium">{c.city}</span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">{c.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Top Volunteer Tracks
            </h4>
            {(org.interestDistribution || []).length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No track preferences recorded</p>
            ) : (
              <div className="space-y-1.5 text-xs">
                {(org.interestDistribution || []).slice(0, 5).map((ia: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-slate-700">
                    <span className="truncate max-w-[165px]" title={ia.name}>
                      {ia.name}
                    </span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">{ia.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Environment & Client Capabilities Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600" />
              Audience Environment &amp; Technical Telemetry
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Devices, browsers, operating systems, display resolutions, and visitor timezones
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
          {/* Device Form Factor */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              Device Form Factor
            </h4>
            <div className="space-y-2">
              {['Desktop', 'Mobile', 'Tablet'].map(deviceType => {
                const found = (data?.deviceBreakdown || []).find((d: any) => d.name === deviceType);
                const count = found?.count || 0;
                const percentage = found?.percentage || 0;
                return (
                  <div
                    key={deviceType}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                  >
                    <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
                      {deviceIcons[deviceType]}
                      {deviceType}
                    </span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {count} ({percentage}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Browsers */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              Browsers
            </h4>
            <div className="space-y-2 text-xs">
              {(data?.browserBreakdown || []).slice(0, 5).map((b: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-b-0">
                  <span className="text-slate-700 font-medium truncate">{b.name}</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {b.count} ({b.percentage}%)
                  </span>
                </div>
              ))}
              {(data?.browserBreakdown || []).length === 0 && (
                <p className="text-xs text-slate-400">Awaiting browser telemetry</p>
              )}
            </div>
          </div>

          {/* Operating Systems */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              Operating Systems
            </h4>
            <div className="space-y-2 text-xs">
              {(data?.osBreakdown || []).slice(0, 5).map((o: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-b-0">
                  <span className="text-slate-700 font-medium truncate">{o.name}</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {o.count} ({o.percentage}%)
                  </span>
                </div>
              ))}
              {(data?.osBreakdown || []).length === 0 && (
                <p className="text-xs text-slate-400">Awaiting OS telemetry</p>
              )}
            </div>
          </div>

          {/* Screen Resolutions & Timezones */}
          <div className="space-y-4">
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Screen Resolutions
              </h4>
              <div className="space-y-1.5 text-xs">
                {(data?.techDetails?.screenResolutions || []).slice(0, 3).map((r: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="font-mono text-slate-700">{r.resolution}</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">{r.percentage}%</span>
                  </div>
                ))}
                {(data?.techDetails?.screenResolutions || []).length === 0 && (
                  <p className="text-xs text-slate-400">Collecting viewport sizes</p>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Visitor Timezones
              </h4>
              <div className="space-y-1.5 text-xs">
                {(data?.techDetails?.timezones || []).slice(0, 3).map((tz: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center gap-2">
                    <span className="font-mono text-slate-700 truncate">{tz.timezone}</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">{tz.percentage}%</span>
                  </div>
                ))}
                {(data?.techDetails?.timezones || []).length === 0 && (
                  <p className="text-xs text-slate-400">Collecting timezones</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Operations Monitor: Searchable Active Sessions & Telemetry Audit Stream */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                onClick={() => setMonitorTab('sessions')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  monitorTab === 'sessions'
                    ? 'bg-white text-slate-900 border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active Sessions ({filteredSessions.length})
              </button>
              <button
                onClick={() => setMonitorTab('events')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  monitorTab === 'events'
                    ? 'bg-white text-slate-900 border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Telemetry Audit Feed ({filteredEvents.length})
              </button>
            </div>
            <span className="text-xs text-slate-500">
              Click any row to inspect full telemetry attributes
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter route, IP, channel, OS..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 w-56"
              />
            </div>

            {/* Device Filter */}
            <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <Filter className="w-3 h-3 text-slate-400 ml-1.5 mr-0.5" />
              {(['All', 'Desktop', 'Mobile', 'Tablet'] as const).map(dev => (
                <button
                  key={dev}
                  onClick={() => setDeviceFilter(dev)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    deviceFilter === dev
                      ? 'bg-white text-slate-900 border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {dev}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {monitorTab === 'sessions' ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-100">
                  <th className="px-5 py-3">Session / Visitor</th>
                  <th className="px-5 py-3">Current Route</th>
                  <th className="px-5 py-3">Source Channel</th>
                  <th className="px-5 py-3">Device · Platform</th>
                  <th className="px-5 py-3 text-right">Pages</th>
                  <th className="px-5 py-3 text-right">Dwell</th>
                  <th className="px-5 py-3 text-right">Last Ping</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                      No matching active visitor sessions in the last 5 minutes.
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map((session: any, idx: number) => (
                    <tr
                      key={session.sessionId || idx}
                      onClick={() => setInspectedRecord({ kind: 'session', record: session })}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3 font-mono">
                        <div className="font-semibold text-slate-900">
                          {session.sessionId?.slice(0, 14)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {session.isReturning ? 'Returning' : 'New'} · {session.ip || '127.0.0.1'}
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono font-bold text-blue-600">
                        {formatRouteLabel(session.currentPath)}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {session.trafficSource || 'Direct'}
                        {session.referrerDomain && session.referrerDomain !== 'Direct' && (
                          <span className="text-slate-400 font-mono text-[11px] ml-1">
                            ({session.referrerDomain})
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {session.device || 'Desktop'} · {session.browser || 'Chrome'} / {session.os || 'Unknown'}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {session.pageViewsInSession || 1}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700">
                        {formatDuration(session.durationSeconds || 0)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-500">
                        {new Date(session.lastSeen).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-100">
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Route</th>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Environment</th>
                  <th className="px-5 py-3">Timezone / Resolution</th>
                  <th className="px-5 py-3 text-right">Session</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                      No matching telemetry events recorded in this timeframe.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((act: any, idx: number) => (
                    <tr
                      key={`${act.sessionId}-${act.timestamp}-${idx}`}
                      onClick={() => setInspectedRecord({ kind: 'event', record: act })}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-2.5 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {new Date(act.timestamp).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </td>
                      <td className="px-5 py-2.5 font-mono font-bold text-blue-600">
                        {formatRouteLabel(act.path)}
                      </td>
                      <td className="px-5 py-2.5 text-slate-700">
                        {act.trafficSource || 'Direct'}
                        {act.utmCampaign && (
                          <span className="text-[11px] font-mono text-indigo-600 ml-1">
                            [{act.utmCampaign}]
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-slate-600">
                        {act.device || 'Desktop'} · {act.browser || 'Unknown'} · {act.os || 'Unknown'}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-[11px] text-slate-500">
                        {act.timezone || '—'} · {act.screenResolution || (act.screenWidth ? `${act.screenWidth}w` : '—')}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-slate-500 tabular-nums">
                        {act.sessionId?.slice(0, 12)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Full Telemetry Inspector Modal */}
      {inspectedRecord && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          onClick={() => setInspectedRecord(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-base">
                  {inspectedRecord.kind === 'session'
                    ? 'Active Session Telemetry Inspector'
                    : 'Telemetry Event Inspector'}
                </h4>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {inspectedRecord.record.sessionId}
                </p>
              </div>
              <button
                onClick={() => setInspectedRecord(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close telemetry inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {Object.entries(inspectedRecord.record)
                  .filter(([, v]) => v !== undefined && v !== null && v !== '')
                  .map(([key, value]) => (
                    <div key={key} className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {key}
                      </dt>
                      <dd className="font-mono text-slate-800 mt-1 break-all">
                        {value instanceof Date
                          ? value.toISOString()
                          : typeof value === 'boolean'
                          ? value
                            ? 'true'
                            : 'false'
                          : String(value)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
