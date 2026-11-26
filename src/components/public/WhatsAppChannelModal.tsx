import React, { useEffect } from 'react';
import { X, ArrowUpRight, BellRing, Calendar, Megaphone } from 'lucide-react';

export const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbDFtbCFCCoMqliaGG0f';

interface WhatsAppChannelModalProps {
  open: boolean;
  onClose: () => void;
}

export const WhatsAppChannelModal: React.FC<WhatsAppChannelModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsapp-channel-dialog-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Navy Editorial Header */}
        <div className="bg-indigo-950 px-6 pt-6 pb-5 text-white relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close announcements dialog"
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3.5 pr-8">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shrink-0">
              <svg
                viewBox="0 0 32 32"
                fill="currentColor"
                className="w-7 h-7"
                aria-hidden="true"
              >
                <path d="M16.04 3C8.86 3 3.04 8.82 3.04 16c0 2.47.69 4.88 1.99 6.96L3 29l6.21-1.97A12.92 12.92 0 0016.04 29C23.22 29 29.04 23.18 29.04 16S23.22 3 16.04 3zm0 23.5c-2.16 0-4.27-.62-6.09-1.78l-.44-.27-3.68 1.17 1.19-3.58-.29-.46A10.44 10.44 0 015.54 16c0-5.79 4.71-10.5 10.5-10.5 5.79 0 10.5 4.71 10.5 10.5s-4.71 10.5-10.5 10.5zm5.76-7.87c-.32-.16-1.87-.92-2.16-1.03-.29-.1-.5-.16-.71.16-.21.32-.81 1.03-1 1.24-.18.21-.37.24-.68.08-.32-.16-1.33-.49-2.54-1.56-.94-.84-1.57-1.87-1.76-2.19-.18-.32-.02-.49.14-.65.14-.14.32-.37.47-.55.16-.18.21-.32.32-.53.11-.21.05-.4-.03-.55-.08-.16-.71-1.72-.97-2.35-.25-.62-.52-.53-.71-.54h-.61c-.21 0-.55.08-.84.4-.29.32-1.1 1.08-1.1 2.63 0 1.55 1.13 3.05 1.29 3.26.16.21 2.22 3.39 5.38 4.75.75.32 1.34.52 1.8.66.76.24 1.44.21 1.99.13.61-.09 1.87-.76 2.13-1.5.26-.74.26-1.37.18-1.5-.08-.13-.29-.21-.6-.37z" />
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">
                NexGen Official Updates
              </p>
              <h2
                id="whatsapp-channel-dialog-title"
                className="font-serif font-bold text-xl leading-snug text-white mt-0.5"
              >
                Follow Our WhatsApp Channel
              </h2>
            </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-700 leading-relaxed">
            Stay connected with the <strong>NexGen Women Empowerment &amp; Youth Leadership Council</strong> for instant official broadcasts, fellowship intakes, and leadership briefings.
          </p>

          <div className="divide-y divide-slate-100 border-y border-slate-100 text-xs text-slate-700">
            <div className="py-3 flex items-start gap-3">
              <Megaphone className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900 block">Official Council Announcements</strong>
                <span className="text-slate-600">Instant notices, policy directives, and Secretariat press dispatches.</span>
              </div>
            </div>
            <div className="py-3 flex items-start gap-3">
              <Calendar className="w-4 h-4 text-indigo-900 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900 block">Events, Summits &amp; Cohort Dates</strong>
                <span className="text-slate-600">Early seat alerts for workshops, conferences, and 30-Day Leadership Series.</span>
              </div>
            </div>
            <div className="py-3 flex items-start gap-3">
              <BellRing className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900 block">Volunteer Drives &amp; Certificates</strong>
                <span className="text-slate-600">Direct updates on volunteer approvals, Member ID cards, and outreach drives.</span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <a
              href={WHATSAPP_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="w-full py-3.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-colors"
            >
              <span>Follow on WhatsApp Channel</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
            >
              Continue to Website
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
