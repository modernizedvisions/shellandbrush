import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

const isDev = Boolean(import.meta.env?.DEV);

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="py-12 bg-white min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-2xl font-serif text-slate-900">Shop page failed to load</h1>
          <p className="mt-2 text-sm text-slate-600">Please refresh or try again in a moment.</p>
          {isDev && this.state.error?.stack && (
            <pre className="mt-6 text-left text-xs text-slate-600 whitespace-pre-wrap">
              {this.state.error.stack}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
