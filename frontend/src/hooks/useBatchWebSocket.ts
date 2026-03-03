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
    const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const connect = useCallback(() => {
        if (!batchId) return;

        // Get the auth token (assumes it's stored in localStorage)
        const token = localStorage.getItem('token');

        // Build WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Use the environment API URL or default to localhost
        const host = import.meta.env.VITE_API_URL
            ? import.meta.env.VITE_API_URL.replace(/^https?:\/\//, '')
            : 'localhost:8080';

        const wsUrl = `${protocol}//${host}/api/ws/batches/${batchId}?token=${token}`;

        console.log(`[WebSocket] Connecting to ${wsUrl}...`);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log(`[WebSocket] Connected for batch ${batchId}`);
            setStatus('processing');
        };

        ws.onmessage = (event) => {
            try {
                const message: WebSocketMessage = JSON.parse(event.data);
                console.log('[WebSocket] Message received:', message);

                switch (message.type) {
                    case 'progress':
                        const { processed, total } = message.payload;
                        setProgress({
                            processed,
                            total,
                            percentage: total > 0 ? (processed / total) * 100 : 0,
                        });
                        break;
                    case 'completed':
                        setStatus('completed');
                        // Wait slightly before closing to ensure UI catches up
                        setTimeout(() => ws.close(), 1000);
                        break;
                    case 'error':
                        setStatus('error');
                        setErrorMessage(message.payload);
                        ws.close();
                        break;
                }
            } catch (err) {
                console.error('[WebSocket] Error parsing message:', err);
            }
        };

        ws.onerror = (error) => {
            console.error('[WebSocket] Connection error:', error);
            setStatus('error');
            setErrorMessage('WebSocket connection failed');
        };

        ws.onclose = () => {
            console.log(`[WebSocket] Disconnected for batch ${batchId}`);
            if (status === 'processing') {
                // Handle unexpected disconnects during processing if needed
            }
        };

        return ws;
    }, [batchId]);

    useEffect(() => {
        let ws: WebSocket | undefined;

        if (batchId && status === 'idle') {
            ws = connect();
        }

        return () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close();
            }
        };
    }, [batchId, connect, status]);

    // Reset function to clear state for new batches
    const reset = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
        }
        setProgress(null);
        setStatus('idle');
        setErrorMessage(null);
        wsRef.current = null;
    }, []);

    return { progress, status, errorMessage, reset };
};
