import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from '@/screens/Home';
import { Welcome } from '@/screens/Welcome';
import { Settings } from '@/screens/Settings';
import { Archive } from '@/screens/Archive';
import { Privacy } from '@/screens/Privacy';
import { GroupSetup } from '@/screens/GroupSetup';
import { Toasts } from '@/components/Toasts';
import { PushNudge } from '@/components/PushNudge';
import { OfflineBanner } from '@/components/OfflineBanner';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useSupabaseSync } from '@/sync/useSupabaseSync';

// Reporting is code-split out of the initial bundle (§10).
const Reporting = lazy(() => import('@/screens/Reporting'));

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
            <Route path="/" element={<Home />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route
              path="/reporting"
              element={
                <Suspense fallback={<Splash />}>
                  <Reporting />
                </Suspense>
              }
            />
            <Route path="*" element={<Home />} />
          </Routes>
        )}
        <Toasts />
        <PushNudge />
        <UpdatePrompt />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <p className="font-display text-display-s text-ink-soft">Trolley…</p>
    </div>
  );
}
