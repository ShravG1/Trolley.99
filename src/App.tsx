import { lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
  // 'loading' is handled separately below (it's the splash, with its own exit
  // choreography); gate covers the two static pre-app screens.
  let gate: React.ReactNode = null;
  if (sync.status === 'signed-out') {
    gate = <Welcome />;
  } else if (sync.status === 'needs-group') {
    gate = <GroupSetup onDone={sync.refresh} />;
  }

  // Welcome carries its own Add-to-Home-Screen hint up top, so don't also pop
  // the bottom-sheet InstallPrompt over the sign-in screen — that's the same ask twice.
  const signedOut = sync.status === 'signed-out';

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <OfflineBanner />
        {/* AnimatePresence sits ABOVE the splash/gate/app switch so the splash's
            exit runs on every handoff out of 'loading' — including the primary
            loading→ready path where the gate disappears entirely. mode="wait":
            the splash fades/scales out fully before the next screen mounts.
            Welcome/GroupSetup are static screens, not transients, so only the
            splash carries exit choreography. */}
        <AnimatePresence mode="wait">
        {sync.status === 'loading' ? (
          <motion.div
            key="splash"
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.32, ease: [0.45, 0, 0.2, 1] }}
          >
            {/* Even mid-load, keep the privacy policy reachable (§ sign-up). */}
            <Routes>
              <Route path="/privacy" element={<Privacy />} />
              <Route path="*" element={<Splash />} />
            </Routes>
          </motion.div>
        ) : gate ? (
          // Even before sign-in, keep the privacy policy reachable so people can
          // read it before deciding to join; everything else shows the gate.
          <Routes key="gate">
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*" element={gate} />
          </Routes>
        ) : (
          <Routes key="app">
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
        </AnimatePresence>
        <Toasts />
        <Onboarding />
        <PushNudge />
        {!signedOut && <InstallPrompt />}
        <UpdatePrompt />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

function Splash() {
  return (
    <motion.div
      className="grid min-h-dvh place-items-center"
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <CartLoader caption="Trolley…" />
    </motion.div>
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
