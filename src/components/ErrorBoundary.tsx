import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    /** Optional custom fallback UI. If omitted, uses the default error card. */
    fallback?: ReactNode;
    /** Optional label shown on the card so users know which section crashed. */
    sectionLabel?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * FIX BUG-12: ErrorBoundary prevents the "White Screen of Death" in production.
 *
 * React does NOT catch errors in class component lifecycle methods or within
 * event handlers by default. Any uncaught error in a render cycle tears down
 * the entire React tree and shows a blank page. This class-based error boundary
 * wraps critical sections (Dashboard, DataIntegration, charts, tables) so that
 * only the affected section fails gracefully while the rest of the app stays live.
 *
 * Usage:
 *   <ErrorBoundary sectionLabel="Dashboard">
 *     <Dashboard />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // Log to console in all environments for visibility.
        console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            const label = this.props.sectionLabel ?? 'halaman ini';

            return (
                <div
                    className="flex flex-col items-center justify-center min-h-[200px] rounded-xl border p-8 gap-4 text-center"
                    style={{
                        background: 'hsl(var(--destructive) / 0.05)',
                        borderColor: 'hsl(var(--destructive) / 0.3)',
                    }}
                >
                    <AlertTriangle
                        className="w-10 h-10"
                        style={{ color: 'hsl(var(--destructive))' }}
                    />
                    <div className="space-y-1">
                        <p
                            className="text-sm font-semibold"
                            style={{ color: 'hsl(var(--destructive))' }}
                        >
                            Terjadi kesalahan pada {label}
                        </p>
                        <p
                            className="text-xs font-mono max-w-sm"
                            style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                            {this.state.error?.message ?? 'Unknown error'}
                        </p>
                    </div>
                    <button
                        onClick={this.handleReset}
                        className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border transition-all hover:brightness-110 active:scale-[0.98]"
                        style={{
                            color: 'hsl(var(--destructive))',
                            borderColor: 'hsl(var(--destructive) / 0.4)',
                            background: 'hsl(var(--destructive) / 0.08)',
                        }}
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Coba Lagi
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
