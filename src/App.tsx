import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from '@/screens/Home';
import { Welcome } from '@/screens/Welcome';
import { Settings } from '@/screens/Settings';
import { Archive } from '@/screens/Archive';
import { Privacy } from '@/screens/Privacy';
import { Toasts } from '@/components/Toasts';
import { OfflineBanner } from '@/components/OfflineBanner';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Reporting is code-split out of the initial bundle (§10).
const Reporting = lazy(() => import('@/screens/Reporting'));

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <OfflineBanner />
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route
            path="/reporting"
            element={
              <Suspense fallback={<div className="p-8 text-ink-soft">Loading…</div>}>
                <Reporting />
              </Suspense>
            }
          />
        </Routes>
        <Toasts />
        <UpdatePrompt />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
