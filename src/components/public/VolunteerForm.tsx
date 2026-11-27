import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import {
  User,
  GraduationCap,
  HeartHandshake,
  CheckCircle2,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  Clock,
  ShieldCheck,
  Send,
  AlertCircle,
  Compass,
  RotateCcw,
  FileSearch,
  Printer,
  Edit3,
  MessageCircle,
  Award
} from 'lucide-react';

interface FormData {
  // Step 1: Personal Information
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  city: string;
  address: string;

  // Step 2: Background & Education
  educationLevel: string;
  profession: string;
  skills: string[];
  skillsOther: string;
  previousVolunteerExperience: string;

  // Step 3: Volunteering Information
  whyJoin: string;
  interestAreas: string[];
  availableDays: string[];
  availableHours: string;
  preferredRole: string;
  previousOrganization: string;

  // Step 4: Emergency Contact & Agreements
  emergencyContactName: string;
  emergencyContactPhone: string;
  additionalMessage: string;
  agreedToTerms: boolean;
  confirmedAccurate: boolean;
}

const VOLUNTEER_DRAFT_STORAGE_KEY = 'nexgen_volunteer_draft_v1';

const initialFormData: FormData = {
  fullName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  gender: 'Female',
  city: '',
  address: '',
  educationLevel: "Bachelor's Degree",
  profession: '',
  skills: [],
  skillsOther: '',
  previousVolunteerExperience: '',
  whyJoin: '',
  interestAreas: [],
  availableDays: ['Saturday', 'Sunday'],
  availableHours: '5 - 10 hours/week',
  preferredRole: '',
  previousOrganization: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  additionalMessage: '',
  agreedToTerms: false,
  confirmedAccurate: false
};

const PRIORITY_TRACKS: {
  role: string;
  interestArea: string;
  cadence: string;
  summary: string;
}[] = [
  {
    role: 'Workshop & Training Facilitator',
    interestArea: 'Women Leadership Training',
    cadence: 'Weekend Sessions · Hybrid',
    summary: 'Co-lead civic literacy, public speaking, and career readiness circles.'
  },
  {
    role: 'Campus & Youth Ambassador',
    interestArea: 'Youth Civic Fellowship',
    cadence: 'Flexible · Campus Chapter',
    summary: 'Represent NexGen cohorts across universities, colleges, and student unions.'
  },
  {
    role: 'STEM & Digital Mentor',
    interestArea: 'STEM & Tech Mentorship',
    cadence: '4–6 hrs/week · Remote',
    summary: 'Guide young women in coding fundamentals, digital literacy, and portfolio design.'
  },
  {
    role: 'Media & Storytelling Lead',
    interestArea: 'Creative Media & Storytelling',
    cadence: 'Project-Based · Remote',
    summary: 'Document impact campaigns, design visual briefs, and produce dispatch stories.'
  },
  {
    role: 'Community Outreach Coordinator',
    interestArea: 'Community Health Outreach',
    cadence: 'Field & Chapter · Local',
    summary: 'Organize grassroots welfare drives, clinic awareness booths, and district surveys.'
  }
];

const QUICK_CITIES = [
  'Sialkot',
  'Lahore',
  'Karachi',
  'Islamabad',
  'Rawalpindi',
  'Faisalabad',
  'Multan',
  'Peshawar'
];

const SKILL_OPTIONS = [
  'Public Speaking & Debate',
  'Graphic Design & Branding',
  'Content & Article Writing',
  'Social Media & Campaigns',
  'Event Organization & Logistics',
  'Mentorship & Teaching',
  'Data Entry & Tech Support',
  'Fundraising & Grant Writing',
  'Photography & Video Editing',
  'First Aid & Community Health'
];

const INTEREST_AREAS = [
  'Women Leadership Training',
  'Youth Civic Fellowship',
  'STEM & Tech Mentorship',
  'Grassroots Economic Skills',
  'Community Health Outreach',
  'Creative Media & Storytelling',
  'Policy & Legal Advocacy'
];

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
];

const STEP_ITEMS = [
  { num: 1, title: 'Personal Info', subtitle: 'Identity & Contact', icon: User },
  { num: 2, title: 'Background', subtitle: 'Education & Skills', icon: GraduationCap },
  { num: 3, title: 'Volunteering', subtitle: 'Track & Schedule', icon: HeartHandshake },
  { num: 4, title: 'Dossier Review', subtitle: 'Verify & Submit', icon: ShieldCheck }
];

function loadSavedDraft(): { step: number; formData: FormData } | null {
  try {
    const raw = localStorage.getItem(VOLUNTEER_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.formData) return null;
    return {
      step: typeof parsed.step === 'number' && parsed.step >= 1 && parsed.step <= 4 ? parsed.step : 1,
      formData: {
        ...initialFormData,
        ...parsed.formData,
        skills: Array.isArray(parsed.formData.skills) ? parsed.formData.skills : [],
        interestAreas: Array.isArray(parsed.formData.interestAreas) ? parsed.formData.interestAreas : [],
        availableDays:
          Array.isArray(parsed.formData.availableDays) && parsed.formData.availableDays.length > 0
            ? parsed.formData.availableDays
            : initialFormData.availableDays
      }
    };
  } catch {
    return null;
  }
}

export const VolunteerForm: React.FC = () => {
  const { addToast, setActivePage, settings } = useApp();
  const initialDraft = useMemo(() => loadSavedDraft(), []);

  const [step, setStep] = useState<number>(() => initialDraft?.step || 1);
  const [formData, setFormData] = useState<FormData>(() => initialDraft?.formData || initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<{ message: string; isDuplicate?: boolean } | null>(null);
  const [submissionResult, setSubmissionResult] = useState<{
    referenceCode: string;
    applicationId: string;
    applicantName: string;
    applicantRole: string;
    applicantCity: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [draftRestoredNotice, setDraftRestoredNotice] = useState<boolean>(() => Boolean(initialDraft));

  useDocumentSEO({
    title: 'Volunteer Application & Civic Enrollment | NexGen Council',
    description:
      'Apply to volunteer with the NexGen Women Empowerment & Youth Leadership Council. Join our grassroots movement and create measurable community impact.',
    canonicalPath: '/volunteer',
    ogType: 'website',
    ogImage: '/banner.png',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: window.location.origin },
          { '@type': 'ListItem', position: 2, name: 'Volunteer Application', item: `${window.location.origin}/volunteer` }
        ]
      }
    ]
  });

  const hasUnsavedProgress = useMemo(() => {
    return (
      formData.fullName.trim().length > 0 ||
      formData.email.trim().length > 0 ||
      formData.phone.trim().length > 0 ||
      formData.city.trim().length > 0 ||
      formData.profession.trim().length > 0 ||
      formData.whyJoin.trim().length > 0 ||
      formData.preferredRole.trim().length > 0 ||
      formData.skills.length > 0 ||
      formData.interestAreas.length > 0
    );
  }, [formData]);

  useEffect(() => {
    if (submissionResult) return;
    if (!hasUnsavedProgress && step === 1) {
      try {
        localStorage.removeItem(VOLUNTEER_DRAFT_STORAGE_KEY);
      } catch {}
      return;
    }
    try {
      localStorage.setItem(
        VOLUNTEER_DRAFT_STORAGE_KEY,
        JSON.stringify({ step, formData })
      );
    } catch {}
  }, [formData, step, hasUnsavedProgress, submissionResult]);

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (submitError) setSubmitError(null);
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const toggleArrayItem = (field: 'skills' | 'interestAreas' | 'availableDays', item: string) => {
    setFormData(prev => {
      const list = prev[field];
      const exists = list.includes(item);
      const updated = exists ? list.filter(i => i !== item) : [...list, item];
      return { ...prev, [field]: updated };
    });
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSelectPriorityTrack = (role: string, interestArea: string) => {
    setFormData(prev => {
      const hasArea = prev.interestAreas.includes(interestArea);
      return {
        ...prev,
        preferredRole: role,
        interestAreas: hasArea ? prev.interestAreas : [...prev.interestAreas, interestArea]
      };
    });
    setErrors(prev => {
      const next = { ...prev };
      delete next.preferredRole;
      delete next.interestAreas;
      return next;
    });
    addToast(`Selected track: ${role}`, 'info');
  };

  const handleResetDraft = () => {
    try {
      localStorage.removeItem(VOLUNTEER_DRAFT_STORAGE_KEY);
    } catch {}
    setFormData(initialFormData);
    setStep(1);
    setErrors({});
    setSubmitError(null);
    setDraftRestoredNotice(false);
    addToast('Application draft cleared', 'info');
  };

  const validateStep = (currentStep: number): boolean => {
    const errs: Record<string, string> = {};

    if (currentStep === 1) {
      if (!formData.fullName.trim() || formData.fullName.trim().length < 2) {
        errs.fullName = 'Please enter your full legal name.';
      }
      if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errs.email = 'Please provide a valid email address.';
      }
      if (!formData.phone.trim() || formData.phone.replace(/[^0-9]/g, '').length < 7) {
        errs.phone = 'Please provide a valid phone or WhatsApp number.';
      }
      if (!formData.city.trim()) {
        errs.city = 'Please enter your current city or district.';
      }
    }

    if (currentStep === 2) {
      if (!formData.profession.trim()) {
        errs.profession = 'Please indicate your current occupation or course of study.';
      }
      if (formData.skills.length === 0 && !formData.skillsOther.trim()) {
        errs.skills = 'Please select or enter at least one skill or capability.';
      }
    }

    if (currentStep === 3) {
      if (!formData.whyJoin.trim() || formData.whyJoin.trim().length < 20) {
        errs.whyJoin = 'Please provide at least 20 characters explaining your motivation.';
      }
      if (formData.interestAreas.length === 0) {
        errs.interestAreas = 'Please select at least one area of interest.';
      }
      if (formData.availableDays.length === 0) {
        errs.availableDays = 'Please select at least one day you can contribute.';
      }
      if (!formData.preferredRole.trim()) {
        errs.preferredRole = 'Please indicate your preferred volunteering role.';
      }
    }

    if (currentStep === 4) {
      if (!formData.agreedToTerms) {
        errs.agreedToTerms = 'You must agree to the organization code of conduct.';
      }
      if (!formData.confirmedAccurate) {
        errs.confirmedAccurate = 'Please confirm that all submitted details are accurate.';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    setSubmitError(null);
    if (validateStep(step)) {
      setStep(prev => Math.min(prev + 1, 4));
      window.scrollTo({ top: 180, behavior: 'smooth' });
    }
  };

  const handlePrev = () => {
    setSubmitError(null);
    setStep(prev => Math.max(prev - 1, 1));
    window.scrollTo({ top: 180, behavior: 'smooth' });
  };

  const handleStepClick = (targetStep: number) => {
    if (targetStep === step) return;
    if (targetStep < step) {
      setSubmitError(null);
      setStep(targetStep);
      return;
    }
    if (targetStep === step + 1 && validateStep(step)) {
      setSubmitError(null);
      setStep(targetStep);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validateStep(4)) return;

    setIsSubmitting(true);

    try {
      const skillsCombined = [...formData.skills];
      if (formData.skillsOther.trim()) {
        skillsCombined.push(formData.skillsOther.trim());
      }

      const payload = {
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        city: formData.city,
        address: formData.address,
        educationLevel: formData.educationLevel,
        profession: formData.profession,
        skills: skillsCombined,
        previousVolunteerExperience: formData.previousVolunteerExperience,
        whyJoin: formData.whyJoin,
        interestAreas: formData.interestAreas,
        availableDays: formData.availableDays,
        availableHours: formData.availableHours,
        preferredRole: formData.preferredRole,
        previousOrganization: formData.previousOrganization,
        emergencyContactName: formData.emergencyContactName,
        emergencyContactPhone: formData.emergencyContactPhone,
        additionalMessage: formData.additionalMessage,
        agreedToTerms: formData.agreedToTerms,
        confirmedAccurate: formData.confirmedAccurate
      };

      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        const errMessage = data.error || 'Failed to submit application.';
        setSubmitError({
          message: errMessage,
          isDuplicate: res.status === 409 || Boolean(data.duplicate)
        });
        addToast(errMessage, 'error');
        return;
      }

      try {
        localStorage.removeItem(VOLUNTEER_DRAFT_STORAGE_KEY);
      } catch {}

      setSubmissionResult({
        referenceCode: data.referenceCode,
        applicationId: data.applicationId,
        applicantName: formData.fullName,
        applicantRole: formData.preferredRole || 'Volunteer Member',
        applicantCity: formData.city
      });
      addToast('Application submitted successfully!', 'success');
      window.scrollTo({ top: 120, behavior: 'smooth' });
    } catch (err: any) {
      const msg = err.message || 'Submission error. Please check your network.';
      setSubmitError({ message: msg });
      addToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyReferenceCode = () => {
    if (!submissionResult) return;
    navigator.clipboard.writeText(submissionResult.referenceCode);
    setCopiedCode(true);
    addToast('Reference code copied to clipboard!', 'info');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const motivationLength = formData.whyJoin.trim().length;
  const motivationProgressPct = Math.min(100, Math.round((motivationLength / 20) * 100));

  // SUCCESS CONFIRMATION VIEW
  if (submissionResult) {
    const configuredGroupLink =
      formData.gender === 'Male' && settings.volunteerWhatsappGroupLinkMale
        ? settings.volunteerWhatsappGroupLinkMale
        : formData.gender === 'Female' && settings.volunteerWhatsappGroupLinkFemale
        ? settings.volunteerWhatsappGroupLinkFemale
        : settings.volunteerWhatsappGroupLink;

    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200 shadow-lg space-y-8">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
              Application Registered
            </p>
            <h2 className="text-3xl font-serif font-bold text-slate-900">
              Welcome to the NexGen Movement
            </h2>
            <p className="text-slate-600 max-w-lg mx-auto text-sm sm:text-base">
              Thank you, <strong className="text-slate-900">{submissionResult.applicantName}</strong>. Your volunteer enrollment dossier has been recorded in the Secretariat registry.
            </p>
          </div>

          {/* Reference Code & Dossier Card */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-7 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                  Official Application Reference
                </p>
                <p className="font-mono text-2xl sm:text-3xl font-bold tracking-wider text-white mt-1 tabular-nums">
                  {submissionResult.referenceCode}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyReferenceCode}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 print:hidden"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Receipt</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-white/15 text-xs">
              <div>
                <span className="text-slate-400 block">Selected Track</span>
                <strong className="text-white">{submissionResult.applicantRole}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Regional Chapter</span>
                <strong className="text-white">{submissionResult.applicantCity || 'National Pool'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Current Status</span>
                <strong className="text-amber-300">Pending Review</strong>
              </div>
            </div>
          </div>

          {/* Onboarding Timeline */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
            <h4 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-900" />
              <span>Secretariat Review &amp; Induction Process</span>
            </h4>
            <div className="space-y-3 text-xs sm:text-sm text-slate-600">
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-md bg-indigo-950 text-white flex items-center justify-center text-xs shrink-0 font-bold tabular-nums">
                  1
                </span>
                <p>
                  <strong className="text-slate-900">Dossier Evaluation:</strong> Our Engagement Committee reviews your background and chapter availability within 3–5 working days.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-md bg-indigo-950 text-white flex items-center justify-center text-xs shrink-0 font-bold tabular-nums">
                  2
                </span>
                <p>
                  <strong className="text-slate-900">Orientation Briefing:</strong> Approved volunteers receive an official onboarding invitation via email and WhatsApp.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-md bg-indigo-950 text-white flex items-center justify-center text-xs shrink-0 font-bold tabular-nums">
                  3
                </span>
                <p>
                  <strong className="text-slate-900">QR-Verified ID Card Issuance:</strong> Once approved, visit Track Application to generate your official NexGen Volunteer ID Card.
                </p>
              </div>
            </div>
          </div>

          {configuredGroupLink && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 text-xs">
              <div className="flex items-center gap-2.5 text-emerald-950">
                <MessageCircle className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Stay updated with cohort notices in the Council WhatsApp community channel.</span>
              </div>
              <a
                href={configuredGroupLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold whitespace-nowrap shrink-0"
              >
                Open WhatsApp Group
              </a>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 print:hidden">
            <button
              type="button"
              onClick={() => setActivePage('track')}
              className="w-full sm:w-auto px-6 py-3 bg-indigo-950 hover:bg-indigo-900 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm cursor-pointer whitespace-nowrap"
            >
              Track Application Status
            </button>
            <button
              type="button"
              onClick={() => {
                setSubmissionResult(null);
                setFormData(initialFormData);
                setStep(1);
                setActivePage('home');
              }}
              className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              Return to Homepage
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      {/* Institutional Editorial Header */}
      <div className="border-b border-slate-200 pb-8 mb-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-2.5 max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-800">
            NexGen Council · Civic &amp; Leadership Enrollment
          </p>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900 tracking-tight leading-tight">
            Volunteer Application &amp; Cohort Induction
          </h1>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            Join an active network advancing young women’s leadership, education equity, and civic innovation across regional chapters.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {hasUnsavedProgress && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{draftRestoredNotice ? 'Draft restored' : 'Draft saved locally'}</span>
            </span>
          )}
          {hasUnsavedProgress && (
            <button
              type="button"
              onClick={handleResetDraft}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Draft</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActivePage('track')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-950 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSearch className="w-3.5 h-3.5" />
            <span>Track Existing Application</span>
          </button>
        </div>
      </div>

      {/* 12-Column Asymmetric Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Context & Track Selection Rail */}
        <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-5">
          {/* Interactive Priority Tracks */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-serif font-bold text-slate-900">
                  Priority Volunteer Tracks
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a track below to pre-fill your preferred role and focus area.
                </p>
              </div>
              <Compass className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
            </div>

            <div className="space-y-2">
              {PRIORITY_TRACKS.map(track => {
                const isSelected =
                  formData.preferredRole.trim().toLowerCase() === track.role.toLowerCase();
                return (
                  <button
                    key={track.role}
                    type="button"
                    onClick={() => handleSelectPriorityTrack(track.role, track.interestArea)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/80 border-indigo-700 text-slate-900'
                        : 'bg-slate-50/60 border-slate-200 text-slate-800 hover:bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900">{track.role}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-800 shrink-0" />}
                    </div>
                    <p className="text-[11px] font-medium text-indigo-800 mt-0.5">{track.cadence}</p>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{track.summary}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Institutional Induction Dossier */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-700" />
              <h3 className="text-sm font-serif font-bold text-slate-900">
                Enrollment Standards
              </h3>
            </div>
            <dl className="divide-y divide-slate-200 text-xs">
              <div className="py-2.5 flex items-center justify-between gap-3">
                <dt className="text-slate-500">Weekly Commitment</dt>
                <dd className="font-semibold text-slate-900 tabular-nums">5–10 hrs / week</dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <dt className="text-slate-500">Membership Cost</dt>
                <dd className="font-semibold text-emerald-800">100% Free of Charge</dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <dt className="text-slate-500">Official Credentials</dt>
                <dd className="font-semibold text-slate-900">QR-Verified ID &amp; Cert</dd>
              </div>
              <div className="pt-2.5 flex items-center justify-between gap-3">
                <dt className="text-slate-500">Review Turnaround</dt>
                <dd className="font-semibold text-slate-900 tabular-nums">3–5 Working Days</dd>
              </div>
            </dl>
          </div>
        </aside>

        {/* Right 4-Step Application Form */}
        <div className="lg:col-span-8 space-y-6">
          {/* Interactive Stepper Progress Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {STEP_ITEMS.map(s => {
                const isCompleted = step > s.num;
                const isCurrent = step === s.num;
                const canClick = s.num <= step || s.num === step + 1;
                const Icon = s.icon;

                return (
                  <button
                    key={s.num}
                    type="button"
                    onClick={() => canClick && handleStepClick(s.num)}
                    disabled={!canClick}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                      isCurrent
                        ? 'bg-indigo-950 text-white border-indigo-950 shadow-xs'
                        : isCompleted
                        ? 'bg-emerald-50/70 text-emerald-950 border-emerald-200 hover:bg-emerald-100/60 cursor-pointer'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    } ${canClick && !isCurrent ? 'cursor-pointer' : !canClick ? 'cursor-default opacity-75' : ''}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold tabular-nums ${
                        isCurrent
                          ? 'bg-white/15 text-white'
                          : isCompleted
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-slate-500 border border-slate-200'
                      }`}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0 hidden sm:block">
                      <div className="text-[11px] font-bold leading-tight truncate">
                        {s.num}. {s.title}
                      </div>
                      <div
                        className={`text-[10px] leading-tight truncate mt-0.5 ${
                          isCurrent ? 'text-indigo-200' : isCompleted ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {s.subtitle}
                      </div>
                    </div>
                    <span className="sm:hidden text-[11px] font-bold tabular-nums">
                      Step {s.num}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-7">
              {/* STEP 1: PERSONAL INFORMATION */}
              {step === 1 && (
                <div className="space-y-6">
                  <div className="border-b border-slate-100 pb-4 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-serif font-bold text-slate-900">
                        1. Personal &amp; Contact Information
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Used to issue your official reference code, onboarding updates, and Member ID credentials.
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-slate-400 tabular-nums shrink-0">
                      1 / 4
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Full Legal Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.fullName}
                        onChange={e => updateField('fullName', e.target.value)}
                        placeholder="e.g. Fatima Zahra"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                          errors.fullName
                            ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                            : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-700'
                        }`}
                      />
                      {errors.fullName && <p className="text-rose-600 text-xs mt-1">{errors.fullName}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Email Address <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={e => updateField('email', e.target.value)}
                        placeholder="e.g. fatima@example.com"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                          errors.email
                            ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                            : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-700'
                        }`}
                      />
                      {errors.email && <p className="text-rose-600 text-xs mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Phone / WhatsApp Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={e => updateField('phone', e.target.value)}
                        placeholder="e.g. +92 300 0000000"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                          errors.phone
                            ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                            : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-700'
                        }`}
                      />
                      {errors.phone && <p className="text-rose-600 text-xs mt-1">{errors.phone}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={e => updateField('dateOfBirth', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-700"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Gender Identity
                      </label>
                      <select
                        value={formData.gender}
                        onChange={e => updateField('gender', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-700 bg-white"
                      >
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                        <option value="Non-binary">Non-binary</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        City / District <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        list="nexgen-cities"
                        value={formData.city}
                        onChange={e => updateField('city', e.target.value)}
                        placeholder="e.g. Sialkot, Lahore, Karachi"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                          errors.city
                            ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                            : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-700'
                        }`}
                      />
                      <datalist id="nexgen-cities">
                        {QUICK_CITIES.map(c => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                      {errors.city && <p className="text-rose-600 text-xs mt-1">{errors.city}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {QUICK_CITIES.slice(0, 5).map(cityName => (
                          <button
                            key={cityName}
                            type="button"
                            onClick={() => updateField('city', cityName)}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                              formData.city.trim().toLowerCase() === cityName.toLowerCase()
                                ? 'bg-indigo-950 text-white border-indigo-950'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {cityName}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Residential / Mailing Address (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={e => updateField('address', e.target.value)}
                      placeholder="Street address, neighborhood, or campus hostel"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-700"
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: EDUCATION & BACKGROUND */}
              {step === 2 && (
                <div className="space-y-6">
                  <div className="border-b border-slate-100 pb-4 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-serif font-bold text-slate-900">
                        2. Education &amp; Capabilities
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Share your academic path and practical strengths so we match you with an active chapter team.
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-slate-400 tabular-nums shrink-0">
                      2 / 4
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Highest Education Level
                      </label>
                      <select
                        value={formData.educationLevel}
                        onChange={e => updateField('educationLevel', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-700 bg-white"
                      >
                        <option value="High School / Intermediate">High School / Intermediate</option>
                        <option value="Undergraduate Student">Undergraduate Student</option>
                        <option value="Bachelor's Degree">Bachelor&apos;s Degree</option>
                        <option value="Master's Degree">Master&apos;s Degree</option>
                        <option value="Doctorate / PhD">Doctorate / PhD</option>
                        <option value="Other / Professional Diploma">Other / Professional Diploma</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Current Profession / Field of Study <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.profession}
                        onChange={e => updateField('profession', e.target.value)}
                        placeholder="e.g. Computer Science Student, Educator, Analyst"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                          errors.profession
                            ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                            : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-700'
                        }`}
                      />
                      {errors.profession && <p className="text-rose-600 text-xs mt-1">{errors.profession}</p>}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Skills &amp; Strengths (Select all that apply) <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                        {formData.skills.length} selected
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {SKILL_OPTIONS.map(skill => {
                        const isSelected = formData.skills.includes(skill);
                        return (
                          <button
                            type="button"
                            key={skill}
                            onClick={() => toggleArrayItem('skills', skill)}
                            className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs sm:text-sm font-medium transition-all text-left cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-700 text-indigo-950 font-semibold'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                                isSelected ? 'bg-indigo-900 border-indigo-900 text-white' : 'border-slate-300'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </div>
                            <span>{skill}</span>
                          </button>
                        );
                      })}
                    </div>
                    {errors.skills && <p className="text-rose-600 text-xs mt-2">{errors.skills}</p>}

                    <div className="mt-3">
                      <input
                        type="text"
                        value={formData.skillsOther}
                        onChange={e => updateField('skillsOther', e.target.value)}
                        placeholder="Additional skills (e.g. Translation, Debate Coaching, Project Accounting)"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-700"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Previous Volunteer or Civic Leadership Experience
                    </label>
                    <textarea
                      rows={3}
                      value={formData.previousVolunteerExperience}
                      onChange={e => updateField('previousVolunteerExperience', e.target.value)}
                      placeholder="Briefly note any student societies, community initiatives, or NGO roles..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-700"
                    />
                  </div>
                </div>
              )}

              {/* STEP 3: VOLUNTEERING INFORMATION */}
              {step === 3 && (
                <div className="space-y-6">
                  <div className="border-b border-slate-100 pb-4 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-serif font-bold text-slate-900">
                        3. Role, Motivation &amp; Availability
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Align your motivation, preferred track, and weekly availability with our program schedule.
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-slate-400 tabular-nums shrink-0">
                      3 / 4
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Why do you want to join NexGen Council? <span className="text-rose-500">*</span>
                      </label>
                      <span
                        className={`text-[11px] font-mono tabular-nums ${
                          motivationLength >= 20 ? 'text-emerald-700 font-semibold' : 'text-slate-500'
                        }`}
                      >
                        {motivationLength} / 20 min chars
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      value={formData.whyJoin}
                      onChange={e => updateField('whyJoin', e.target.value)}
                      placeholder="Describe the community impact you want to build and what motivates your application..."
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                        errors.whyJoin
                          ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                          : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-700'
                      }`}
                    />
                    <div className="mt-1.5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          motivationLength >= 20 ? 'bg-emerald-600' : 'bg-indigo-700'
                        }`}
                        style={{ width: `${motivationProgressPct}%` }}
                      />
                    </div>
                    {errors.whyJoin && <p className="text-rose-600 text-xs mt-1.5">{errors.whyJoin}</p>}
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Areas of Interest <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                        {formData.interestAreas.length} selected
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {INTEREST_AREAS.map(area => {
                        const isSelected = formData.interestAreas.includes(area);
                        return (
                          <button
                            type="button"
                            key={area}
                            onClick={() => toggleArrayItem('interestAreas', area)}
                            className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs sm:text-sm font-medium transition-all text-left cursor-pointer ${
                              isSelected
                                ? 'bg-amber-50 border-amber-600 text-amber-950 font-semibold'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                                isSelected ? 'bg-amber-600 border-amber-600 text-white' : 'border-slate-300'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </div>
                            <span>{area}</span>
                          </button>
                        );
                      })}
                    </div>
                    {errors.interestAreas && <p className="text-rose-600 text-xs mt-2">{errors.interestAreas}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <label className="block text-xs font-semibold text-slate-700">
                          Available Days <span className="text-rose-500">*</span>
                        </label>
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => updateField('availableDays', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])}
                            className="text-indigo-800 hover:underline font-medium cursor-pointer"
                          >
                            Weekdays
                          </button>
                          <span className="text-slate-300">/</span>
                          <button
                            type="button"
                            onClick={() => updateField('availableDays', ['Saturday', 'Sunday'])}
                            className="text-indigo-800 hover:underline font-medium cursor-pointer"
                          >
                            Weekends
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {DAYS_OF_WEEK.map(day => {
                          const isSelected = formData.availableDays.includes(day);
                          return (
                            <button
                              type="button"
                              key={day}
                              onClick={() => toggleArrayItem('availableDays', day)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-950 border-indigo-950 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {day.slice(0, 3)}
                            </button>
                          );
                        })}
                      </div>
                      {errors.availableDays && <p className="text-rose-600 text-xs mt-1.5">{errors.availableDays}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Weekly Time Commitment
                      </label>
                      <select
                        value={formData.availableHours}
                        onChange={e => updateField('availableHours', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                      >
                        <option value="2 - 4 hours/week">2 - 4 hours / week</option>
                        <option value="5 - 10 hours/week">5 - 10 hours / week</option>
                        <option value="10 - 15 hours/week">10 - 15 hours / week</option>
                        <option value="Full-time Intensive (15+ hours)">Full-time Cohort (15+ hours / week)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Preferred Volunteer Role <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.preferredRole}
                        onChange={e => updateField('preferredRole', e.target.value)}
                        placeholder="e.g. Workshop Facilitator, Campus Ambassador"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                          errors.preferredRole
                            ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                            : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-700'
                        }`}
                      />
                      {errors.preferredRole && <p className="text-rose-600 text-xs mt-1">{errors.preferredRole}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Previous Organization / University Chapter
                      </label>
                      <input
                        type="text"
                        value={formData.previousOrganization}
                        onChange={e => updateField('previousOrganization', e.target.value)}
                        placeholder="e.g. Youth Parliament, University Society"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-700"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: DOSSIER REVIEW, SAFETY & AGREEMENTS */}
              {step === 4 && (
                <div className="space-y-6">
                  <div className="border-b border-slate-100 pb-4 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-serif font-bold text-slate-900">
                        4. Emergency Contact &amp; Dossier Review
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Verify all dossier details before submitting your application to the Review Committee.
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-slate-400 tabular-nums shrink-0">
                      4 / 4
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Emergency Contact Name &amp; Relationship
                      </label>
                      <input
                        type="text"
                        value={formData.emergencyContactName}
                        onChange={e => updateField('emergencyContactName', e.target.value)}
                        placeholder="e.g. Mrs. Shaista (Mother)"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-700"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Emergency Contact Phone
                      </label>
                      <input
                        type="tel"
                        value={formData.emergencyContactPhone}
                        onChange={e => updateField('emergencyContactPhone', e.target.value)}
                        placeholder="e.g. +92 300 1112233"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-700"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Additional Note for Review Committee (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={formData.additionalMessage}
                      onChange={e => updateField('additionalMessage', e.target.value)}
                      placeholder="Any accessibility requirements, portfolio links, or scheduling notes..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-700"
                    />
                  </div>

                  {/* Structured Dossier Review Cards */}
                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Candidate Dossier Summary
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
                          <span className="font-bold text-slate-900">Personal Info</span>
                          <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-800 hover:underline cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" /> Edit
                          </button>
                        </div>
                        <p className="text-slate-900 font-semibold">{formData.fullName || '—'}</p>
                        <p className="text-slate-600 truncate">{formData.email || '—'}</p>
                        <p className="text-slate-600">{formData.phone || '—'} · {formData.city || '—'}</p>
                      </div>

                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
                          <span className="font-bold text-slate-900">Background</span>
                          <button
                            type="button"
                            onClick={() => setStep(2)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-800 hover:underline cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" /> Edit
                          </button>
                        </div>
                        <p className="text-slate-900 font-semibold">{formData.educationLevel}</p>
                        <p className="text-slate-600">{formData.profession || '—'}</p>
                        <p className="text-slate-600">
                          {formData.skills.length} skills selected{formData.skillsOther.trim() ? ' + custom' : ''}
                        </p>
                      </div>

                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
                          <span className="font-bold text-slate-900">Volunteering</span>
                          <button
                            type="button"
                            onClick={() => setStep(3)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-800 hover:underline cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" /> Edit
                          </button>
                        </div>
                        <p className="text-slate-900 font-semibold">{formData.preferredRole || '—'}</p>
                        <p className="text-slate-600">{formData.availableHours}</p>
                        <p className="text-slate-600">
                          {formData.availableDays.map(d => d.slice(0, 3)).join(', ')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Mandatory Agreements */}
                  <div className="space-y-3.5 pt-1">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={formData.agreedToTerms}
                        onChange={e => updateField('agreedToTerms', e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-900 focus:ring-indigo-500 mt-0.5"
                      />
                      <span className="text-xs text-slate-700 leading-relaxed group-hover:text-slate-900">
                        I agree to abide by the <strong>NexGen Women Empowerment &amp; Youth Leadership Council Code of Conduct</strong>, zero-tolerance anti-harassment policy, and commitment to inclusive community service.
                      </span>
                    </label>
                    {errors.agreedToTerms && <p className="text-rose-600 text-xs pl-7">{errors.agreedToTerms}</p>}

                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={formData.confirmedAccurate}
                        onChange={e => updateField('confirmedAccurate', e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-900 focus:ring-indigo-500 mt-0.5"
                      />
                      <span className="text-xs text-slate-700 leading-relaxed group-hover:text-slate-900">
                        I confirm that all information provided in this application is accurate and truthful.
                      </span>
                    </label>
                    {errors.confirmedAccurate && <p className="text-rose-600 text-xs pl-7">{errors.confirmedAccurate}</p>}
                  </div>
                </div>
              )}

              {submitError && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-950">
                        {submitError.isDuplicate ? 'Duplicate Identification Detected' : 'Unable to Submit Application'}
                      </p>
                      <p className="text-xs text-rose-800 mt-0.5 leading-relaxed">{submitError.message}</p>
                    </div>
                  </div>
                  {submitError.isDuplicate && (
                    <button
                      type="button"
                      onClick={() => setActivePage('track')}
                      className="px-4 py-2 rounded-xl bg-rose-900 hover:bg-rose-800 text-white text-xs font-semibold shrink-0 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      Go to Track Application
                    </button>
                  )}
                </div>
              )}

              {/* Stepper Footer Actions */}
              <div className="flex items-center justify-between pt-5 border-t border-slate-100">
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>
                ) : (
                  <div className="text-xs text-slate-400">
                    Fields marked <span className="text-rose-500">*</span> are required
                  </div>
                )}

                {step < 4 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white font-semibold text-sm transition-colors shadow-sm cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Continue to Step {step + 1}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm transition-colors shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Submitting Application...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Submit Volunteer Application</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
