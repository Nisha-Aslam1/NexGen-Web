import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useDocumentSEO } from '../../lib/seo.ts';
import { Compass, Home, BookOpen, Calendar, HeartHandshake, Mail, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const { setActivePage } = useApp();

  useDocumentSEO({
    title: 'Page Not Found (404) | NexGen Council',
    description: 'The requested page could not be located on the NexGen Women Empowerment & Youth Leadership Council platform.',
    canonicalPath: '/404',
    noindex: true
  });

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full text-center space-y-8 bg-white p-8 sm:p-12 rounded-3xl border border-slate-200/80 shadow-xl">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-950">
          <Compass className="w-10 h-10 text-indigo-900 animate-pulse" />
        </div>

        <div className="space-y-3">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 inline-block">
            Error 404 &bull; Resource Not Located
          </span>
          <h1 className="text-3xl sm:text-5xl font-serif font-bold text-slate-950 tracking-tight">
            Page Not Found
          </h1>
          <p className="text-slate-600 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
            The page or resource you are seeking may have been moved, updated, or does not exist on the current NexGen Council portal.
          </p>
        </div>

        <div className="pt-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
            Recommended Destinations
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto text-left">
            <button
              onClick={() => setActivePage('home')}
              className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-indigo-900 hover:bg-slate-50 transition-all cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-indigo-950 group-hover:text-white transition-colors">
                <Home className="w-4 h-4 text-slate-700 group-hover:text-white" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Home Page</span>
                <span className="text-[11px] text-slate-500">Return to council overview</span>
              </div>
            </button>

            <button
              onClick={() => setActivePage('programs')}
              className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-indigo-900 hover:bg-slate-50 transition-all cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-indigo-950 group-hover:text-white transition-colors">
                <BookOpen className="w-4 h-4 text-slate-700 group-hover:text-white" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Leadership Programs</span>
                <span className="text-[11px] text-slate-500">View current cohorts</span>
              </div>
            </button>

            <button
              onClick={() => setActivePage('volunteer')}
              className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-indigo-900 hover:bg-slate-50 transition-all cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-indigo-950 group-hover:text-white transition-colors">
                <HeartHandshake className="w-4 h-4 text-slate-700 group-hover:text-white" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Volunteer With Us</span>
                <span className="text-[11px] text-slate-500">Submit enrollment application</span>
              </div>
            </button>

            <button
              onClick={() => setActivePage('contact')}
              className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-indigo-900 hover:bg-slate-50 transition-all cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-indigo-950 group-hover:text-white transition-colors">
                <Mail className="w-4 h-4 text-slate-700 group-hover:text-white" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Contact Secretariat</span>
                <span className="text-[11px] text-slate-500">Get direct assistance</span>
              </div>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-center">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-indigo-950 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Return to Previous Page
          </button>
        </div>
      </div>
    </div>
  );
};
