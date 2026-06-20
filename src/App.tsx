import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Home } from '@/screens/Home';
import { Lists } from '@/screens/Lists';
import { Welcome } from '@/screens/Welcome';
import { Settings } from '@/screens/Settings';
import { Archive } from '@/screens/Archive';
import { Privacy } from '@/screens/Privacy';
import { GroupSetup } from '@/screens/GroupSetup';
import { Toasts } from '@/components/Toasts';
import { PushNudge } from '@/components/PushNudge';
import { InstallPrompt } from '@/components/InstallPrompt';
import { Onboarding } from '@/components/Onboarding';
import { OfflineBanner } from '@/components/OfflineBanner';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CartLoader } from '@/components/CartLoader';
import { useSupabaseSync } from '@/sync/useSupabaseSync';
import { useStore } from '@/store/useStore';
import { showOverviewNow } from '@/lib/landing';

// Reporting + history are code-split out of the initial bundle (§10).
const Reporting = lazy(() => import('@/screens/Reporting'));
const History = lazy(() => import('@/screens/History'));

export default function App() {
  const sync = useSupabaseSync();

  // Auth gate (§2.1). In demo mode (no Supabase env) we skip straight to the app.
  let gate: React.ReactNode = null;
  if (sync.status === 'loading') {
    gate = <Splash />;
  } else if (sync.status === 'signed-out') {
    gate = <Welcome />;
  } else if (sync.status === 'needs-group') {
    gate = <GroupSetup onDone={sync.refresh} />;
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <OfflineBanner />
        {gate ?? (
          <Routes>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/" element={<Landing />} />
            <Route path="/lists" element={<Lists />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/groups/new" element={<AddGroupRoute />} />
            <Route
              path="/reporting"
              element={
                <Suspense fallback={<Splash />}>
                  <Reporting />
                </Suspense>
              }
            />
            <Route
              path="/history"
              element={
                <Suspense fallback={<Splash />}>
                  <History />
                </Suspense>
              }
            />
            <Route path="*" element={<Home />} />
          </Routes>
        )}
        <Toasts />
        <Onboarding />
        <PushNudge />
        <InstallPrompt />
        <UpdatePrompt />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <CartLoader caption="Trolley…" />
    </div>
  );
}

// Multi-group users land on the "Your lists" overview so they see every group at
// once; once they've opened a list this session (or if they only have one), "/"
// is the list itself (§12).
function Landing() {
  const groupCount = useStore((s) => s.groups.length);
  if (showOverviewNow(groupCount)) return <Navigate to="/lists" replace />;
  return <Home />;
}

// Create/join another group from inside the app (§12). Reuses GroupSetup in
// 'add' mode; on success it switches to the new group and drops back on the list.
function AddGroupRoute() {
  const navigate = useNavigate();
  return <GroupSetup mode="add" onDone={() => navigate('/')} onCancel={() => navigate('/')} />;
}
