import { useState, useEffect, useCallback, useRef } from 'react';

export interface WebSocketMessage {
    batch_id: string;
    type: 'progress' | 'completed' | 'error' | 'auth_ok';
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
    const wsRef = useRef<WebSocket | null>(null);

    const connect = useCallback(() => {
        if (!batchId) return;

        const token = localStorage.getItem('geoaccuracy_token');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = (import.meta as any).env?.VITE_API_URL
            ? (import.meta as any).env.VITE_API_URL.replace(/^https?:\/\//, '')
            : 'localhost:8080';

        // FIX BUG-11: Token is NO LONGER included in the URL query string.
        // Previously: /api/ws/batches/:id?token=<jwt>
        // The JWT appeared in server access logs (Render logs), browser history,
        // DevTools Network tab, and any proxy between frontend and backend.
        //
        // New approach: First-message authentication.
        // 1. Connect to the clean URL (no token).
        // 2. On onopen, send {"type":"auth","token":"<jwt>"} as the first WebSocket frame.
        // 3. Backend validates synchronously within a 10-second deadline.
        // 4. Backend replies with {"type":"auth_ok"} → we start receiving progress events.
        // The JWT is now transmitted only inside an encrypted WebSocket frame body.
        const wsUrl = `${protocol}//${host}/api/ws/batches/${batchId}`;
        console.log(`[WebSocket] Connecting to ${wsUrl}...`);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log(`[WebSocket] Connected for batch ${batchId}, sending auth...`);
            // Immediately send auth frame — server expects this within 10 seconds.
            ws.send(JSON.stringify({ type: 'auth', token }));
            // Keep wsStatus 'idle' until we receive auth_ok to avoid premature UI updates.
        };

        ws.onmessage = (event) => {
            try {
                const message: WebSocketMessage = JSON.parse(event.data);
                switch (message.type) {
                    case 'auth_ok':
                        // Backend confirmed auth — now we're live and will receive progress.
                        console.log(`[WebSocket] Auth OK for batch ${batchId}`);
                        setWsStatus('processing');
                        break;
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
                        // FIX BUG-07: Use wsRef.current to avoid stale closure.
                        setTimeout(() => wsRef.current?.close(), 500);
                        break;
                    case 'error':
                        setWsStatus('error');
                        setErrorMessage(typeof message.payload === 'string' ? message.payload : 'Processing error');
                        // FIX BUG-07: Use wsRef.current to avoid stale closure.
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

        ws.onclose = (event) => {
            console.log(`[WebSocket] Disconnected for batch ${batchId} (code: ${event.code})`);
            // If server closed with policy violation it's an auth failure.
            if (event.code === 1008) {
                setWsStatus('error');
                setErrorMessage('WebSocket authentication failed. Please log in again.');
            }
        };

        return ws;
    }, [batchId]);

    useEffect(() => {
        // FIX BUG-08: Guard with wsRef.current === null (not wsStatus === 'idle')
        // to prevent reconnect loops on every status transition.
        if (batchId && wsRef.current === null) {
            connect();
        }
        return () => {
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
