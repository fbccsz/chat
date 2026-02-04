import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#efeae2] p-6">
          <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center space-y-6">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10 text-red-500" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-gray-900">Ops! Algo deu errado</h2>
              <p className="text-gray-500 text-sm">
                Encontramos um problema inesperado. Por favor, tente recarregar a pagina.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReload}
                className="w-full flex items-center justify-center gap-2 bg-[#075e54] text-white py-3 px-6 rounded-xl font-bold hover:bg-[#128c7e] transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
                Recarregar Pagina
              </button>

              <button
                onClick={this.handleReset}
                className="w-full text-gray-500 py-2 text-sm font-medium hover:text-gray-700 transition-colors"
              >
                Tentar novamente
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-left mt-4 p-4 bg-gray-50 rounded-xl text-xs">
                <summary className="cursor-pointer font-medium text-gray-700 mb-2">
                  Detalhes do erro (dev only)
                </summary>
                <pre className="overflow-auto text-red-600 whitespace-pre-wrap">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
