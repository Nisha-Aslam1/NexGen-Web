import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { authFetch } from '../../lib/api.ts';
import { VolunteerApplication } from '../../types.ts';
import {
  CheckCircle2,
  ExternalLink,
  Mail,
  MessageCircle,
  Send
} from 'lucide-react';

export type ApprovalOption = 'simple' | 'email_only' | 'email_whatsapp';

function isValidHttpUrl(raw: string): boolean {
  const val = raw.trim();
  if (!val) return false;
  try {
    const parsed = new URL(val);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

interface VolunteerApprovalModalProps {
  application: VolunteerApplication | null;
  initialNotes?: string;
  isResendOnly?: boolean;
  onClose: () => void;
  onCompleted: (updatedApp: VolunteerApplication) => void;
}

export const VolunteerApprovalModal: React.FC<VolunteerApprovalModalProps> = ({
  application,
  initialNotes = '',
  isResendOnly = false,
  onClose,
  onCompleted
}) => {
  const { addToast, settings, refreshData } = useApp();

  const [selectedOption, setSelectedOption] = useState<ApprovalOption>('email_whatsapp');
  const [whatsappLinkInput, setWhatsappLinkInput] = useState<string>('');
  const [saveWhatsappAsDefault, setSaveWhatsappAsDefault] = useState<boolean>(true);
  const [customEmailNote, setCustomEmailNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!application) return;
    const defaultWaLink = (settings?.volunteerWhatsappGroupLink || '').trim();
    setWhatsappLinkInput(defaultWaLink);
    setSaveWhatsappAsDefault(true);
    setCustomEmailNote('');
    setSelectedOption(defaultWaLink ? 'email_whatsapp' : 'email_only');
  }, [application, settings?.volunteerWhatsappGroupLink]);

  if (!application) return null;

  const isEmailSelected = selectedOption === 'email_only' || selectedOption === 'email_whatsapp';
  const includeWhatsappButton = selectedOption === 'email_whatsapp';
  const firstNameForPreview = application.fullName?.trim().split(/\s+/)[0] || 'Volunteer';

  const handleConfirm = async () => {
    if (includeWhatsappButton) {
      if (!whatsappLinkInput.trim()) {
        addToast(
          'Please enter a WhatsApp Group link or choose "Congratulations Email Only".',
          'error'
        );
        return;
      }
      if (!isValidHttpUrl(whatsappLinkInput)) {
        addToast(
          'WhatsApp Group Link must start with https:// or http:// (e.g. https://chat.whatsapp.com/...).',
          'error'
        );
        return;
      }
    }

    const defaultSaved = (settings?.volunteerWhatsappGroupLink || '').trim();
    const shouldPersistDefault =
      includeWhatsappButton &&
      saveWhatsappAsDefault &&
      whatsappLinkInput.trim() !== '' &&
      whatsappLinkInput.trim() !== defaultSaved;

    setIsSubmitting(true);
    try {
      const res = await authFetch(`/api/applications/${application.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Approved',
          internalNotes: initialNotes,
          reviewNotes: initialNotes,
          sendApprovalEmail: isEmailSelected,
          includeWhatsappInvite: includeWhatsappButton,
          whatsappGroupLink: whatsappLinkInput.trim(),
          saveWhatsappAsDefault: shouldPersistDefault,
          customEmailNote: customEmailNote.trim() || undefined
        })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to process volunteer approval');
      }

      const { emailDispatch, ...updated } = payload;

      if (shouldPersistDefault) {
        refreshData();
      }

      if (emailDispatch?.attempted) {
        if (emailDispatch.success) {
          addToast(
            emailDispatch.includedWhatsappButton
              ? `Approved! 🎉 Congratulations & WhatsApp group invite sent to ${updated.email} from ${emailDispatch.fromEmail}.`
              : `Approved! 🎉 Congratulations email sent to ${updated.email} from ${emailDispatch.fromEmail}.`,
            'success'
          );
        } else {
          addToast(
            `Volunteer approved, but email could not be delivered: ${emailDispatch.error || 'Check email provider configuration.'}`,
            'error'
          );
        }
      } else {
        addToast(`Application approved (Simple Approval without email). ${updated.fullName} enrolled!`, 'success');
      }

      onCompleted(updated);
      onClose();
    } catch (err: any) {
      addToast(err.message || 'Error approving application', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto my-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              {isResendOnly ? 'Volunteer Congratulations Dispatch' : 'Volunteer Approval Options'}
            </span>
            <h3 className="text-xl font-serif font-bold text-slate-900 mt-0.5">
              {isResendOnly
                ? `Send Congratulations Email to ${application.fullName}`
                : `How would you like to approve ${application.fullName}?`}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {application.email} • Ref{' '}
              <span className="font-mono font-semibold text-slate-700">{application.referenceCode}</span>
              {application.preferredRole ? ` • ${application.preferredRole}` : ''}
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* 3 Clear Selectable Options */}
        <div className="space-y-2.5">
          <label className="block text-xs font-bold text-slate-800">
            Select Approval &amp; Email Dispatch Method:
          </label>

          <div className={`grid grid-cols-1 ${isResendOnly ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3`}>
            {!isResendOnly && (
              <button
                type="button"
                onClick={() => setSelectedOption('simple')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  selectedOption === 'simple'
                    ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-200'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-indigo-700 shrink-0" />
                    <span>Simple Approval</span>
                  </span>
                  <span
                    className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                      selectedOption === 'simple'
                        ? 'bg-indigo-700 border-indigo-700'
                        : 'border-slate-300 bg-white'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Approve status &amp; add to Volunteers roster immediately <strong>without sending any email</strong>.
                </p>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedOption('email_only')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                selectedOption === 'email_only'
                  ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-200'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Congratulations Email</span>
                </span>
                <span
                  className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                    selectedOption === 'email_only'
                      ? 'bg-amber-600 border-amber-600'
                      : 'border-slate-300 bg-white'
                  }`}
                />
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Sends 🎉 Congratulations email from{' '}
                <span className="font-mono font-semibold text-slate-800">admin@nexgencouncil.bond</span>{' '}
                <strong>without</strong> invite button.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedOption('email_whatsapp')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                selectedOption === 'email_whatsapp'
                  ? 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-200'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Congrats + WhatsApp</span>
                </span>
                <span
                  className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                    selectedOption === 'email_whatsapp'
                      ? 'bg-emerald-600 border-emerald-600'
                      : 'border-slate-300 bg-white'
                  }`}
                />
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Sends 🎉 Congratulations email <strong>with official WhatsApp Group Join Button</strong>.
              </p>
            </button>
          </div>
        </div>

        {/* Email Details & WhatsApp Group Configuration */}
        {isEmailSelected && (
          <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            {includeWhatsappButton ? (
              <div className="space-y-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Official Volunteers WhatsApp Group Invite Link *
                  </label>
                  <input
                    type="url"
                    value={whatsappLinkInput}
                    onChange={e => setWhatsappLinkInput(e.target.value)}
                    placeholder="https://chat.whatsapp.com/YourInviteLink..."
                    className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {!whatsappLinkInput.trim() && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      No WhatsApp link entered yet. Paste your group link above or switch to Congratulations Email Only.
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedOption('email_only')}
                      className="px-2.5 py-1 rounded-lg bg-amber-900 text-white font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Switch to Email Only
                    </button>
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveWhatsappAsDefault}
                    onChange={e => setSaveWhatsappAsDefault(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Save this WhatsApp Group link as default in Council Settings</span>
                </label>
              </div>
            ) : (
              <div className="p-2.5 bg-white border border-amber-200 rounded-xl text-[11px] text-slate-700">
                <strong>Congratulations-Only Mode:</strong> Sends a celebratory 🎉 welcome email directly from{' '}
                <span className="font-mono font-semibold">admin@nexgencouncil.bond</span> without any WhatsApp group invitation link button.
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Optional Personal Committee Note (included inside email)
              </label>
              <textarea
                rows={2}
                value={customEmailNote}
                onChange={e => setCustomEmailNote(e.target.value)}
                placeholder="e.g. We look forward to seeing you at this Saturday's leadership orientation!"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            {/* Live Email Preview Strip */}
            <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 space-y-2.5 border border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                <span>
                  From: <strong className="text-amber-300 font-mono">admin@nexgencouncil.bond</strong>
                </span>
                <span className="font-mono truncate max-w-[240px]">To: {application.email}</span>
              </div>
              <div className="text-xs font-bold text-white">
                Subject: 🎉 Congratulations, {firstNameForPreview}! Welcome to NexGen Council 🌟
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                🎉 Dear <strong>{application.fullName}</strong>, Congratulations! 🌟 Your volunteer application (
                <span className="font-mono text-amber-300">{application.referenceCode}</span>) has been officially
                approved! 🙌✨
              </p>
              {includeWhatsappButton && isValidHttpUrl(whatsappLinkInput) ? (
                <div className="pt-1">
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 text-slate-950 text-[11px] font-bold">
                    <span>💬 Join Official WhatsApp Group →</span>
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 italic">
                  (Clean Congratulations email — no WhatsApp invitation link button)
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              isSubmitting ||
              (includeWhatsappButton && !isValidHttpUrl(whatsappLinkInput))
            }
            onClick={handleConfirm}
            className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2 ${
              selectedOption === 'email_whatsapp'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : selectedOption === 'email_only'
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-indigo-950 hover:bg-indigo-900'
            }`}
          >
            {isEmailSelected ? (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>
                  {isSubmitting
                    ? 'Processing & Sending...'
                    : selectedOption === 'email_whatsapp'
                    ? isResendOnly
                      ? 'Send Congrats + WhatsApp Email'
                      : 'Approve & Send Congrats + WhatsApp'
                    : isResendOnly
                    ? 'Send Congratulations Email'
                    : 'Approve & Send Congratulations Email'}
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Approving...' : 'Confirm Simple Approval (No Email)'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
