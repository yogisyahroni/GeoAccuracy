import { useState, useCallback } from 'react';

export function useSessionState<T>(key: string, initialValue: T): [T, (val: T | ((prev: T) => T)) => void] {
    const [state, setState] = useState<T>(() => {
        try {
            const saved = localStorage.getItem(key);
            if (saved) return JSON.parse(saved);
        } catch (e) {
            console.error('Failed to parse localStorage', e);
        }
        return initialValue;
    });

    const setMergedState = useCallback((val: T | ((prev: T) => T)) => {
        setState(prev => {
            const nextVal = typeof val === 'function' ? (val as any)(prev) : val;
            try {
                localStorage.setItem(key, JSON.stringify(nextVal));

            } catch (e) {
                console.error('Failed to save to localStorage', e);
            }
            return nextVal;
        });
    }, [key]);

    return [state, setMergedState];
}
