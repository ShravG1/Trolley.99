import { Component, type ReactNode } from 'react';

// Global error boundary (§9) — a render error doesn't white-screen mid-shop.
// Wire your error tracker (e.g. Sentry) in componentDidCatch.
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // TODO: report to Sentry / error tracker (§9 observability)
    console.error('Trolley render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-8 text-center">
          <p className="font-display text-display-s text-ink">That went sideways.</p>
          <p className="mt-2 text-body text-ink-soft">Give it a refresh — your list’s safe.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 min-h-13 rounded-pill bg-brand px-6 font-semibold text-on-brand"
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
