import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Home } from '@/screens/Home';
import { Welcome } from '@/screens/Welcome';
import { Toasts } from '@/components/Toasts';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CartLoader } from '@/components/CartLoader';
import { useSupabaseSync } from '@/sync/useSupabaseSync';
import { useStore } from '@/store/useStore';
import { showOverviewNow } from '@/lib/landing';

// Only Home + Welcome (the two screens most first/return visits land on) stay
// in the initial bundle — everything else here is code-split (§10), same
// pattern as the pre-existing Reporting/History split below.
const Lists = lazy(() => import('@/screens/Lists').then((m) => ({ default: m.Lists })));
const Settings = lazy(() => import('@/screens/Settings').then((m) => ({ default: m.Settings })));
const Archive = lazy(() => import('@/screens/Archive').then((m) => ({ default: m.Archive })));
const Privacy = lazy(() => import('@/screens/Privacy').then((m) => ({ default: m.Privacy })));
const GroupSetup = lazy(() =>
  import('@/screens/GroupSetup').then((m) => ({ default: m.GroupSetup }))
);
const Reporting = lazy(() => import('@/screens/Reporting'));
const History = lazy(() => import('@/screens/History'));

// Below-the-fold chrome (nudges/prompts, none of which gate visible content
// on first paint) — split out so they don't weigh down the initial bundle.
const PushNudge = lazy(() => import('@/components/PushNudge').then((m) => ({ default: m.PushNudge })));
const InstallPrompt = lazy(() =>
  import('@/components/InstallPrompt').then((m) => ({ default: m.InstallPrompt }))
);
const Onboarding = lazy(() =>
  import('@/components/Onboarding').then((m) => ({ default: m.Onboarding }))
);
const UpdatePrompt = lazy(() =>
  import('@/components/UpdatePrompt').then((m) => ({ default: m.UpdatePrompt }))
);

export default function App() {
  const sync = useSupabaseSync();

  // Auth gate (§2.1). In demo mode (no Supabase env) we skip straight to the app.
  let gate: React.ReactNode = null;
  if (sync.status === 'loading') {
    gate = <Splash />;
  } else if (sync.status === 'signed-out') {
    gate = <Welcome />;
  } else if (sync.status === 'needs-group') {
    gate = (
      <Suspense fallback={<Splash />}>
        <GroupSetup onDone={sync.refresh} />
      </Suspense>
    );
  }

  // Welcome carries its own Add-to-Home-Screen hint up top, so don't also pop
  // the bottom-sheet InstallPrompt over the sign-in screen — that's the same ask twice.
  const signedOut = sync.status === 'signed-out';

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <OfflineBanner />
        {gate ? (
          // Even before sign-in, keep the privacy policy reachable so people can
          // read it before deciding to join; everything else shows the gate.
          <Routes>
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*" element={gate} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/" element={<Landing />} />
            <Route
              path="/lists"
              element={
                <Suspense fallback={<Splash />}>
                  <Lists />
                </Suspense>
              }
            />
            <Route
              path="/settings"
              element={
                <Suspense fallback={<Splash />}>
                  <Settings />
                </Suspense>
              }
            />
            <Route
              path="/archive"
              element={
                <Suspense fallback={<Splash />}>
                  <Archive />
                </Suspense>
              }
            />
            <Route
              path="/privacy"
              element={
                <Suspense fallback={<Splash />}>
                  <Privacy />
                </Suspense>
              }
            />
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
        <Suspense fallback={null}>
          <Onboarding />
          <PushNudge />
          {!signedOut && <InstallPrompt />}
          <UpdatePrompt />
        </Suspense>
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
  return (
    <Suspense fallback={<Splash />}>
      <GroupSetup mode="add" onDone={() => navigate('/')} onCancel={() => navigate('/')} />
    </Suspense>
  );
}
