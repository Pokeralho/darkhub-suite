import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Home, RotateCcw } from './icons';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  /** Render nothing instead of the error card (for non-essential widgets such as overlays). */
  silent?: boolean;
  onError?: (error: Error, componentStack?: string | null) => void;
  onNavigateHome?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// A lazy() chunk that failed to load (e.g. the app was updated underneath the running renderer) stays
// rejected in React's cache, so "Try again" cannot recover it: only a full reload can.
function isChunkLoadError(error: Error | null): boolean {
  const msg = String(error?.message ?? '');
  return /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(msg);
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
    try {
      this.props.onError?.(error, errorInfo?.componentStack);
    } catch {}
  }

  private handleReset = () => {
    if (isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.silent) return null;
      const chunkError = isChunkLoadError(this.state.error);
      return (
        <div role="alert" className="max-w-xl mx-auto my-12 dh-card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h2 className="dh-section-title">
                {this.props.fallbackTitle || 'Ocorreu um erro ao carregar este módulo / An error occurred'}
              </h2>
              <pre className="mt-2 text-[11.5px] leading-relaxed text-red-300/90 font-mono bg-zinc-950 px-3 py-2 rounded-md border border-zinc-800/80 whitespace-pre-wrap break-words max-h-40 overflow-auto select-text">
                {this.state.error?.message || 'Component failed to render'}
              </pre>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-[30px]">
            <button onClick={this.handleReset} className="dh-btn dh-btn-primary">
              <RotateCcw size={14} />
              <span>{chunkError ? 'Recarregar app / Reload app' : 'Recarregar Módulo / Try Again'}</span>
            </button>
            {this.props.onNavigateHome ? (
              <button onClick={this.props.onNavigateHome} className="dh-btn">
                <Home size={14} />
                <span>Início / Home</span>
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
