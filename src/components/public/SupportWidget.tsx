import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  X,
  Send,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  Phone,
  Mail
} from 'lucide-react';

const QUICK_FAQS = [
  {
    q: 'Who can apply as a volunteer or cohort scholar?',
    a: 'Women and youth advocates ages 16+ from all academic disciplines and backgrounds can join. No prior experience is required.'
  },
  {
    q: 'Are certificates provided upon completion?',
    a: 'Yes, participants who complete the required attendance and practical project receive an accredited digital certificate.'
  },
  {
    q: 'Is there any fee to join?',
    a: 'No. Volunteer registration and participation in all regular training cohorts are 100% free of charge.'
  }
];

export const SupportWidget: React.FC = () => {
  const { settings, addToast } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'ticket' | 'faq'>('ticket');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: 'General Inquiry',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      addToast('Please fill out all required fields.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          subject: formData.subject,
          message: formData.message.trim()
        })
      });

      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(
          `API returned HTML instead of JSON (HTTP ${res.status}). Check /api/contact route.`
        );
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to submit your issue.');
      }

      setSubmittedSuccess(true);
      addToast('Your support request has been sent to the Council Secretariat.', 'success');
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: 'General Inquiry',
        message: ''
      });
    } catch (err: any) {
      addToast(err.message || 'Error submitting support ticket.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-3 w-[340px] sm:w-[390px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all">
          {/* Header */}
          <div className="bg-slate-900 p-5 text-white border-b border-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="NexGen Council"
                  className="h-10 w-10 rounded-full bg-white/10 p-1 object-cover border border-amber-400/40"
                />
                <div>
                  <h3 className="font-serif text-base font-bold leading-tight">
                    NexGen Support Desk
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-300">
                    Report an issue or ask the Secretariat
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close Support Widget"
                className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl bg-white/10 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('ticket')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all cursor-pointer ${
                  activeTab === 'ticket'
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Issue</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('faq')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all cursor-pointer ${
                  activeTab === 'faq'
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Quick FAQs</span>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[430px] overflow-y-auto p-5 bg-slate-50/50">
            {activeTab === 'faq' ? (
              <div className="space-y-3">
                {QUICK_FAQS.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                      className="flex w-full items-center justify-between gap-2 p-3.5 text-left text-xs font-bold text-slate-900 hover:bg-slate-50 cursor-pointer"
                    >
                      <span>{item.q}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-amber-600 shrink-0 transition-transform ${
                          openFaq === idx ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {openFaq === idx && (
                      <div className="border-t border-slate-100 px-3.5 py-3 text-xs leading-relaxed text-slate-600 bg-slate-50/60">
                        {item.a}
                      </div>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setActiveTab('ticket')}
                  className="w-full py-3 bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-amber-300" />
                  <span>Still need help? Submit your issue</span>
                </button>
              </div>
            ) : submittedSuccess ? (
              <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3">
                <CheckCircle2 className="w-11 h-11 text-emerald-600 mx-auto" />
                <h4 className="font-serif font-bold text-base text-slate-900">
                  Issue Logged Successfully
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Thank you! Your request has been delivered to the Council Secretariat. Our team will review it and get back to you via email or phone.
                </p>
                <button
                  type="button"
                  onClick={() => setSubmittedSuccess(false)}
                  className="mt-2 px-5 py-2 bg-indigo-950 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Submit Another Issue
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Your Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Ayesha Siddiqui"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Phone / WhatsApp
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+92 300 0000000"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    What is your issue about? <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.subject}
                    onChange={e => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                  >
                    <option value="General Inquiry">General Inquiry / Support Issue</option>
                    <option value="Certificate / Cohort Verification">Certificate / Cohort Verification</option>
                    <option value="Volunteer / Fellowship Application">Volunteer / Fellowship Application</option>
                    <option value="Event / Meeting Access Issue">Event / Meeting Access Issue</option>
                    <option value="University / School Partnership">University / School Partnership</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Describe Your Issue in Detail <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={formData.message}
                    onChange={e => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Please explain the complete issue you are facing (include cohort name, date, or error details if applicable)..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-indigo-950 hover:bg-indigo-900 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Submitting Issue...</span>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 text-amber-300" />
                      <span>Submit Issue to Secretariat</span>
                    </>
                  )}
                </button>

                {/* Direct Contact Links */}
                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                  {settings?.showContactEmail !== false && (
                    <a
                      href={`mailto:${settings?.contactEmail || 'contact@nexgencouncil.org'}`}
                      className="inline-flex items-center gap-1 hover:text-indigo-950"
                    >
                      <Mail className="w-3 h-3 text-amber-600" />
                      <span>Email Directly</span>
                    </a>
                  )}
                  {settings?.showContactPhone !== false && settings?.contactPhone && (
                    <a
                      href={`tel:${settings.contactPhone}`}
                      className="inline-flex items-center gap-1 hover:text-indigo-950"
                    >
                      <Phone className="w-3 h-3 text-amber-600" />
                      <span>{settings.contactPhone}</span>
                    </a>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Floating Image Toggle Button (No Background, Full Uncropped Image) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open Customer Support"
        className="bg-transparent border-none p-0 focus:outline-none transition-transform duration-200 hover:scale-105 active:scale-95 cursor-pointer"
      >
        <img
          src="/NexGen-Support-2.png"
          alt="Support"
          className="h-16 w-16 sm:h-20 sm:w-20 object-contain drop-shadow-lg select-none"
        />
      </button>
    </div>
  );
};
