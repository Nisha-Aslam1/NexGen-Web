import React, { useState } from 'react';
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
  Calendar,
  Phone,
  Mail,
  MapPin,
  Clock,
  Sparkles,
  ShieldCheck,
  Send
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

export const VolunteerForm: React.FC = () => {
  const { addToast, setActivePage } = useApp();
  const [step, setStep] = useState<number>(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionResult, setSubmissionResult] = useState<{
    referenceCode: string;
    applicationId: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

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

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
    if (validateStep(step)) {
      setStep(prev => Math.min(prev + 1, 4));
      window.scrollTo({ top: 300, behavior: 'smooth' });
    }
  };

  const handlePrev = () => {
    setStep(prev => Math.max(prev - 1, 1));
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        throw new Error(data.error || 'Failed to submit application.');
      }

      setSubmissionResult({
        referenceCode: data.referenceCode,
        applicationId: data.applicationId
      });
      addToast('Application submitted successfully!', 'success');
      window.scrollTo({ top: 150, behavior: 'smooth' });
    } catch (err: any) {
      addToast(err.message || 'Submission error. Please check your network.', 'error');
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

  // SUCCESS CONFIRMATION VIEW
  if (submissionResult) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200 shadow-xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200 uppercase tracking-wider">
              Application Received
            </span>
            <h2 className="text-3xl font-serif font-bold text-slate-900">
              Welcome to the NexGen Movement!
            </h2>
            <p className="text-slate-600 max-w-lg mx-auto text-sm sm:text-base">
              Thank you, <strong className="text-slate-900">{formData.fullName}</strong>. Your volunteer application has been securely registered in the council directory.
            </p>
          </div>

          {/* Reference Code Card */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-6 max-w-md mx-auto shadow-lg space-y-3">
            <span className="text-xs font-semibold text-amber-300 uppercase tracking-widest">
              Your Unique Application Reference
            </span>
            <div className="flex items-center justify-center gap-3">
              <span className="font-mono text-2xl sm:text-3xl font-bold tracking-wider text-white">
                {submissionResult.referenceCode}
              </span>
              <button
                onClick={copyReferenceCode}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer"
                title="Copy reference code"
                aria-label="Copy reference code"
              >
                {copiedCode ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Keep this reference code to check your review status anytime.
            </p>
          </div>

          {/* Next Steps Timeline */}
          <div className="text-left bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
            <h4 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-900" /> What Happens Next?
            </h4>
            <div className="space-y-3 text-xs sm:text-sm text-slate-600">
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-900 text-white flex items-center justify-center text-xs shrink-0 font-bold">1</span>
                <p><strong>Review & Dossier Assessment:</strong> Our Volunteer Engagement Committee evaluates candidate background, preferred areas, and regional cohort availability (typically within 3–5 working days).</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-900 text-white flex items-center justify-center text-xs shrink-0 font-bold">2</span>
                <p><strong>Orientation Invitation:</strong> Shortlisted applicants receive an official invitation via email/WhatsApp for a virtual onboarding & ethics orientation.</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-900 text-white flex items-center justify-center text-xs shrink-0 font-bold">3</span>
                <p><strong>Cohort & Chapter Induction:</strong> You will be officially assigned to your active program track and regional council chapter with credentials and badge.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <button
              onClick={() => setActivePage('track')}
              className="w-full sm:w-auto px-6 py-3 bg-indigo-900 hover:bg-indigo-800 text-white rounded-xl text-sm font-semibold transition-colors shadow-md cursor-pointer"
            >
              Track Application Status
            </button>
            <button
              onClick={() => {
                setSubmissionResult(null);
                setFormData(initialFormData);
                setStep(1);
                setActivePage('home');
              }}
              className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
            >
              Return to Homepage
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center space-y-3 mb-10">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-900 text-xs font-semibold uppercase tracking-wider border border-indigo-100">
          <HeartHandshake className="w-3.5 h-3.5 text-indigo-700" /> Become a Volunteer
        </span>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900 tracking-tight">
          Join the NexGen Leadership & Volunteer Network
        </h1>
        <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base">
          Be part of an inspiring community dedicated to advancing young female leadership, education equity, and grassroots community innovation.
        </p>
      </div>

      {/* Stepper Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
          <div
            className="absolute top-1/2 left-0 h-0.5 bg-indigo-900 -translate-y-1/2 z-0 transition-all duration-300"
            style={{ width: `${((step - 1) / 3) * 100}%` }}
          />

          {[
            { num: 1, title: 'Personal Info', icon: User },
            { num: 2, title: 'Background', icon: GraduationCap },
            { num: 3, title: 'Volunteering', icon: HeartHandshake },
            { num: 4, title: 'Verification', icon: ShieldCheck }
          ].map(s => {
            const isCompleted = step > s.num;
            const isCurrent = step === s.num;
            const Icon = s.icon;
            return (
              <div key={s.num} className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-200 ${
                    isCurrent
                      ? 'bg-indigo-950 text-white ring-4 ring-indigo-100 shadow-md'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-400 border-2 border-slate-200'
                  }`}
                >
                  {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
                </div>
                <span
                  className={`text-xs mt-2 font-medium hidden sm:block ${
                    isCurrent ? 'text-indigo-950 font-bold' : isCompleted ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                >
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 sm:p-10 space-y-8">
          {/* STEP 1: PERSONAL INFORMATION */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-xl font-serif font-bold text-slate-900">
                  1. Personal Information
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Please provide your contact details so our coordinator can get in touch with you.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Full Legal Name <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.fullName}
                      onChange={e => updateField('fullName', e.target.value)}
                      placeholder="e.g. Fatima Zahra"
                      className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                        errors.fullName
                          ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                          : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-600'
                      }`}
                    />
                  </div>
                  {errors.fullName && <p className="text-rose-600 text-xs mt-1.5">{errors.fullName}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => updateField('email', e.target.value)}
                      placeholder="e.g. fatima@example.com"
                      className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                        errors.email
                          ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                          : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-600'
                      }`}
                    />
                  </div>
                  {errors.email && <p className="text-rose-600 text-xs mt-1.5">{errors.email}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Phone / WhatsApp Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => updateField('phone', e.target.value)}
                    placeholder="e.g. +1 555-0192"
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                      errors.phone
                        ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-600'
                    }`}
                  />
                  {errors.phone && <p className="text-rose-600 text-xs mt-1.5">{errors.phone}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={e => updateField('dateOfBirth', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Gender Identity
                  </label>
                  <select
                    value={formData.gender}
                    onChange={e => updateField('gender', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 bg-white"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    City / District <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={e => updateField('city', e.target.value)}
                    placeholder="e.g. Lahore, Karachi, Islamabad"
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                      errors.city
                        ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-600'
                    }`}
                  />
                  {errors.city && <p className="text-rose-600 text-xs mt-1.5">{errors.city}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Residential / Street Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={e => updateField('address', e.target.value)}
                  placeholder="Street name, apartment, postal code"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600"
                />
              </div>
            </div>
          )}

          {/* STEP 2: EDUCATION & BACKGROUND */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-xl font-serif font-bold text-slate-900">
                  2. Education & Professional Background
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Tell us about your educational experience and unique capabilities.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Highest Education Level
                  </label>
                  <select
                    value={formData.educationLevel}
                    onChange={e => updateField('educationLevel', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 bg-white"
                  >
                    <option value="High School / Intermediate">High School / Intermediate</option>
                    <option value="Undergraduate Student">Undergraduate Student</option>
                    <option value="Bachelor's Degree">Bachelor's Degree</option>
                    <option value="Master's Degree">Master's Degree</option>
                    <option value="Doctorate / PhD">Doctorate / PhD</option>
                    <option value="Other / Professional Diploma">Other / Professional Diploma</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Current Profession / Field of Study <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.profession}
                    onChange={e => updateField('profession', e.target.value)}
                    placeholder="e.g. Software Engineer, Biology Student, Teacher"
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                      errors.profession
                        ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-600'
                    }`}
                  />
                  {errors.profession && <p className="text-rose-600 text-xs mt-1.5">{errors.profession}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Skills & Strengths (Select all that apply) <span className="text-rose-500">*</span>
                </label>
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
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-950 font-semibold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
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
                    placeholder="Other skills (e.g. Translation, Photography, Project Accounting)"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Previous Volunteer or Social Work Experience
                </label>
                <textarea
                  rows={3}
                  value={formData.previousVolunteerExperience}
                  onChange={e => updateField('previousVolunteerExperience', e.target.value)}
                  placeholder="Share any past volunteering, campus clubs, NGO activities or community projects..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600"
                />
              </div>
            </div>
          )}

          {/* STEP 3: VOLUNTEERING INFORMATION */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-xl font-serif font-bold text-slate-900">
                  3. Volunteering Preferences & Availability
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Help us match your passion with the right program tracks and operational teams.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Why do you want to join NexGen Council? <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={formData.whyJoin}
                  onChange={e => updateField('whyJoin', e.target.value)}
                  placeholder="Describe your motivation, what change you want to bring, and how you hope to grow with us..."
                  className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                    errors.whyJoin
                      ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                      : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-600'
                  }`}
                />
                {errors.whyJoin && <p className="text-rose-600 text-xs mt-1.5">{errors.whyJoin}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Areas of Interest <span className="text-rose-500">*</span>
                </label>
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
                          className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Available Days <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map(day => {
                      const isSelected = formData.availableDays.includes(day);
                      return (
                        <button
                          type="button"
                          key={day}
                          onClick={() => toggleArrayItem('availableDays', day)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-900 border-indigo-900 text-white'
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
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Available Time Commitment
                  </label>
                  <select
                    value={formData.availableHours}
                    onChange={e => updateField('availableHours', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                  >
                    <option value="2 - 4 hours/week">2 - 4 hours / week</option>
                    <option value="5 - 10 hours/week">5 - 10 hours / week</option>
                    <option value="10 - 15 hours/week">10 - 15 hours / week</option>
                    <option value="Full-time Intensive (15+ hours)">Full-time Cohort (15+ hours / week)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Preferred Volunteer Role <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.preferredRole}
                    onChange={e => updateField('preferredRole', e.target.value)}
                    placeholder="e.g. Workshop Facilitator, Media Lead, Campus Ambassador"
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                      errors.preferredRole
                        ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-600'
                    }`}
                  />
                  {errors.preferredRole && <p className="text-rose-600 text-xs mt-1.5">{errors.preferredRole}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Previous Organization / Association
                  </label>
                  <input
                    type="text"
                    value={formData.previousOrganization}
                    onChange={e => updateField('previousOrganization', e.target.value)}
                    placeholder="e.g. Rotaract, Youth Parliament, UN Women Chapter"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: VERIFICATION & AGREEMENT */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-xl font-serif font-bold text-slate-900">
                  4. Verification, Emergency Contact & Agreements
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Final safety information and formal declarations.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Emergency Contact Name & Relationship
                  </label>
                  <input
                    type="text"
                    value={formData.emergencyContactName}
                    onChange={e => updateField('emergencyContactName', e.target.value)}
                    placeholder="e.g. Mrs. Shaista (Mother)"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Emergency Contact Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.emergencyContactPhone}
                    onChange={e => updateField('emergencyContactPhone', e.target.value)}
                    placeholder="e.g. +1 555-9988"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Additional Note or Message for Review Committee (Optional)
                </label>
                <textarea
                  rows={2}
                  value={formData.additionalMessage}
                  onChange={e => updateField('additionalMessage', e.target.value)}
                  placeholder="Any special accommodations, certificates, or scheduling preferences..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {/* Summary Review Box */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 text-xs space-y-2">
                <span className="font-semibold text-slate-900 uppercase tracking-wider block">
                  Application Summary Preview
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-600">
                  <div>
                    <span className="text-slate-400 block">Applicant:</span>
                    <strong className="text-slate-900">{formData.fullName || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Email:</span>
                    <strong className="text-slate-900 truncate block">{formData.email || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Location:</span>
                    <strong className="text-slate-900">{formData.city || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Preferred Role:</span>
                    <strong className="text-slate-900">{formData.preferredRole || '—'}</strong>
                  </div>
                </div>
              </div>

              {/* Mandatory Agreements */}
              <div className="space-y-4 pt-2">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={formData.agreedToTerms}
                    onChange={e => updateField('agreedToTerms', e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-indigo-900 focus:ring-indigo-500 mt-0.5"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed group-hover:text-slate-900">
                    I agree to abide by the <strong>NexGen Women Empowerment & Youth Leadership Council Code of Conduct</strong>, zero-tolerance anti-harassment policy, and commitment to inclusive community service.
                  </span>
                </label>
                {errors.agreedToTerms && <p className="text-rose-600 text-xs pl-8">{errors.agreedToTerms}</p>}

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={formData.confirmedAccurate}
                    onChange={e => updateField('confirmedAccurate', e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-indigo-900 focus:ring-indigo-500 mt-0.5"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed group-hover:text-slate-900">
                    I solemnly confirm that all information provided by me in this application is accurate and true to the best of my knowledge.
                  </span>
                </label>
                {errors.confirmedAccurate && <p className="text-rose-600 text-xs pl-8">{errors.confirmedAccurate}</p>}
              </div>
            </div>
          )}

          {/* Stepper Actions */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-100">
            {step > 1 ? (
              <button
                type="button"
                onClick={handlePrev}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white font-semibold text-sm transition-all shadow-md hover:scale-[1.02] cursor-pointer"
              >
                Continue to Step {step + 1} <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold text-sm transition-all shadow-lg hover:shadow-emerald-600/30 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Submitting Application...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-emerald-200" />
                    <span>Submit Volunteer Application</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
