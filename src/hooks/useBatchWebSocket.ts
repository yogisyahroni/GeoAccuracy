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
                        setTimeout(() => ws.close(), 500);
                        break;
                    case 'error':
                        setWsStatus('error');
                        setErrorMessage(typeof message.payload === 'string' ? message.payload : 'Processing error');
                        ws.close();
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
        if (batchId && wsStatus === 'idle') {
            connect();
        }
        return () => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close();
            }
        };
    }, [batchId, wsStatus, connect]);

    const reset = useCallback(() => {
        if (wsRef.current) wsRef.current.close();
        setProgress(null);
        setWsStatus('idle');
        setErrorMessage(null);
        wsRef.current = null;
    }, []);

    return { progress, wsStatus, errorMessage, reset };
};
