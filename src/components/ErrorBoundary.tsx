import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error:", error, info.componentStack);
  }

  handleTryAgain = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-gray-900 text-gray-100">
          <div className="text-center max-w-md px-6">
            <div className="text-4xl mb-2">Something went wrong</div>
            <p className="text-gray-400 mb-6 text-sm">
              An unexpected error occurred. You can try again without losing
              your current data.
            </p>
            <div className="flex gap-3 justify-center mb-6">
              <button
                onClick={this.handleTryAgain}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
            <div>
              <button
                onClick={this.toggleDetails}
                className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
              >
                {this.state.showDetails ? "Hide" : "Show"} error details
              </button>
              {this.state.showDetails && this.state.error && (
                <pre className="mt-3 p-3 bg-gray-800 rounded-lg text-left text-xs text-gray-400 font-mono break-all whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {this.state.error.message}
                </pre>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
