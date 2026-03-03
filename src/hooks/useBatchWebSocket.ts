import { useState, useEffect, useCallback, useRef } from 'react';

export interface WebSocketMessage {
    batch_id: string;
    type: 'progress' | 'completed' | 'error';
    payload: any;
}

export interface BatchProgress {
    processed: number;
    total: number;
    percentage: number;
}

export const useBatchWebSocket = (batchId: string | null) => {
    const [progress, setProgress] = useState<BatchProgress | null>(null);
    const [wsStatus, setWsStatus] = useState<'idle' | 'processing' | 'completed' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    // wsRef holds the active WebSocket so we never capture a stale closure instance.
    const wsRef = useRef<WebSocket | null>(null);

    const connect = useCallback(() => {
        if (!batchId) return;

        const token = localStorage.getItem('geoaccuracy_token');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = (import.meta as any).env?.VITE_API_URL
            ? (import.meta as any).env.VITE_API_URL.replace(/^https?:\/\//, '')
            : 'localhost:8080';

        const wsUrl = `${protocol}//${host}/api/ws/batches/${batchId}?token=${token}`;
        console.log(`[WebSocket] Connecting to ${wsUrl}...`);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log(`[WebSocket] Connected for batch ${batchId}`);
            setWsStatus('processing');
        };

        ws.onmessage = (event) => {
            try {
                const message: WebSocketMessage = JSON.parse(event.data);
                switch (message.type) {
                    case 'progress': {
                        const { processed, total } = message.payload;
                        setProgress({
                            processed,
                            total,
                            percentage: total > 0 ? Math.round((processed / total) * 100) : 0,
                        });
                        break;
                    }
                    case 'completed':
                        setWsStatus('completed');
                        // FIX BUG-07: Use wsRef.current instead of the locally-captured `ws`.
                        // If connect() is ever called again before this fires, `ws` would be a
                        // stale reference pointing to the old, already-replaced WebSocket.
                        setTimeout(() => wsRef.current?.close(), 500);
                        break;
                    case 'error':
                        setWsStatus('error');
                        setErrorMessage(typeof message.payload === 'string' ? message.payload : 'Processing error');
                        // FIX BUG-07: Same — use ref to close the current instance.
                        wsRef.current?.close();
                        break;
                }
            } catch (err) {
                console.error('[WebSocket] Error parsing message:', err);
            }
        };

        ws.onerror = () => {
            console.error('[WebSocket] Connection error');
            setWsStatus('error');
            setErrorMessage('WebSocket connection failed');
        };

        ws.onclose = () => {
            console.log(`[WebSocket] Disconnected for batch ${batchId}`);
        };

        return ws;
    }, [batchId]);

    useEffect(() => {
        // FIX BUG-08: Remove `wsStatus` from the dependency array.
        // The original code had [batchId, wsStatus, connect] which caused this effect
        // to re-evaluate every time wsStatus changed (e.g., idle → processing → completed).
        // Because `connect` is memoised on batchId, the guard `wsStatus === 'idle'` was
        // sufficient to stop reconnects — but having wsStatus as a dep caused spurious
        // evaluations and potential double-connect edge cases on React StrictMode.
        //
        // Solution: track whether we have already connected with a ref so the guard is
        // stable and independent of wsStatus state transitions.
        if (batchId && wsRef.current === null) {
            connect();
        }
        return () => {
            // Cleanup: close the WebSocket when batchId changes or component unmounts.
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [batchId, connect]);

    const reset = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setProgress(null);
        setWsStatus('idle');
        setErrorMessage(null);
    }, []);

    return { progress, wsStatus, errorMessage, reset };
};
