import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
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
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-zinc-900 border border-zinc-800 rounded-xl max-w-xl mx-auto my-12 text-center space-y-4 shadow-xl">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-full">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              {this.props.fallbackTitle || 'Ocorreu um erro ao carregar este módulo / An error occurred'}
            </h2>
            <p className="text-xs text-zinc-400 mt-1 max-w-md font-mono bg-zinc-950 p-2.5 rounded border border-zinc-800 text-left overflow-x-auto">
              {this.state.error?.message || 'Component failed to render'}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            <RotateCcw size={14} />
            <span>Recarregar Módulo / Try Again</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
