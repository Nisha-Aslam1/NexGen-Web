import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  Mail,
  Phone,
  MapPin,
  Send,
  CheckCircle2,
  Clock,
  HelpCircle,
  MessageSquare
} from 'lucide-react';

export const ContactPage: React.FC = () => {
  const { settings, addToast } = useApp();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: 'General Inquiry',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  useDocumentSEO({
    title: `Contact Secretariat & Regional Chapters | ${settings?.organizationName || 'NexGen Council'}`,
    description: `Connect with the administrative office, partnerships desk, or media liaison of ${settings?.organizationName || 'NexGen Council'}. Address: ${settings?.address || 'Islamabad, Pakistan'}.`,
    canonicalPath: '/contact',
    ogType: 'website',
    ogImage: '/banner.png',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'ContactPage',
        name: 'Contact NexGen Council',
        description: 'Official liaison contacts and headquarters address for NexGen Council.',
        mainEntity: {
          '@type': 'NGO',
          name: settings?.organizationName || 'NexGen Council',
          telephone: settings?.phone || '+92 300 1234567',
          email: settings?.contactEmail || 'info@nexgencouncil.org',
          address: {
            '@type': 'PostalAddress',
            streetAddress: settings?.address || 'Sector F-7, Blue Area',
            addressLocality: 'Islamabad',
            addressCountry: 'PK'
          }
        }
      }
    ]
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      addToast('Please fill out all required fields.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send message.');
      }
      setSubmittedSuccess(true);
      addToast('Your message has been delivered to the council secretariat.', 'success');
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: 'General Inquiry',
        message: ''
      });
    } catch (err: any) {
      addToast(err.message || 'Error transmitting inquiry.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-16 pb-20">
      {/* Header */}
      <section className="bg-slate-900 text-white py-16 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-semibold uppercase tracking-wider">
            <Mail className="w-3.5 h-3.5 text-amber-400" /> Get in Touch
          </span>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight">
            Contact Council Secretariat
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto">
            Reach out for partnership dialogues, program inquiries, university collaborations, or press media requests.
          </p>
        </div>
      </section>

      {/* Main Form & Info Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Contact Details Card */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900 text-white rounded-3xl p-8 space-y-6 shadow-xl">
              <h3 className="font-serif font-bold text-2xl">Council Secretariat</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                Our central secretariat manages volunteer onboarding, program certifications, and regional chapter coordination.
              </p>

              <div className="space-y-4 pt-2 text-xs sm:text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block">Physical Secretariat</strong>
                    <span>{settings?.officeAddress || 'Global Leadership Secretariat'}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block">Official Inquiries</strong>
                    <a href={`mailto:${settings?.contactEmail || 'contact@nexgencouncil.org'}`} className="hover:text-amber-300 transition-colors">
                      {settings?.contactEmail || 'contact@nexgencouncil.org'}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block">Telephone Helpline</strong>
                    <span>{settings?.contactPhone || '+1 (800) 482-9380'}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block">Operating Hours</strong>
                    <span>Monday – Friday: 9:00 AM – 5:30 PM (UTC+5)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Note */}
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-xs text-amber-900 space-y-2">
              <span className="font-bold flex items-center gap-1.5 text-amber-950">
                <MessageSquare className="w-4 h-4 text-amber-700" /> Applying to Volunteer?
              </span>
              <p>
                If you are looking to become an active volunteer or join the upcoming 30-day cohort, please use the designated Volunteer Application form for immediate processing.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-xl p-8 sm:p-10 space-y-6">
            <div>
              <h3 className="text-2xl font-serif font-bold text-slate-900">Send an Official Message</h3>
              <p className="text-xs text-slate-500 mt-1">Our secretariat team replies to all formal submissions within 24–48 hours.</p>
            </div>

            {submittedSuccess ? (
              <div className="p-8 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                <h4 className="font-serif font-bold text-lg text-slate-900">Inquiry Dispatched Successfully</h4>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  Thank you for reaching out. A confirmation has been logged with our communications officer.
                </p>
                <button
                  onClick={() => setSubmittedSuccess(false)}
                  className="mt-3 px-5 py-2 bg-indigo-950 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Send Another Inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                      Your Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Dr. Ayesha Siddiqui"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      placeholder="e.g. ayesha@university.edu"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+1 555-0199"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                      Subject Category
                    </label>
                    <select
                      value={formData.subject}
                      onChange={e => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-200 bg-white"
                    >
                      <option value="General Inquiry">General Inquiry</option>
                      <option value="University / School Partnership">University / School Partnership</option>
                      <option value="Sponsorship & Philanthropy">Sponsorship &amp; Philanthropy</option>
                      <option value="Press & Media Interview">Press &amp; Media Interview</option>
                      <option value="Advisory Council Nomination">Advisory Council Nomination</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Message Details <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={5}
                    required
                    value={formData.message}
                    onChange={e => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Describe your query or partnership proposal in detail..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 bg-indigo-950 hover:bg-indigo-900 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Sending Transmission...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4 text-amber-300" />
                      <span>Transmit Message</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-indigo-900">Common Questions</span>
          <h3 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900">Frequently Asked Questions</h3>
        </div>

        <div className="space-y-4">
          {[
            {
              q: 'Who can apply to become a NexGen volunteer or cohort scholar?',
              a: 'Our programs are open to women and youth advocates ages 16 and above from all academic disciplines, professional sectors, and geographic backgrounds. No prior experience is required—only commitment and passion for community development.'
            },
            {
              q: 'Are certificates provided upon completion of cohorts?',
              a: 'Yes, all participants who complete the required attendance and practical community project receive an accredited certificate of completion and digital badge from the Council.'
            },
            {
              q: 'Is there any fee to join as a volunteer?',
              a: 'No. NexGen Council is a civic civil-society initiative. Volunteer registration and participation in all regular training cohorts are 100% free of charge.'
            },
            {
              q: 'How are regional chapters established?',
              a: 'Universities or youth bodies interested in establishing a student chapter or community hub can contact our secretariat through the partnership subject category on this page.'
            }
          ].map((faq, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <h4 className="font-serif font-bold text-base text-slate-900 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-1" />
                <span>{faq.q}</span>
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pl-6">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
