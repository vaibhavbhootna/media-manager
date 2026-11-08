import React from 'react';
import { X, RefreshCw, HardDrive, AlertTriangle } from 'lucide-react';
import { useMediaStore } from '../store/useMediaStore';
import { scanDrive } from '../services/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export const RebuildModal: React.FC = () => {
  const {
    isRebuildModalOpen,
    setRebuildModalOpen,
    selectedRebuildDrive,
    activeImport,
    rebuildError,
    setRebuildError,
  } = useMediaStore();

  const queryClient = useQueryClient();

  const scanMutation = useMutation({
    mutationFn: (driveId: string) => scanDrive(driveId),
    onError: (err: any) => {
      setRebuildError(err?.response?.data?.error || err?.message || 'Failed to start rebuild');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drives'] });
    },
  });

  if (!isRebuildModalOpen || !selectedRebuildDrive) return null;

  const isScanning = (!!activeImport && activeImport.sessionId === selectedRebuildDrive.id) || scanMutation.isPending;

  const handleStartRebuild = () => {
    setRebuildError(null);
    scanMutation.mutate(selectedRebuildDrive.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white tracking-tight">
                Rebuild Media Catalog
              </h3>
              <p className="text-xs text-slate-400 font-normal">
                Scan {selectedRebuildDrive.driveName} and generate local metadata index
              </p>
            </div>
          </div>
          <button
            onClick={() => setRebuildModalOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Target HDD:</span>
              <span className="text-white font-semibold flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                {selectedRebuildDrive.driveName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Mount Path:</span>
              <span className="text-slate-300 font-mono text-[11px] truncate max-w-[240px]">
                {selectedRebuildDrive.mountPath}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Rebuilding scans all photo and video files on this drive, extracts EXIF and GPS headers,
            and generates fast local thumbnails on your Mac. Original files are never modified, moved, or deleted.
          </p>

          {/* Error Banner */}
          {rebuildError && (
            <div className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-3.5 text-xs text-rose-300 space-y-2 animate-in fade-in">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-rose-200">Rebuild Blocked by macOS Permission</p>
                  <p className="text-[11px] text-rose-300/90 leading-relaxed">{rebuildError}</p>
                </div>
              </div>
              <div className="bg-black/30 p-2.5 rounded-lg text-[11px] text-slate-300 space-y-1">
                <p className="font-semibold text-sky-300">How to grant permission:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-slate-400">
                  <li>Open <strong>System Settings &gt; Privacy &amp; Security &gt; Files and Folders</strong></li>
                  <li>Enable <strong>Removable Volumes</strong> for Terminal or Antigravity</li>
                  <li>Or run <code>./scripts/start.sh</code> directly from your native Terminal.app</li>
                </ol>
              </div>
            </div>
          )}

          {/* Progress Section */}
          {isScanning && (
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-blue-500/30 space-y-2 animate-in fade-in">
              <div className="flex justify-between text-xs">
                <span className="text-blue-400 font-semibold flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Indexing in progress...
                </span>
                <span className="text-white font-mono font-medium">
                  {activeImport ? `${activeImport.completedFiles} / ${activeImport.totalFiles} (${activeImport.percent}%)` : 'Initializing...'}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${activeImport?.percent || 0}%` }}
                />
              </div>

              {activeImport?.currentFile && (
                <p className="text-[11px] font-mono text-slate-400 truncate">
                  Processing: {activeImport.currentFile}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              onClick={() => setRebuildModalOpen(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              {isScanning ? 'Close in Background' : 'Cancel'}
            </button>
            {!isScanning && (
              <button
                onClick={handleStartRebuild}
                disabled={scanMutation.isPending}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{scanMutation.isPending ? 'Starting...' : 'Start Rebuild'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
