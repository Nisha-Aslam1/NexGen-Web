import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import {
  Settings,
  Save,
  Bell,
  Building,
  Phone,
  Mail,
  MapPin,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  Lock,
  Key,
  Clock,
  FileText,
  Share2,
  CheckCircle2,
  AlertCircle,
  Globe,
  ExternalLink,
  RotateCcw,
  Eye,
  EyeOff
} from 'lucide-react';
import { SiteSettings } from '../../types.ts';

export const AdminSettings: React.FC = () => {
  const { settings, refreshData, addToast, currentUser } = useApp();
  const [formData, setFormData] = useState<SiteSettings | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Super Admin Credentials state
  const [adminStatus, setAdminStatus] = useState<{ username: string; email: string; source: string; isCustomConfigured: boolean } | null>(null);
  const [adminUsernameInput, setAdminUsernameInput] = useState('');
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminConfirmPasswordInput, setAdminConfirmPasswordInput] = useState('');
  const [updatingCreds, setUpdatingCreds] = useState(false);
  const [credsSuccess, setCredsSuccess] = useState<string | null>(null);
  const [credsError, setCredsError] = useState<string | null>(null);

  // Initialize formData ONCE when settings arrive, NEVER clobber user typing during background polling
  useEffect(() => {
    if (settings && !formData) {
      setFormData({
        ...settings,
        siteUrl: settings.siteUrl || 'https://nexgencouncil.bond'
      });
    }
  }, [settings, formData]);

  const handleDiscardChanges = () => {
    if (settings) {
      setFormData({
        ...settings,
        siteUrl: settings.siteUrl || 'https://nexgencouncil.bond'
      });
      setIsDirty(false);
      addToast('Unsaved edits discarded. Loaded saved settings from server.', 'info');
    }
  };

  const fetchAdminCredsStatus = async () => {
    try {
      const res = await authFetch('/api/system/admin-credentials');
      if (res.ok) {
        const data = await res.json();
        setAdminStatus(data);
        setAdminUsernameInput(data.username || 'admin');
        setAdminEmailInput(data.email || 'admin@nexgencouncil.org');
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (currentUser?.role === 'SUPER_ADMIN') {
      fetchAdminCredsStatus();
    }
  }, [currentUser]);

  if (!formData) {
    return <div className="p-8 text-center text-slate-400">Loading website settings...</div>;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || 'Failed to save settings');

      setFormData(updated);
      setIsDirty(false);
      addToast('Website settings and domain configuration saved successfully!', 'success');
      await refreshData();
    } catch (err: any) {
      addToast(err.message || 'Error updating settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredsSuccess(null);
    setCredsError(null);

    if (!adminUsernameInput.trim()) {
      setCredsError('Please enter an admin username.');
      return;
    }
    if (!adminPasswordInput) {
      setCredsError('Please enter a new password.');
      return;
    }
    if (adminPasswordInput.length < 4) {
      setCredsError('Password must be at least 4 characters.');
      return;
    }
    if (adminPasswordInput !== adminConfirmPasswordInput) {
      setCredsError('Passwords do not match. Please re-type.');
      return;
    }

    setUpdatingCreds(true);
    try {
      const res = await authFetch('/api/system/admin-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: adminUsernameInput.trim(),
          password: adminPasswordInput,
          email: adminEmailInput.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update credentials.');
      }
      setCredsSuccess('Super Admin credentials successfully updated! You can now log in using these credentials.');
      addToast('Super Admin credentials updated successfully!', 'success');
      setAdminPasswordInput('');
      setAdminConfirmPasswordInput('');
      fetchAdminCredsStatus();
    } catch (err: any) {
      setCredsError(err.message || 'Error updating credentials.');
      addToast(err.message || 'Error updating credentials', 'error');
    } finally {
      setUpdatingCreds(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            Website Content &amp; Global Configuration
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage live branding, canonical domain URL (<code className="font-semibold text-slate-700">{formData.siteUrl || 'https://nexgencouncil.bond'}</code>), announcement banners, and contact channels.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          {isDirty && (
            <>
              <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold flex items-center gap-1.5 border border-amber-300">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                <span>Unsaved Changes</span>
              </span>
              <button
                type="button"
                onClick={handleDiscardChanges}
                disabled={saving}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                title="Discard your current edits and reload the saved configuration from the server"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Discard</span>
              </button>
            </>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-950 text-white text-xs font-bold hover:bg-indigo-900 transition-colors shadow-md cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-amber-400" />
            <span>{saving ? 'Saving Live Changes...' : 'Save & Publish Live'}</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {/* Domain & SEO Configuration */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-600" />
              <h3 className="font-serif font-bold text-base text-slate-900">Website Domain &amp; SEO Configuration</h3>
            </div>
            <a
              href={formData.siteUrl || 'https://nexgencouncil.bond'}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-semibold text-indigo-950 hover:text-indigo-800 flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors"
            >
              <span>Visit nexgencouncil.bond</span>
              <ExternalLink className="w-3 h-3 text-slate-500" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Canonical Website Domain / URL
              </label>
              <input
                type="url"
                required
                value={formData.siteUrl || 'https://nexgencouncil.bond'}
                onChange={e => {
                  setIsDirty(true);
                  setFormData({ ...formData, siteUrl: e.target.value });
                }}
                placeholder="https://nexgencouncil.bond"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-indigo-300"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Primary canonical URL for sitemaps, OpenGraph cards, search engines, and live shares.
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Google Site Verification Meta Token
              </label>
              <input
                type="text"
                value={formData.googleSiteVerification || ''}
                onChange={e => {
                  setIsDirty(true);
                  setFormData({ ...formData, googleSiteVerification: e.target.value });
                }}
                placeholder="e.g. google-site-verification=abc123xyz"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-indigo-300"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Required for Google Search Console domain ownership verification.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Search Engine Meta Description
              </label>
              <textarea
                rows={2}
                value={formData.metaDescription || ''}
                onChange={e => {
                  setIsDirty(true);
                  setFormData({ ...formData, metaDescription: e.target.value });
                }}
                placeholder="Concise description shown on Google search results..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Google Analytics Measurement ID (optional)
              </label>
              <input
                type="text"
                value={formData.googleAnalyticsId || ''}
                onChange={e => {
                  setIsDirty(true);
                  setFormData({ ...formData, googleAnalyticsId: e.target.value });
                }}
                placeholder="G-XXXXXXXXXX"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-indigo-300"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Tracks public visitors alongside the built-in server telemetry engine.
              </span>
            </div>
          </div>
        </div>

        {/* Announcement Banner */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600" />
              <h3 className="font-serif font-bold text-base text-slate-900">Top Announcement Banner</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.announcementBanner?.enabled ?? formData.announcementBannerEnabled ?? false}
                onChange={e =>
                  setFormData({
                    ...formData,
                    announcementBannerEnabled: e.target.checked,
                    announcementBanner: {
                      enabled: e.target.checked,
                      text: formData.announcementBanner?.text || formData.announcementBannerText || ''
                    }
                  })
                }
                className="w-4 h-4 rounded text-indigo-950"
              />
              <span className="font-semibold text-slate-700">Display on Public Site</span>
            </label>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Banner Announcement Text</label>
            <input
              type="text"
              value={formData.announcementBanner?.text ?? formData.announcementBannerText ?? ''}
              onChange={e =>
                setFormData({
                  ...formData,
                  announcementBannerText: e.target.value,
                  announcementBanner: {
                    enabled: formData.announcementBanner?.enabled ?? formData.announcementBannerEnabled ?? true,
                    text: e.target.value
                  }
                })
              }
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        {/* Hero & Identity */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sparkles className="w-4 h-4 text-indigo-950" />
            <h3 className="font-serif font-bold text-base text-slate-900">Hero Section &amp; Tagline</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Organization Legal Name</label>
              <input
                type="text"
                value={formData.organizationName}
                onChange={e => setFormData({ ...formData, organizationName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Public Tagline</label>
              <input
                type="text"
                value={formData.tagline}
                onChange={e => setFormData({ ...formData, tagline: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Hero Display Headline</label>
            <input
              type="text"
              value={formData.heroTitle || formData.heroHeading || ''}
              onChange={e =>
                setFormData({
                  ...formData,
                  heroTitle: e.target.value,
                  heroHeading: e.target.value
                })
              }
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-semibold"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Hero Subtitle Paragraph</label>
            <textarea
              rows={3}
              value={formData.heroSubtitle || formData.heroSubheading || ''}
              onChange={e =>
                setFormData({
                  ...formData,
                  heroSubtitle: e.target.value,
                  heroSubheading: e.target.value
                })
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-300 leading-relaxed"
            />
          </div>
        </div>

        {/* Mission & Vision */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building className="w-4 h-4 text-indigo-950" />
            <h3 className="font-serif font-bold text-base text-slate-900">Charter Statements</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Official Mission Statement</label>
              <textarea
                rows={4}
                value={formData.missionStatement || ''}
                onChange={e => setFormData({ ...formData, missionStatement: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 leading-relaxed"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Strategic Vision 2030</label>
              <textarea
                rows={4}
                value={formData.visionStatement || ''}
                onChange={e => setFormData({ ...formData, visionStatement: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 leading-relaxed"
              />
            </div>
          </div>
        </div>

        {/* Impact Statistics Counters */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <TrendingUp className="w-4 h-4 text-emerald-700" />
            <h3 className="font-serif font-bold text-base text-slate-900">Impact Metrics Counter</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Volunteers Trained</label>
              <input
                type="text"
                value={formData.stats.volunteersCount || String(formData.stats.volunteersTrained || '1,200+')}
                onChange={e =>
                  setFormData({
                    ...formData,
                    stats: {
                      ...formData.stats,
                      volunteersCount: e.target.value,
                      volunteersTrained: parseInt(e.target.value.replace(/\D/g, '')) || 0
                    }
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Communities Reached</label>
              <input
                type="text"
                value={formData.stats.communitiesCount || String(formData.stats.communitiesReached || '48')}
                onChange={e =>
                  setFormData({
                    ...formData,
                    stats: {
                      ...formData.stats,
                      communitiesCount: e.target.value,
                      communitiesReached: parseInt(e.target.value.replace(/\D/g, '')) || 0
                    }
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Programs Active</label>
              <input
                type="text"
                value={formData.stats.programsCount || String(formData.stats.programsActive || '12')}
                onChange={e =>
                  setFormData({
                    ...formData,
                    stats: {
                      ...formData.stats,
                      programsCount: e.target.value,
                      programsActive: parseInt(e.target.value.replace(/\D/g, '')) || 0
                    }
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Partner Institutions</label>
              <input
                type="text"
                value={formData.stats.beneficiariesCount || String(formData.stats.partnerInstitutions || '25+')}
                onChange={e =>
                  setFormData({
                    ...formData,
                    stats: {
                      ...formData.stats,
                      beneficiariesCount: e.target.value,
                      partnerInstitutions: parseInt(e.target.value.replace(/\D/g, '')) || 0
                    }
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
              />
            </div>
          </div>
        </div>

        {/* Contact Channels */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-indigo-950" />
              <h3 className="font-serif font-bold text-base text-slate-900">Public Contact Secretariat</h3>
            </div>
            <span className="text-[11px] text-slate-500">
              Each contact item can be toggled ON or OFF for the public site and footer
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700">Public Contact Email</label>
                <button
                  type="button"
                  onClick={() => {
                    setIsDirty(true);
                    setFormData({
                      ...formData,
                      showContactEmail: formData.showContactEmail === false ? true : false
                    });
                  }}
                  className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
                    formData.showContactEmail !== false
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  title="Toggle visibility on website"
                >
                  {formData.showContactEmail !== false ? (
                    <>
                      <Eye className="w-3 h-3 text-emerald-600" />
                      <span>ON (Visible)</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3 h-3 text-slate-400" />
                      <span>OFF (Hidden)</span>
                    </>
                  )}
                </button>
              </div>
              <input
                type="email"
                value={formData.contactEmail}
                onChange={e => {
                  setIsDirty(true);
                  setFormData({ ...formData, contactEmail: e.target.value });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700">Helpline Phone Number</label>
                <button
                  type="button"
                  onClick={() => {
                    setIsDirty(true);
                    setFormData({
                      ...formData,
                      showContactPhone: formData.showContactPhone === false ? true : false
                    });
                  }}
                  className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
                    formData.showContactPhone !== false
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  title="Toggle visibility on website"
                >
                  {formData.showContactPhone !== false ? (
                    <>
                      <Eye className="w-3 h-3 text-emerald-600" />
                      <span>ON (Visible)</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3 h-3 text-slate-400" />
                      <span>OFF (Hidden)</span>
                    </>
                  )}
                </button>
              </div>
              <input
                type="text"
                value={formData.contactPhone}
                onChange={e => {
                  setIsDirty(true);
                  setFormData({ ...formData, contactPhone: e.target.value });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-semibold text-slate-700">Physical Office / Secretariat Address</label>
              <button
                type="button"
                onClick={() => {
                  setIsDirty(true);
                  setFormData({
                    ...formData,
                    showOfficeAddress: formData.showOfficeAddress === false ? true : false
                  });
                }}
                className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
                  formData.showOfficeAddress !== false
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
                title="Toggle visibility on website"
              >
                {formData.showOfficeAddress !== false ? (
                  <>
                    <Eye className="w-3 h-3 text-emerald-600" />
                    <span>ON (Visible)</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3 h-3 text-slate-400" />
                    <span>OFF (Hidden)</span>
                  </>
                )}
              </button>
            </div>
            <input
              type="text"
              value={formData.officeAddress}
              onChange={e => {
                setIsDirty(true);
                setFormData({ ...formData, officeAddress: e.target.value });
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300"
            />
          </div>
        </div>

        {/* Social Media Channels */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Share2 className="w-4 h-4 text-indigo-950" />
            <h3 className="font-serif font-bold text-base text-slate-900">Social Media &amp; Community Channels</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">LinkedIn URL</label>
              <input
                type="url"
                value={formData.socialLinks?.linkedin || ''}
                onChange={e =>
                  setFormData({
                    ...formData,
                    socialLinks: { ...formData.socialLinks, linkedin: e.target.value }
                  })
                }
                placeholder="https://linkedin.com/company/nexgen-council"
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Instagram URL</label>
              <input
                type="url"
                value={formData.socialLinks?.instagram || ''}
                onChange={e =>
                  setFormData({
                    ...formData,
                    socialLinks: { ...formData.socialLinks, instagram: e.target.value }
                  })
                }
                placeholder="https://instagram.com/nexgencouncil"
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Facebook URL</label>
              <input
                type="url"
                value={formData.socialLinks?.facebook || ''}
                onChange={e =>
                  setFormData({
                    ...formData,
                    socialLinks: { ...formData.socialLinks, facebook: e.target.value }
                  })
                }
                placeholder="https://facebook.com/nexgencouncil"
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Twitter / X URL</label>
              <input
                type="url"
                value={formData.socialLinks?.twitter || ''}
                onChange={e =>
                  setFormData({
                    ...formData,
                    socialLinks: { ...formData.socialLinks, twitter: e.target.value }
                  })
                }
                placeholder="https://twitter.com/nexgencouncil"
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>
          </div>
        </div>

        {/* Footer & Legal Notice Configuration */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-4 h-4 text-indigo-950" />
            <div>
              <h3 className="font-serif font-bold text-base text-slate-900">Footer Content &amp; Legal Notices</h3>
              <p className="text-[11px] text-slate-500">Edit all callout headers, buttons, office hours, and legal statements displayed in the public footer.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Top CTA Callout Heading</label>
              <input
                type="text"
                value={formData.footerHeading || ''}
                placeholder="Ready to create transformative community change?"
                onChange={e => setFormData({ ...formData, footerHeading: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Top CTA Callout Subheading</label>
              <textarea
                rows={2}
                value={formData.footerSubheading || ''}
                placeholder="Join thousands of emerging leaders and volunteers working across educational equity..."
                onChange={e => setFormData({ ...formData, footerSubheading: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Primary Button Label (Volunteer)</label>
              <input
                type="text"
                value={formData.footerVolunteerButtonText || ''}
                placeholder="Become a Volunteer"
                onChange={e => setFormData({ ...formData, footerVolunteerButtonText: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Secondary Button Label (Contact)</label>
              <input
                type="text"
                value={formData.footerContactButtonText || ''}
                placeholder="Contact Us"
                onChange={e => setFormData({ ...formData, footerContactButtonText: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Footer Organization Subtitle</label>
              <input
                type="text"
                value={formData.footerSubTitle || ''}
                placeholder="Women Empowerment & Youth Leadership"
                onChange={e => setFormData({ ...formData, footerSubTitle: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700">Operating / Secretariat Hours</label>
                <button
                  type="button"
                  onClick={() => {
                    setIsDirty(true);
                    setFormData({
                      ...formData,
                      showOfficeHours: formData.showOfficeHours === false ? true : false
                    });
                  }}
                  className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
                    formData.showOfficeHours !== false
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  title="Toggle visibility on website"
                >
                  {formData.showOfficeHours !== false ? (
                    <>
                      <Eye className="w-3 h-3 text-emerald-600" />
                      <span>ON (Visible)</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3 h-3 text-slate-400" />
                      <span>OFF (Hidden)</span>
                    </>
                  )}
                </button>
              </div>
              <input
                type="text"
                value={formData.footerOfficeHours || ''}
                placeholder="Monday - Friday: 9:00 AM - 6:00 PM (PKT / UTC+5)"
                onChange={e => {
                  setIsDirty(true);
                  setFormData({ ...formData, footerOfficeHours: e.target.value });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Footer Description / Short Bio</label>
              <textarea
                rows={2}
                value={formData.footerDescription || ''}
                placeholder="Cultivating the next generation of visionary female leaders..."
                onChange={e => {
                  setIsDirty(true);
                  setFormData({ ...formData, footerDescription: e.target.value });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700">Registration / NGO License Number</label>
                <button
                  type="button"
                  onClick={() => {
                    setIsDirty(true);
                    setFormData({
                      ...formData,
                      showRegistrationNumber: formData.showRegistrationNumber === false ? true : false
                    });
                  }}
                  className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
                    formData.showRegistrationNumber !== false
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  title="Toggle visibility on website"
                >
                  {formData.showRegistrationNumber !== false ? (
                    <>
                      <Eye className="w-3 h-3 text-emerald-600" />
                      <span>ON (Visible)</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3 h-3 text-slate-400" />
                      <span>OFF (Hidden)</span>
                    </>
                  )}
                </button>
              </div>
              <input
                type="text"
                value={formData.registrationNumber || ''}
                placeholder="Registered Civil Society & Non-Profit Initiative #092-2024"
                onChange={e => {
                  setIsDirty(true);
                  setFormData({ ...formData, registrationNumber: e.target.value });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Bottom Legal Badge / Category</label>
              <input
                type="text"
                value={formData.footerBadgeText || ''}
                placeholder="Non-Governmental Organization • Civic Leadership Initiative"
                onChange={e => setFormData({ ...formData, footerBadgeText: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Copyright Notice</label>
              <input
                type="text"
                value={formData.footerCopyrightText || ''}
                placeholder="© 2026 NexGen Women Empowerment & Youth Leadership Council. All rights reserved."
                onChange={e => {
                  setIsDirty(true);
                  setFormData({ ...formData, footerCopyrightText: e.target.value });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div className="sm:col-span-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Platform Developer Watermark:</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                <span className="text-slate-500">Developed by</span>
                <strong className="text-indigo-950">Nisha Aslam</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 rounded-xl bg-indigo-950 text-white font-bold text-xs hover:bg-indigo-900 transition-colors shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="w-4 h-4 text-amber-400" />
            <span>{saving ? 'Saving Live Changes...' : 'Save & Publish Live Settings'}</span>
          </button>
        </div>
      </form>

      {/* Super Admin Security & Credentials Card */}
      {currentUser?.role === 'SUPER_ADMIN' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5 mt-8">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-950" />
              <div>
                <h3 className="font-serif font-bold text-base text-slate-900">
                  Super Admin Credentials &amp; .env Security
                </h3>
                <p className="text-[11px] text-slate-500">
                  Manage login credentials for the master administrator account. Any changes sync into memory, MongoDB, and your server .env file.
                </p>
              </div>
            </div>

            {adminStatus && (
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                adminStatus.isCustomConfigured
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                Source: {adminStatus.source === 'env_file' ? '.env file on disk' : adminStatus.source === 'process_env' ? 'Environment variable' : adminStatus.source === 'admin_config' ? 'Custom saved credentials' : 'Default'}
              </span>
            )}
          </div>

          <form onSubmit={handleUpdateCredentials} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Admin Username</label>
                <input
                  type="text"
                  value={adminUsernameInput}
                  onChange={e => setAdminUsernameInput(e.target.value)}
                  placeholder="e.g. admin or custom_user"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Admin Recovery Email</label>
                <input
                  type="email"
                  value={adminEmailInput}
                  onChange={e => setAdminEmailInput(e.target.value)}
                  placeholder="admin@nexgencouncil.org"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">New Admin Password</label>
                <input
                  type="password"
                  value={adminPasswordInput}
                  onChange={e => setAdminPasswordInput(e.target.value)}
                  placeholder="Enter new password (min 4 characters)"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={adminConfirmPasswordInput}
                  onChange={e => setAdminConfirmPasswordInput(e.target.value)}
                  placeholder="Re-type new password"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
            </div>

            {credsSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{credsSuccess}</span>
              </div>
            )}

            {credsError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{credsError}</span>
              </div>
            )}

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1 leading-relaxed">
              <strong>Tip for VPS deployment:</strong> You can define <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-900 font-mono">ADMIN_USERNAME</code> and <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-900 font-mono">ADMIN_PASSWORD</code> inside your VPS <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-900 font-mono">.env</code> file, or set them directly using this secure form. Both methods work automatically!
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={updatingCreds}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                <Key className="w-4 h-4 text-amber-400" />
                <span>{updatingCreds ? 'Updating Credentials...' : 'Update Super Admin Credentials'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
