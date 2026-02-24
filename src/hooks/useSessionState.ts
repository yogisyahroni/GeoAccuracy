import { useState, useCallback } from 'react';

export function useSessionState<T>(key: string, initialValue: T): [T, (val: T | ((prev: T) => T)) => void] {
    const [state, setState] = useState<T>(() => {
        try {
            const saved = sessionStorage.getItem(key);
            if (saved) return JSON.parse(saved);
        } catch (e) {
            console.error('Failed to parse sessionStorage', e);
        }
        return initialValue;
    });

    const setMergedState = useCallback((val: T | ((prev: T) => T)) => {
        setState(prev => {
            const nextVal = typeof val === 'function' ? (val as any)(prev) : val;
            try {
                sessionStorage.setItem(key, JSON.stringify(nextVal));
            } catch (e) {
                console.error('Failed to save to sessionStorage', e);
            }
            return nextVal;
        });
    }, [key]);

    return [state, setMergedState];
}
