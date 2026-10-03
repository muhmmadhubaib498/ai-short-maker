import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { LandingPage } from './pages/LandingPage';
import { UserDashboard } from './pages/UserDashboard';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { ProjectsListPage } from './pages/ProjectsListPage';
import { ProjectDetailsPage } from './pages/ProjectDetailsPage';
import { MyClipsPage } from './pages/MyClipsPage';
import { SubscriptionPage } from './pages/SubscriptionPage';
import { ProfilePage } from './pages/ProfilePage';
import { OwnerDashboard } from './pages/owner/OwnerDashboard';
import { AuthModal } from './pages/AuthModal';
import { NotificationsModal } from './components/NotificationsModal';
import { PricingModal } from './components/PricingModal';
import { ErrorBoundary } from './components/ErrorBoundary';

const AppContent: React.FC = () => {
  const { user, isOwner, isAdmin, isLoading, refreshUser, logout } = useAuth();

  const [currentView, setCurrentView] = useState<string>('landing');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [pricingModalReason, setPricingModalReason] = useState<'limit_reached' | 'upgrade' | null>(null);

  // Global listener for paywall trigger (HTTP 402 or upgrade requests)
  React.useEffect(() => {
    const handleOpenPricing = (e: any) => {
      setPricingModalReason(e.detail?.reason || 'upgrade');
      setPricingModalOpen(true);
    };
    window.addEventListener('open-pricing-modal', handleOpenPricing);
    return () => window.removeEventListener('open-pricing-modal', handleOpenPricing);
  }, []);

  // Sync default view on user login state
  React.useEffect(() => {
    if (!isLoading) {
      if (user && currentView === 'landing') {
        setCurrentView('dashboard');
      } else if (!user && currentView !== 'landing') {
        setCurrentView('landing');
      }
    }
  }, [user, isLoading]);

  const handleOpenAuth = (mode: 'login' | 'signup') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const handleNavigate = (view: string, data?: any) => {
    if (view === 'project-detail' && data) {
      setSelectedProjectId(data);
      setCurrentView('project-detail');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs font-mono">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Initializing AI Shorts Maker...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        setCurrentView={(view) => handleNavigate(view)}
        openAuthModal={handleOpenAuth}
        openNotifications={() => setNotificationsOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {currentView === 'landing' && (
          <LandingPage
            onStartFree={() => (user ? handleNavigate('create') : handleOpenAuth('signup'))}
            onLogin={() => handleOpenAuth('login')}
            onNavigateToSubscription={() => (user ? handleNavigate('subscription') : handleOpenAuth('login'))}
          />
        )}

        {currentView === 'dashboard' && (
          <UserDashboard
            onNavigate={handleNavigate}
            openNotifications={() => setNotificationsOpen(true)}
          />
        )}

        {currentView === 'create' && (
          <CreateProjectPage
            onProjectCreated={(id) => handleNavigate('project-detail', id)}
            onNavigateToSubscription={() => handleNavigate('subscription')}
          />
        )}

        {currentView === 'projects' && (
          <ProjectsListPage
            onNavigateToProject={(id) => handleNavigate('project-detail', id)}
            onNavigateToCreate={() => handleNavigate('create')}
          />
        )}

        {currentView === 'project-detail' && selectedProjectId && (
          <ProjectDetailsPage
            projectId={selectedProjectId}
            onBack={() => handleNavigate('projects')}
            onProjectDeleted={() => handleNavigate('projects')}
          />
        )}

        {currentView === 'clips' && (
          <MyClipsPage onNavigateToCreate={() => handleNavigate('create')} />
        )}

        {currentView === 'subscription' && <SubscriptionPage />}

        {currentView === 'profile' && (
          <ProfilePage
            onLogout={() => {
              logout();
              handleNavigate('landing');
            }}
          />
        )}

        {currentView === 'owner' && (isOwner || isAdmin) && <OwnerDashboard />}
      </main>

      {/* Footer */}
      <Footer
        setCurrentView={(view) => handleNavigate(view)}
        openAuthModal={handleOpenAuth}
      />

      {/* Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          handleNavigate('dashboard');
        }}
      />

      {/* In-App Notifications Modal */}
      <NotificationsModal
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onRefreshAuth={refreshUser}
      />

      {/* Dynamic Multi-Payment & Pricing Modal */}
      <PricingModal
        isOpen={pricingModalOpen}
        onClose={() => setPricingModalOpen(false)}
        reason={pricingModalReason}
      />
    </div>
  );
};

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
