import { useState, useCallback } from 'react';

/**
 * A pure in-memory state hook (no localStorage).
 * Data is fetched from the PostgreSQL backend on every mount,
 * ensuring cross-device consistency without browser storage issues.
 *
 * The `key` parameter is kept for API compatibility but is not used.
 */
export function useSessionState<T>(
    _key: string,
    initialValue: T,
): [T, (val: T | ((prev: T) => T)) => void] {
    const [state, setState] = useState<T>(initialValue);

    // useCallback with [] ensures the setter reference is STABLE across renders.
    // Without this, any component that includes this setter in a useEffect dependency
    // array would trigger an infinite re-render loop.
    const setStableState = useCallback((val: T | ((prev: T) => T)) => {
        setState(val);
    }, []);

    return [state, setStableState];
}
