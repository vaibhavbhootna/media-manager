import { useMediaStore } from '../store/useMediaStore';
import { QueryClient } from '@tanstack/react-query';

export function initializeWebSocket(queryClient: QueryClient) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  let ws: WebSocket | null = null;
  let reconnectTimeout: number | null = null;

  function connect() {
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected to MediaManager backend');
      };

      ws.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          const { event: eventName, data } = envelope;

          if (eventName === 'catalog.rebuild.started') {
            useMediaStore.getState().setActiveImport({
              sessionId: data.driveId,
              status: 'running',
              currentFile: 'Scanning media files on disk...',
              completedFiles: 0,
              totalFiles: 0,
              bytesTransferred: 0,
              totalBytes: 0,
              percent: 0,
            });
            useMediaStore.getState().setRebuildError(null);
            queryClient.invalidateQueries({ queryKey: ['drives'] });
          } else if (eventName === 'catalog.rebuild.progress') {
            useMediaStore.getState().setActiveImport({
              sessionId: data.driveId,
              status: 'running',
              currentFile: data.currentFile,
              completedFiles: data.current,
              totalFiles: data.total,
              bytesTransferred: 0,
              totalBytes: 0,
              percent: data.percent,
            });
          } else if (eventName === 'catalog.rebuild.completed') {
            useMediaStore.getState().setActiveImport(null);
            useMediaStore.getState().setRebuildError(null);
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['drives'] });
            queryClient.invalidateQueries({ queryKey: ['health'] });
          } else if (eventName === 'catalog.rebuild.failed') {
            useMediaStore.getState().setActiveImport(null);
            useMediaStore.getState().setRebuildError(data.error || 'Failed to scan drive. Check macOS permissions.');
            queryClient.invalidateQueries({ queryKey: ['drives'] });
          } else if (eventName.startsWith('drive.')) {
            queryClient.invalidateQueries({ queryKey: ['drives'] });
            queryClient.invalidateQueries({ queryKey: ['assets'] });
            queryClient.invalidateQueries({ queryKey: ['health'] });
          } else if (eventName.startsWith('iphone.backup.')) {
            queryClient.invalidateQueries({ queryKey: ['backup-status'] });
            queryClient.invalidateQueries({ queryKey: ['devices'] });
            if (eventName === 'iphone.backup.completed') {
              queryClient.invalidateQueries({ queryKey: ['assets'] });
              queryClient.invalidateQueries({ queryKey: ['drives'] });
              queryClient.invalidateQueries({ queryKey: ['health'] });
            }
          }
        } catch (e) {
          console.error('[WebSocket] Failed to parse message', e);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] Connection closed. Reconnecting in 3s...');
        reconnectTimeout = window.setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('[WebSocket] Error', err);
        ws?.close();
      };
    } catch (e) {
      console.error('[WebSocket] Connection init failed', e);
      reconnectTimeout = window.setTimeout(connect, 3000);
    }
  }

  connect();

  return () => {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    ws?.close();
  };
}

