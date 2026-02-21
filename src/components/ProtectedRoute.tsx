import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

/**
 * Waits for session hydration before evaluating auth state.
 * Without this guard, a page refresh always redirects to /login because
 * isAuthenticated starts as false before hydrate() runs in useEffect.
 */
const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const isHydrating = useAuthStore((s) => s.isHydrating);
    const location = useLocation();

    // Still restoring session from sessionStorage — render nothing to avoid flash
    if (isHydrating) {
        return null;
    }

    if (!isAuthenticated) {
        return (
            <Navigate
                to="/login"
                state={{ from: location }}
                replace
            />
        );
    }

    return <>{children}</>;
};

export default ProtectedRoute;
