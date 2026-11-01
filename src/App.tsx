import React, { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { ToastContainer } from './components/ToastContainer.tsx';
import { Navbar } from './components/Navbar.tsx';
import { Footer } from './components/Footer.tsx';

// Public pages
import { HomePage } from './components/public/HomePage.tsx';
import { AboutPage } from './components/public/AboutPage.tsx';
import { ProgramsPage } from './components/public/ProgramsPage.tsx';
import { EventsPage } from './components/public/EventsPage.tsx';
import { NewsPage } from './components/public/NewsPage.tsx';
import { GalleryPage } from './components/public/GalleryPage.tsx';
import { TeamPage } from './components/public/TeamPage.tsx';
import { ContactPage } from './components/public/ContactPage.tsx';
import { VolunteerForm } from './components/public/VolunteerForm.tsx';
import { TrackApplication } from './components/public/TrackApplication.tsx';
import { NotFoundPage } from './components/public/NotFoundPage.tsx';

// Admin pages
import { AdminLogin } from './components/admin/AdminLogin.tsx';
import { AdminLayout } from './components/admin/AdminLayout.tsx';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { AdminApplications } from './components/admin/AdminApplications.tsx';
import { AdminVolunteers } from './components/admin/AdminVolunteers.tsx';
import { AdminPrograms } from './components/admin/AdminPrograms.tsx';
import { AdminEvents } from './components/admin/AdminEvents.tsx';
import { AdminNews } from './components/admin/AdminNews.tsx';
import { AdminTeam } from './components/admin/AdminTeam.tsx';
import { AdminGallery } from './components/admin/AdminGallery.tsx';
import { AdminContacts } from './components/admin/AdminContacts.tsx';
import { AdminSettings } from './components/admin/AdminSettings.tsx';
import { AdminUsers } from './components/admin/AdminUsers.tsx';
import { AdminActivityLogs } from './components/admin/AdminActivityLogs.tsx';
import { AdminDatabase } from './components/admin/AdminDatabase.tsx';
import { AdminAnalytics } from './components/admin/AdminAnalytics.tsx';
import { AdminMeetings } from './components/admin/AdminMeetings.tsx';
import { MeetingRoomWrapper } from './components/meetings/MeetingRoomWrapper.tsx';
import { initAnalyticsHeartbeat, trackPageView } from './lib/analytics.ts';

const AppContent: React.FC = () => {
  const { activePage, setActivePage, currentUser, adminTab } = useApp();

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

  // If in Room or Meetings view
  if (activePage === 'room' || activePage === 'meetings') {
    return <MeetingRoomWrapper />;
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
          <AdminLogin />
          <div className="py-4 px-4 text-center text-xs text-slate-400 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-center gap-2">
            <span>&copy; {new Date().getFullYear()} NexGen Organization Management System. All rights reserved.</span>
            <span className="hidden sm:inline text-slate-600">•</span>
            <span className="text-amber-400 font-semibold">Developed by Nisha Aslam</span>
          </div>
        </div>
      );
    }

    return (
      <AdminLayout>
        {adminTab === 'dashboard' && <AdminDashboard />}
        {adminTab === 'meetings' && <AdminMeetings />}
        {adminTab === 'analytics' && <AdminAnalytics />}
        {adminTab === 'applications' && <AdminApplications />}
        {adminTab === 'volunteers' && <AdminVolunteers />}
        {adminTab === 'programs' && <AdminPrograms />}
        {adminTab === 'events' && <AdminEvents />}
        {adminTab === 'news' && <AdminNews />}
        {adminTab === 'team' && <AdminTeam />}
        {adminTab === 'gallery' && <AdminGallery />}
        {adminTab === 'contacts' && <AdminContacts />}
        {adminTab === 'settings' && <AdminSettings />}
        {adminTab === 'users' && <AdminUsers />}
        {adminTab === 'database' && <AdminDatabase />}
        {adminTab === 'activity' && <AdminActivityLogs />}
      </AdminLayout>
    );
  }

  // Public View
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-indigo-950 selection:text-amber-300">
      <Navbar />

      <main className="flex-1">
        {activePage === 'home' && <HomePage />}
        {activePage === 'about' && <AboutPage />}
        {activePage === 'programs' && <ProgramsPage />}
        {activePage === 'events' && <EventsPage />}
        {activePage === 'news' && <NewsPage />}
        {activePage === 'gallery' && <GalleryPage />}
        {activePage === 'team' && <TeamPage />}
        {activePage === 'contact' && <ContactPage />}
        {(activePage === 'volunteer' || activePage === 'volunteer-apply') && <VolunteerForm />}
        {(activePage === 'track' || activePage === 'track-application') && <TrackApplication />}
        {activePage === '404' && <NotFoundPage />}
      </main>

      <Footer />

      {/* Floating Developer Watermark across public pages */}
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
