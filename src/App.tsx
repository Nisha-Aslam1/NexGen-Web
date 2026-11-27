import React, { useEffect, useState, Suspense, lazy } from 'react';
import { AppProvider, useApp, canAccessAdminTab } from './context/AppContext.tsx';
import { ToastContainer } from './components/ToastContainer.tsx';
import { ShieldAlert } from 'lucide-react';
import { Navbar } from './components/Navbar.tsx';
import { Footer } from './components/Footer.tsx';
import { HomePage } from './components/public/HomePage.tsx';
import { SupportWidget } from './components/public/SupportWidget.tsx';
import { WhatsAppChannelModal } from './components/public/WhatsAppChannelModal.tsx';
import { initAnalyticsHeartbeat, trackPageView } from './lib/analytics.ts';

// Lazy-loaded Public pages
const AboutPage = lazy(() => import('./components/public/AboutPage.tsx').then(m => ({ default: m.AboutPage })));
const ProgramsPage = lazy(() => import('./components/public/ProgramsPage.tsx').then(m => ({ default: m.ProgramsPage })));
const EventsPage = lazy(() => import('./components/public/EventsPage.tsx').then(m => ({ default: m.EventsPage })));
const NewsPage = lazy(() => import('./components/public/NewsPage.tsx').then(m => ({ default: m.NewsPage })));
const GalleryPage = lazy(() => import('./components/public/GalleryPage.tsx').then(m => ({ default: m.GalleryPage })));
const TeamPage = lazy(() => import('./components/public/TeamPage.tsx').then(m => ({ default: m.TeamPage })));
const ContactPage = lazy(() => import('./components/public/ContactPage.tsx').then(m => ({ default: m.ContactPage })));
const DonatePage = lazy(() => import('./components/public/DonatePage.tsx').then(m => ({ default: m.DonatePage })));
const FaqPage = lazy(() => import('./components/public/FaqPage.tsx').then(m => ({ default: m.FaqPage })));
const TermsPage = lazy(() => import('./components/public/TermsPage.tsx').then(m => ({ default: m.TermsPage })));
const VolunteerForm = lazy(() => import('./components/public/VolunteerForm.tsx').then(m => ({ default: m.VolunteerForm })));
const TrackApplication = lazy(() => import('./components/public/TrackApplication.tsx').then(m => ({ default: m.TrackApplication })));
const NotFoundPage = lazy(() => import('./components/public/NotFoundPage.tsx').then(m => ({ default: m.NotFoundPage })));

// Lazy-loaded Admin & Meeting Modules (keeps initial homepage bundle lightweight & fast)
const AdminLogin = lazy(() => import('./components/admin/AdminLogin.tsx').then(m => ({ default: m.AdminLogin })));
const AdminLayout = lazy(() => import('./components/admin/AdminLayout.tsx').then(m => ({ default: m.AdminLayout })));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard.tsx').then(m => ({ default: m.AdminDashboard })));
const AdminApplications = lazy(() => import('./components/admin/AdminApplications.tsx').then(m => ({ default: m.AdminApplications })));
const AdminVolunteers = lazy(() => import('./components/admin/AdminVolunteers.tsx').then(m => ({ default: m.AdminVolunteers })));
const AdminPrograms = lazy(() => import('./components/admin/AdminPrograms.tsx').then(m => ({ default: m.AdminPrograms })));
const AdminEvents = lazy(() => import('./components/admin/AdminEvents.tsx').then(m => ({ default: m.AdminEvents })));
const AdminNews = lazy(() => import('./components/admin/AdminNews.tsx').then(m => ({ default: m.AdminNews })));
const AdminTeam = lazy(() => import('./components/admin/AdminTeam.tsx').then(m => ({ default: m.AdminTeam })));
const AdminGallery = lazy(() => import('./components/admin/AdminGallery.tsx').then(m => ({ default: m.AdminGallery })));
const AdminFaqs = lazy(() => import('./components/admin/AdminFaqs.tsx').then(m => ({ default: m.AdminFaqs })));
const AdminContacts = lazy(() => import('./components/admin/AdminContacts.tsx').then(m => ({ default: m.AdminContacts })));
const AdminSettings = lazy(() => import('./components/admin/AdminSettings.tsx').then(m => ({ default: m.AdminSettings })));
const AdminUsers = lazy(() => import('./components/admin/AdminUsers.tsx').then(m => ({ default: m.AdminUsers })));
const AdminActivityLogs = lazy(() => import('./components/admin/AdminActivityLogs.tsx').then(m => ({ default: m.AdminActivityLogs })));
const AdminDatabase = lazy(() => import('./components/admin/AdminDatabase.tsx').then(m => ({ default: m.AdminDatabase })));
const AdminAnalytics = lazy(() => import('./components/admin/AdminAnalytics.tsx').then(m => ({ default: m.AdminAnalytics })));
const AdminMeetings = lazy(() => import('./components/admin/AdminMeetings.tsx').then(m => ({ default: m.AdminMeetings })));
const AdminEmailComposer = lazy(() => import('./components/admin/AdminEmailComposer.tsx').then(m => ({ default: m.AdminEmailComposer })));
const AdminIdCards = lazy(() => import('./components/admin/AdminIdCards.tsx').then(m => ({ default: m.AdminIdCards })));
const AdminAppointmentLetters = lazy(() => import('./components/admin/AdminAppointmentLetters.tsx').then(m => ({ default: m.AdminAppointmentLetters })));
const MeetingRoomWrapper = lazy(() => import('./components/meetings/MeetingRoomWrapper.tsx').then(m => ({ default: m.MeetingRoomWrapper })));

const AppContent: React.FC = () => {
  const { activePage, setActivePage, currentUser, adminTab, setAdminTab } = useApp();
  const isPrivateRoute =
    activePage === 'admin' ||
    activePage === 'admin-login' ||
    activePage === 'room' ||
    activePage === 'meetings';
  const [showWhatsappDialog, setShowWhatsappDialog] = useState<boolean>(() => !isPrivateRoute);

  // Initialize analytics heartbeat
  useEffect(() => {
    const cleanup = initAnalyticsHeartbeat();
    return cleanup;
  }, []);

  // Track page navigation and scroll to top
  useEffect(() => {
    trackPageView(activePage === 'admin' ? `admin/${adminTab}` : activePage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activePage, adminTab]);

  // If in Room or Meetings view (never expose public directory on /meetings)
  if (activePage === 'room' || activePage === 'meetings') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
        <MeetingRoomWrapper isPrivatePortal={activePage === 'meetings'} />
      </Suspense>
    );
  }

  // If in Admin section or Admin Login
  if (activePage === 'admin' || activePage === 'admin-login') {
    if (!currentUser) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col justify-between">
          <div className="p-4 sm:px-8 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="NexGen Council" className="h-10 w-10 object-contain drop-shadow-sm" />
              <div>
                <span className="font-serif font-bold text-sm text-white block leading-tight">NexGen Council Administration</span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Secured Operations Center</span>
              </div>
            </div>
            <button
              onClick={() => setActivePage('home')}
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              ← Return to Website
            </button>
          </div>
          <Suspense fallback={<div className="flex-1" />}>
            <AdminLogin />
          </Suspense>
          <div className="py-4 px-4 text-center text-xs text-slate-400 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-center gap-2">
            <span>&copy; {new Date().getFullYear()} NexGen Organization Management System. All rights reserved.</span>
            <span className="hidden sm:inline text-slate-600">•</span>
            <span className="text-amber-400 font-semibold">Developed by Nisha Aslam</span>
          </div>
        </div>
      );
    }

    const hasTabAccess = canAccessAdminTab(adminTab, currentUser.role);

    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
        <AdminLayout>
          {!hasTabAccess ? (
            <div className="bg-white rounded-3xl border border-rose-200 p-8 sm:p-12 text-center max-w-lg mx-auto my-8 shadow-sm space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-serif font-bold text-slate-900">Access Restricted</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your current role (<span className="font-bold text-slate-800">{currentUser.role}</span>) does not have permission to open this administrative module.
              </p>
              <button
                onClick={() => setAdminTab('dashboard')}
                className="px-5 py-2.5 bg-slate-950 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          ) : (
            <Suspense fallback={<div className="p-8 text-xs text-slate-400">Loading section...</div>}>
              {adminTab === 'dashboard' && <AdminDashboard />}
              {adminTab === 'meetings' && <AdminMeetings />}
              {adminTab === 'analytics' && <AdminAnalytics />}
              {adminTab === 'applications' && <AdminApplications />}
              {adminTab === 'volunteers' && <AdminVolunteers />}
              {adminTab === 'id-cards' && <AdminIdCards />}
              {adminTab === 'appointment-letters' && <AdminAppointmentLetters />}
              {adminTab === 'programs' && <AdminPrograms />}
              {adminTab === 'events' && <AdminEvents />}
              {adminTab === 'news' && <AdminNews />}
              {adminTab === 'team' && <AdminTeam />}
              {adminTab === 'gallery' && <AdminGallery />}
              {adminTab === 'faqs' && <AdminFaqs />}
              {adminTab === 'contacts' && <AdminContacts />}
              {adminTab === 'email' && <AdminEmailComposer />}
              {adminTab === 'settings' && <AdminSettings />}
              {adminTab === 'users' && <AdminUsers />}
              {adminTab === 'database' && <AdminDatabase />}
              {adminTab === 'activity' && <AdminActivityLogs />}
            </Suspense>
          )}
        </AdminLayout>
      </Suspense>
    );
  }

  // Public View
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-indigo-950 selection:text-amber-300">
      <Navbar />

      <main className="flex-1">
        <Suspense fallback={null}>
          {activePage === 'home' && <HomePage />}
          {activePage === 'about' && <AboutPage />}
          {activePage === 'programs' && <ProgramsPage />}
          {activePage === 'events' && <EventsPage />}
          {activePage === 'news' && <NewsPage />}
          {activePage === 'gallery' && <GalleryPage />}
          {activePage === 'team' && <TeamPage />}
          {activePage === 'contact' && <ContactPage />}
          {activePage === 'donate' && <DonatePage />}
          {activePage === 'faq' && <FaqPage />}
          {activePage === 'terms' && <TermsPage />}
          {(activePage === 'volunteer' || activePage === 'volunteer-apply') && <VolunteerForm />}
          {(activePage === 'track' || activePage === 'track-application') && <TrackApplication />}
          {activePage === '404' && <NotFoundPage />}
        </Suspense>
      </main>

      <Footer />

      {/* Floating Customer Support Widget (Bottom Right) */}
      <SupportWidget />

      {/* Startup Official WhatsApp Channel Announcements Dialog */}
      <WhatsAppChannelModal
        open={showWhatsappDialog}
        onClose={() => setShowWhatsappDialog(false)}
      />

      {/* Floating Developer Watermark across public pages (Bottom Left) */}
      <div
        className="fixed bottom-4 left-4 z-30 hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950/85 hover:bg-slate-950 backdrop-blur-md text-white border border-slate-700/80 shadow-xl text-[11px] font-medium transition-all group select-none pointer-events-auto cursor-default"
        title="Platform Architecture & Full-Stack Development by Nisha Aslam"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
        <span className="text-slate-400 group-hover:text-slate-300 transition-colors">Developed by</span>
        <span className="font-bold text-amber-300 group-hover:text-amber-200 transition-colors">Nisha Aslam</span>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <ToastContainer />
      <AppContent />
    </AppProvider>
  );
}
