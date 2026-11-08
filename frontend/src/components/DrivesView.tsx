import React from 'react';
import {
  HardDrive,
  RefreshCw,
  Plus,
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Trash2
} from 'lucide-react';
import { Drive } from '../types';
import { useMediaStore } from '../store/useMediaStore';
import { deleteDrive } from '../services/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface DrivesViewProps {
  drives: Drive[];
}

export const DrivesView: React.FC<DrivesViewProps> = ({ drives }) => {
  const {
    setRegisterDriveOpen,
    setSelectedRebuildDrive,
    setRebuildModalOpen,
    activeImport,
  } = useMediaStore();

  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (driveId: string) => deleteDrive(driveId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drives'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
    },
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1000) {
      return `${(gb / 1024).toFixed(1)} TB`;
    }
    return `${gb.toFixed(0)} GB`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <HardDrive className="w-6 h-6 text-sky-400" />
            Storage Drive Management
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Original media files remain in ordinary folders on your external HDDs. Media Manager registers
            cryptographic drive tokens and indexes catalog metadata for lightning-fast offline browsing.
          </p>
        </div>

        <button
          onClick={() => setRegisterDriveOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-md shadow-blue-500/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Register External HDD</span>
        </button>
      </div>

      {/* Drives Grid */}
      {drives.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
          <HardDrive className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">No external drives registered yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Connect an external HDD/SSD or choose any local media directory to register it into your library.
          </p>
          <button
            onClick={() => setRegisterDriveOpen(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Register First Drive</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {drives.map((drive) => {
            const isConnected = drive.status === 'connected';
            const isConflict = drive.status === 'conflict_detected';
            const isRebuilding = drive.status === 'rebuilding';
            const usedBytes = drive.totalCapacity - drive.availableCapacity;
            const usedPercent = drive.totalCapacity > 0
              ? Math.min(100, Math.max(0, (usedBytes / drive.totalCapacity) * 100))
              : 0;

            return (
              <div
                key={drive.id}
                className="bg-slate-900/90 rounded-xl border border-slate-800/90 p-5 shadow-lg flex flex-col justify-between hover:border-slate-700/80 transition-all"
              >
                <div>
                  {/* Title & Status */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                        <HardDrive className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                          {drive.driveName}
                        </h4>
                        <p className="text-[11px] font-mono text-slate-400 truncate max-w-[200px]">
                          UUID: {drive.id}
                        </p>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div>
                      {isConnected && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Connected
                        </span>
                      )}
                      {drive.status === 'disconnected' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <CloudOff className="w-3.5 h-3.5" />
                          Disconnected
                        </span>
                      )}
                      {isConflict && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Identity Conflict
                        </span>
                      )}
                      {isRebuilding && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Rebuilding
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Conflict Notice */}
                  {isConflict && (
                    <div className="mb-3 p-3 bg-rose-950/40 border border-rose-800/80 rounded-lg text-xs text-rose-300 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        Cloned Drive Detected
                      </p>
                      <p className="text-[11px] text-rose-300/80">
                        Two simultaneously mounted volumes contain this exact drive token. Writes are paused to prevent metadata corruption.
                      </p>
                    </div>
                  )}

                  {/* Mount Path & Filesystem */}
                  <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800/60 mb-4 text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Current Mount:</span>
                      <span className="text-slate-200 font-mono text-[11px] truncate max-w-[240px]">
                        {drive.mountPath || 'Offline (Not Mounted)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Filesystem:</span>
                      <span className="text-slate-200 font-mono text-[11px]">
                        {drive.filesystemType || 'APFS / ExFAT'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Indexed Assets:</span>
                      <span className="text-slate-100 font-bold font-mono">
                        {drive.assetCount || 0} files
                      </span>
                    </div>
                  </div>

                  {/* Capacity Bar */}
                  {drive.totalCapacity > 0 && (
                    <div className="mb-4">
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1.5">
                        <span>Used: {formatBytes(usedBytes)} ({usedPercent.toFixed(1)}%)</span>
                        <span>Total: {formatBytes(drive.totalCapacity)}</span>
                      </div>
                      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                          style={{ width: `${usedPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Live Rebuilding Progress Box */}
                  {isRebuilding && activeImport && activeImport.sessionId === drive.id && (
                    <div className="mb-4 bg-slate-950/80 p-3 rounded-lg border border-blue-500/30 space-y-2 animate-in fade-in">
                      <div className="flex justify-between text-xs">
                        <span className="text-blue-400 font-semibold flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Indexing Media...
                        </span>
                        <span className="text-white font-mono text-[11px]">
                          {activeImport.completedFiles} / {activeImport.totalFiles} ({activeImport.percent}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
                          style={{ width: `${activeImport.percent}%` }}
                        />
                      </div>
                      {activeImport.currentFile && (
                        <p className="text-[10px] font-mono text-slate-400 truncate">
                          {activeImport.currentFile}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      if (confirm(`Forget and unregister "${drive.driveName}"? Original files on the drive will remain untouched.`)) {
                        deleteMutation.mutate(drive.id);
                      }
                    }}
                    className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer"
                    title="Forget Drive (Unregister from local catalog)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Forget</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedRebuildDrive(drive);
                      setRebuildModalOpen(true);
                    }}
                    disabled={!isConnected || isRebuilding}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                      isConnected && !isRebuilding
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white cursor-pointer border border-slate-700'
                        : 'bg-slate-800/40 text-slate-600 border border-slate-800 cursor-not-allowed'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRebuilding ? 'animate-spin' : ''}`} />
                    <span>{isRebuilding && activeImport?.sessionId === drive.id ? `Rebuilding (${activeImport.percent}%)` : 'Rebuild Catalog'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
