import { useState } from 'react';

// A simple wrapper around useState. We removed localStorage persistence 
// because it causes issues with large files and cross-device synchronization 
// where users expect to fetch the real-time latest data from the backend.
export function useSessionState<T>(key: string, initialValue: T): [T, (val: T | ((prev: T) => T)) => void] {
    const [state, setState] = useState<T>(initialValue);

    // Provide the same signature as before but without localStorage side effects
    const setMergedState = (val: T | ((prev: T) => T)) => {
        setState(val);
    };

    return [state, setMergedState];
}
