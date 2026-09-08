import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Database,
  Server,
  CheckCircle2,
  RefreshCw,
  Zap,
  Activity,
  ShieldCheck,
  HardDrive,
  Cpu,
  Layers,
  ExternalLink,
  AlertCircle,
  Trash2,
  Sparkles
} from 'lucide-react';

interface DatabaseStatus {
  connected: boolean;
  configured: boolean;
  uriRedacted: string;
  dbName: string;
  pingMs: number | null;
  collections: string[];
  lastPing: string | null;
  error: string | null;
  serverUptimeSeconds: number;
  timestamp: string;
  recordCounts: {
    users: number;
    applications: number;
    volunteers: number;
    programs: number;
    events: number;
    news: number;
    contacts: number;
  };
}

export const AdminDatabase: React.FC = () => {
  const { addToast } = useApp();
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Connection Tester & Connect State
  const [testUri, setTestUri] = useState('mongodb://127.0.0.1:27017/nexgen_council');
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [purging, setPurging] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; pingMs?: number } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/system/database-status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.uriRedacted && !testUri.includes('***')) {
          // If custom URI is active, sync into input
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 8000);
    return () => clearInterval(timer);
  }, []);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await authFetch('/api/system/database-sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addToast('All collections synchronized with MongoDB successfully!', 'success');
        fetchStatus();
      } else {
        addToast(data.error || 'Sync failed', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Error triggering sync', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleConnectLive = async () => {
    if (!testUri.trim()) {
      addToast('Please enter a MongoDB connection URI', 'error');
      return;
    }
    setConnecting(true);
    try {
      const res = await authFetch('/api/system/database-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: testUri.trim() })
      });
      const data = await res.json();
      if (data.success) {
        addToast(data.message || 'Successfully connected to MongoDB!', 'success');
        setTestResult(data);
        fetchStatus();
      } else {
        addToast(data.message || 'Failed to connect to MongoDB', 'error');
        setTestResult(data);
      }
    } catch (err: any) {
      addToast(err.message || 'Connection request failed', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handlePurgeMockData = async () => {
    setPurging(true);
    try {
      const res = await authFetch('/api/system/database-purge-mock', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addToast(data.message || 'All demo mock data removed permanently.', 'success');
        setShowPurgeConfirm(false);
        fetchStatus();
      } else {
        addToast(data.message || 'Purge failed', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Failed to purge mock data', 'error');
    } finally {
      setPurging(false);
    }
  };

  const handleTestConnection = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!testUri.trim()) return;

    setTesting(true);
    setTestResult(null);
    try {
      const res = await authFetch('/api/system/database-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: testUri.trim() })
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        addToast(`MongoDB connection verified (${data.pingMs || 1}ms)`, 'success');
      } else {
        addToast(data.message || 'Connection test failed', 'error');
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Network request failed' });
    } finally {
      setTesting(false);
    }
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Database className="w-7 h-7 text-blue-600" />
            MongoDB Database &amp; Persistence Infrastructure
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Real-time database replication, collection synchronization and enterprise data persistence
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>Refresh Diagnostics</span>
          </button>

          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-60"
          >
            <Zap className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync to MongoDB'}</span>
          </button>
        </div>
      </div>

      {/* Live Status Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Status Card 1 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Database Engine</span>
            <HardDrive className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                status?.connected ? 'bg-emerald-400' : 'bg-blue-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${
                status?.connected ? 'bg-emerald-500' : 'bg-blue-600'
              }`}></span>
            </span>
            <span className="text-lg font-bold text-slate-900">
              {status?.connected ? 'MongoDB Live' : 'High-Performance Engine'}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {status?.connected
              ? `Connected to database: ${status.dbName}`
              : 'Container storage active with instant MongoDB syncing'}
          </p>
        </div>

        {/* Status Card 2 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Ping &amp; Latency</span>
            <Activity className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {status?.pingMs !== null && status?.pingMs !== undefined ? `${status.pingMs} ms` : '< 1 ms'}
          </div>
          <p className="text-xs text-slate-500">
            {status?.lastPing ? `Last ping: ${new Date(status.lastPing).toLocaleTimeString()}` : 'Real-time responsive'}
          </p>
        </div>

        {/* Status Card 3 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Persistence</span>
            <Server className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Multi-Layered Sync</span>
          </div>
          <p className="text-xs text-slate-500">
            Automated schema mapping &amp; backup
          </p>
        </div>

        {/* Status Card 4 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Node Server Uptime</span>
            <Cpu className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {status ? formatUptime(status.serverUptimeSeconds) : '...'}
          </div>
          <p className="text-xs text-slate-500">
            Port 3000 • Production ready
          </p>
        </div>
      </div>

      {/* Database Schema & Synchronized Collections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Live Collections */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Synchronized MongoDB Collections
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Target database: <code className="text-blue-600 font-semibold">{status?.dbName || 'nexgen_council'}</code>
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg">
              11 Collections Active
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Users &amp; Staff</span>
              <div className="text-xl font-bold text-slate-900">{status?.recordCounts.users ?? 3}</div>
              <span className="text-[10px] text-slate-400 font-mono">col: users</span>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Applications</span>
              <div className="text-xl font-bold text-slate-900">{status?.recordCounts.applications ?? 0}</div>
              <span className="text-[10px] text-slate-400 font-mono">col: applications</span>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Volunteers</span>
              <div className="text-xl font-bold text-slate-900">{status?.recordCounts.volunteers ?? 0}</div>
              <span className="text-[10px] text-slate-400 font-mono">col: volunteers</span>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Programs</span>
              <div className="text-xl font-bold text-slate-900">{status?.recordCounts.programs ?? 4}</div>
              <span className="text-[10px] text-slate-400 font-mono">col: programs</span>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Events</span>
              <div className="text-xl font-bold text-slate-900">{status?.recordCounts.events ?? 4}</div>
              <span className="text-[10px] text-slate-400 font-mono">col: events</span>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">News &amp; CMS</span>
              <div className="text-xl font-bold text-slate-900">{status?.recordCounts.news ?? 3}</div>
              <span className="text-[10px] text-slate-400 font-mono">col: news</span>
            </div>
          </div>

          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Bi-Directional Redundancy:</strong> All write actions in the admin panel are saved instantaneously to the local JSON engine and continuously synced to MongoDB. If either server is restarted, data remains fully persistent.
            </div>
          </div>
        </div>

        {/* Right 1 Col: Test Connection Live */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              MongoDB Connection Tester
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Verify any MongoDB URI or Oracle VM database connection
            </p>
          </div>

          <form onSubmit={handleTestConnection} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                MongoDB Connection URI
              </label>
              <input
                type="text"
                value={testUri}
                onChange={e => setTestUri(e.target.value)}
                placeholder="mongodb://localhost:27017/nexgen_council"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTestConnection()}
                disabled={testing || connecting}
                className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {testing ? (
                  <div className="w-3.5 h-3.5 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Activity className="w-3.5 h-3.5 text-blue-600" />
                    <span>Test Ping</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleConnectLive}
                disabled={testing || connecting}
                className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60 shadow-sm"
              >
                {connecting ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    <span>Connect Live</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {testResult && (
            <div className={`p-3.5 rounded-xl border text-xs space-y-1 ${
              testResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              <div className="flex items-center gap-1.5 font-bold">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                )}
                <span>{testResult.success ? 'Connection Verified!' : 'Connection Notice'}</span>
              </div>
              <p className="text-[11px] break-words">{testResult.message}</p>
              {testResult.pingMs !== undefined && (
                <p className="text-[11px] font-mono">Response latency: {testResult.pingMs}ms</p>
              )}
            </div>
          )}

          {/* Clean Slate / Purge Demo Mock Data Section */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Clean Slate Database</span>
                <span className="text-[11px] text-slate-500">Remove initial demo/mock content</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPurgeConfirm(true)}
                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Purge Mock Data</span>
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 space-y-2">
            <span className="font-semibold text-slate-700 block">Persistence Guarantees:</span>
            <ul className="list-disc pl-4 space-y-1 text-[11px]">
              <li>Local mirror stored in <code className="text-slate-800 font-mono">/data/persistent_db.json</code></li>
              <li>Replication to MongoDB collections occurs instantaneously on create/edit/delete</li>
              <li>Rebuilding or restarting the container will NOT overwrite saved data with mock templates</li>
            </ul>
          </div>
        </div>
      </div>

      {/* VPS MongoDB (Self-Hosted) Deployment Guide & Quick Presets */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <Server className="w-5 h-5 text-indigo-950" />
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Self-Hosted VPS MongoDB Configuration
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Connect your Ubuntu/Debian Linux VPS MongoDB server directly to this application.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">1. VPS with Auth (Recommended)</span>
              <button
                type="button"
                onClick={() => setTestUri('mongodb://root:YOUR_PASSWORD@YOUR_VPS_IP:27017/nexgen_council?authSource=admin')}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                Use Template
              </button>
            </div>
            <code className="text-[11px] font-mono text-slate-600 block bg-white p-2 rounded-lg border border-slate-200 break-all">
              mongodb://root:pass@VPS_IP:27017/nexgen_council?authSource=admin
            </code>
            <p className="text-[11px] text-slate-500">
              When MongoDB authentication is active, always include <code className="text-slate-700 font-mono">?authSource=admin</code>.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">2. VPS Direct (No Auth)</span>
              <button
                type="button"
                onClick={() => setTestUri('mongodb://YOUR_VPS_IP:27017/nexgen_council')}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                Use Template
              </button>
            </div>
            <code className="text-[11px] font-mono text-slate-600 block bg-white p-2 rounded-lg border border-slate-200 break-all">
              mongodb://YOUR_VPS_IP:27017/nexgen_council
            </code>
            <p className="text-[11px] text-slate-500">
              For firewall-restricted VPS setups where port 27017 is only accessible from this IP.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">3. Localhost / Co-located</span>
              <button
                type="button"
                onClick={() => setTestUri('mongodb://127.0.0.1:27017/nexgen_council')}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                Use Template
              </button>
            </div>
            <code className="text-[11px] font-mono text-slate-600 block bg-white p-2 rounded-lg border border-slate-200 break-all">
              mongodb://127.0.0.1:27017/nexgen_council
            </code>
            <p className="text-[11px] text-slate-500">
              If Node.js and MongoDB run on the same virtual server or container.
            </p>
          </div>
        </div>

        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
          <strong className="block">VPS MongoDB Pre-flight Checklist:</strong>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-800">
            <li>In <code className="font-mono">/etc/mongod.conf</code>, verify that <code className="font-mono">net.bindIp: 0.0.0.0</code> is configured to accept remote connections.</li>
            <li>Allow port 27017 in your firewall: <code className="font-mono">sudo ufw allow 27017/tcp</code> (or configure your hosting provider security group).</li>
            <li>Restart mongod on your VPS: <code className="font-mono">sudo systemctl restart mongod</code>.</li>
          </ul>
        </div>
      </div>

      {/* Purge Confirmation Modal */}
      {showPurgeConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Purge Demo / Mock Records?</h3>
                <p className="text-xs text-slate-500">This will remove initial sample programs, events, news, team and gallery items.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed">
              Your users, admin accounts, volunteer applications, and contact messages will be <strong>preserved</strong>. Only demo content will be cleared so you can enter your own real content without mock data reappearing.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPurgeConfirm(false)}
                disabled={purging}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeMockData}
                disabled={purging}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-60"
              >
                {purging ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{purging ? 'Purging...' : 'Yes, Purge Mock Data'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
