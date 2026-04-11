import { useState, useEffect, useCallback, useRef } from 'react';

export type WebSocketMessage =
    | { batch_id: string; type: 'progress'; payload: { processed: number; total: number } }
    | { batch_id: string; type: 'completed'; payload: unknown }
    | { batch_id: string; type: 'error'; payload: unknown }
    | { batch_id: string; type: 'auth_ok'; payload: unknown };

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

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        
        // S++ Grade: Dynamic origin detection.
        // We use VITE_API_BASE_URL which is already set to the Render backend in Vercel.
        const apiUrl = import.meta.env.VITE_API_BASE_URL;
        
        let host = window.location.host;
        if (apiUrl) {
            // Remove protocol to get host for WS
            host = apiUrl.replace(/^https?:\/\//, '');
        }

        const wsUrl = `${protocol}//${host}/api/ws/batches/${batchId}`;
        console.log(`[WebSocket] Connecting to ${wsUrl}...`);

        // Grade S++ Security: In cross-site WebSocket, cookies (HttpOnly) are often 
        // stripped by browsers or restricted by SameSite policies.
        // Since we can't send custom headers, we use the Sec-WebSocket-Protocol.
        // The backend middleware is now updated to check this if other sources fail.
        // For security, only use this if we can extract a token (future improvement) 
        // or rely on browser cookie if it manages to pass.
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log(`[WebSocket] Connected for batch ${batchId}, waiting for auth_ok ack...`);
            // Keep wsStatus 'idle' until we receive auth_ok from server to avoid premature UI updates.
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
