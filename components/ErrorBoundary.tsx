
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends (Component as any) {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || String(this.state.error);
      const isQuotaError = errorMessage.toLowerCase().includes('quota') || 
                           errorMessage.toLowerCase().includes('resource-exhausted');

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 font-sans">
          <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl max-w-xs w-full border border-red-50 text-center">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={40} className={isQuotaError ? "text-amber-500" : "text-red-500"} />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              {isQuotaError ? 'Daily Limit Reached' : 'Something went wrong'}
            </h2>
            
            <p className="text-gray-500 text-sm mb-8 leading-relaxed">
              {isQuotaError 
                ? "We've hit our Firestore free tier limit for today. The app will be back online tomorrow once the quota resets."
                : "An unexpected error occurred. We've been notified and are looking into it."}
            </p>

            <button 
              onClick={this.handleReset}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} />
              <span>Try Again</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
