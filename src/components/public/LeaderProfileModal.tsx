import React, { useEffect } from 'react';
import { TeamMember } from '../../types.ts';
import { X, Mail, Linkedin, Twitter, ShieldCheck } from 'lucide-react';
import { buildAutoImageAlt } from '../../lib/imageSeo.ts';

interface LeaderProfileModalProps {
  member: TeamMember | null;
  onClose: () => void;
}

export const LeaderProfileModal: React.FC<LeaderProfileModalProps> = ({ member, onClose }) => {
  useEffect(() => {
    if (!member) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [member, onClose]);

  if (!member) return null;

  const linkedin = member.linkedinUrl || (member as any).linkedin;
  const twitter = member.twitterUrl || (member as any).twitter;
  const bioText = (member.bio || '').trim();

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="leader-modal-name"
    >
      <div
        className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 relative my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Executive Dark Header */}
        <div className="bg-slate-900 text-white p-6 sm:p-8 relative border-b border-slate-800">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close leader profile"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center gap-5 pr-8">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-slate-800 border-2 border-amber-400/50 shrink-0 shadow-lg">
              <img
                src={member.image || '/logo.png'}
                alt={buildAutoImageAlt({
                  type: 'team',
                  customAlt: member.imageAlt,
                  name: member.name,
                  role: member.position,
                  department: member.department
                })}
                title={`${member.name} — ${member.position} | NexGen Council`}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const el = e.currentTarget;
                  if (!el.dataset.fallbackApplied) {
                    el.dataset.fallbackApplied = '1';
                    el.src = '/logo.png';
                    el.className = 'w-full h-full object-contain p-3 bg-slate-800';
                  }
                }}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="space-y-1.5 min-w-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[11px] font-semibold">
                <ShieldCheck className="w-3 h-3" />
                <span>{member.department}</span>
              </span>
              <h2
                id="leader-modal-name"
                className="text-2xl sm:text-3xl font-serif font-bold text-white leading-tight"
              >
                {member.name}
              </h2>
              <p className="text-sm font-semibold text-amber-300">{member.position}</p>
            </div>
          </div>
        </div>

        {/* Scrollable Biography Content */}
        <div className="p-6 sm:p-8 space-y-4 max-h-[55vh] overflow-y-auto">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Biography &amp; Leadership Profile
          </div>

          {bioText ? (
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {bioText}
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">
              Executive council profile for {member.name} ({member.position}).
            </p>
          )}
        </div>

        {/* Footer Links & Close */}
        <div className="px-6 sm:px-8 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {member.email && (
              <a
                href={`mailto:${member.email}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-xs font-semibold text-slate-700 hover:text-indigo-950 transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-indigo-900" />
                <span>Email</span>
              </a>
            )}
            {linkedin && (
              <a
                href={linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-xs font-semibold text-slate-700 hover:text-indigo-950 transition-colors"
              >
                <Linkedin className="w-3.5 h-3.5 text-indigo-900" />
                <span>LinkedIn</span>
              </a>
            )}
            {twitter && (
              <a
                href={twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-xs font-semibold text-slate-700 hover:text-indigo-950 transition-colors"
              >
                <Twitter className="w-3.5 h-3.5 text-indigo-900" />
                <span>Twitter</span>
              </a>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white text-xs font-semibold transition-colors cursor-pointer ml-auto"
          >
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
};
