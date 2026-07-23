import { Component } from 'react';

/** Shows a recoverable error card instead of a silently dead/white screen. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 bg-dark-bg text-white flex items-center justify-center p-6">
        <div className="bg-dark-card rounded-xl p-6 max-w-sm text-center">
          <p className="text-lg font-semibold mb-2">Something went wrong</p>
          <p className="text-xs text-red-400 mb-5 break-words">
            {String(this.state.error?.message ?? this.state.error)}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold"
          >
            Restart App
          </button>
        </div>
      </div>
    );
  }
}
