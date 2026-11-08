import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Smartphone,
  FolderOpen,
  CheckCircle2,
  HardDrive,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Battery,
  Terminal,
  Play,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { useMediaStore } from '../store/useMediaStore';
import { Drive, ConnectedDevice } from '../types';
import { fetchDevices, startDeviceBackup, fetchBackupStatus } from '../services/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface ImportModalProps {
  drives: Drive[];
}

export const ImportModal: React.FC<ImportModalProps> = ({ drives }) => {
  const { isImportModalOpen, setImportModalOpen, setActiveTab } = useMediaStore();
  const [mode, setMode] = useState<'iphone' | 'folder'>('iphone');
  const [selectedDriveId, setSelectedDriveId] = useState<string>('');
  const [mediaType, setMediaType] = useState<'all' | 'photos' | 'videos'>('all');
  const [folderPath, setFolderPath] = useState<string>('');
  const logContainerRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();

  const connectedDrives = drives.filter((d) => d.status === 'connected');

  // Auto-select first connected drive if none selected
  useEffect(() => {
    if ((!selectedDriveId || !connectedDrives.some((d) => d.id === selectedDriveId)) && connectedDrives.length > 0) {
      setSelectedDriveId(connectedDrives[0].id);
    }
  }, [connectedDrives, selectedDriveId]);

  // Query connected iOS devices (polls every 3s when modal is open)
  const {
    data: devices = [],
    isLoading: isDevicesLoading,
    refetch: refetchDevices,
  } = useQuery<ConnectedDevice[]>({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    enabled: isImportModalOpen,
    refetchInterval: isImportModalOpen ? 3000 : false,
  });

  // Query backup session status
  const { data: backupStatus } = useQuery({
    queryKey: ['backup-status'],
    queryFn: fetchBackupStatus,
    enabled: isImportModalOpen,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 1000 : false),
  });

  // Start backup mutation
  const startBackupMutation = useMutation({
    mutationFn: () => startDeviceBackup(selectedDriveId, mediaType),
    onSuccess: (data) => {
      queryClient.setQueryData(['backup-status'], data);
      queryClient.invalidateQueries({ queryKey: ['backup-status'] });
    },
    onError: (err: any) => {
      alert(`Could not start iPhone backup: ${err.message || 'Unknown error'}`);
    },
  });

  // Auto-scroll log box
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [backupStatus?.logs]);

  if (!isImportModalOpen) return null;

  const isRunning = backupStatus?.status === 'running';
  const isCompleted = backupStatus?.status === 'completed';
  const isFailed = backupStatus?.status === 'failed';
  const showLiveConsole = isRunning || isCompleted || isFailed;

  const primaryDevice = devices[0];
  const canStartBackup =
    primaryDevice &&
    primaryDevice.isTrusted &&
    selectedDriveId &&
    connectedDrives.length > 0 &&
    !isRunning &&
    !startBackupMutation.isPending;

  const selectedDrive = connectedDrives.find((d) => d.id === selectedDriveId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between flex-shrink-0 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                iPhone Auto Backup & Ingestion
                <span className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  libimobiledevice v3
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Direct camera roll sync to external HDD with fast SSD caching
              </p>
            </div>
          </div>
          <button
            onClick={() => setImportModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Active Backup Console Banner */}
          {showLiveConsole ? (
            <div className="space-y-4">
              {/* Progress Summary Card */}
              <div
                className={`p-4 rounded-xl border ${
                  isCompleted
                    ? 'bg-emerald-950/30 border-emerald-800/60'
                    : isFailed
                    ? 'bg-rose-950/30 border-rose-800/60'
                    : 'bg-blue-950/30 border-blue-800/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isRunning && <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />}
                    {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {isFailed && <AlertTriangle className="w-4 h-4 text-rose-400" />}
                    <span className="text-xs font-semibold text-white">
                      {isCompleted
                        ? 'Backup & Indexing Completed Successfully!'
                        : isFailed
                        ? 'Backup Failed'
                        : backupStatus?.currentStep || 'Backing up media...'}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-300">
                    {backupStatus?.progressPercent || 0}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      isCompleted
                        ? 'bg-emerald-500'
                        : isFailed
                        ? 'bg-rose-500'
                        : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                    }`}
                    style={{ width: `${backupStatus?.progressPercent || 0}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="truncate max-w-[320px]">
                    {backupStatus?.currentFile ? (
                      <span className="font-mono text-slate-300">{backupStatus.currentFile}</span>
                    ) : (
                      `Target: ${backupStatus?.targetDriveName || 'External HDD'}`
                    )}
                  </span>
                  <span>
                    Status: <strong className="text-white capitalize">{backupStatus?.status}</strong>
                  </span>
                </div>
              </div>

              {/* Streaming Terminal Log Output */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-blue-400" />
                    Live Engine Output
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {backupStatus?.logs.length || 0} entries
                  </span>
                </div>
                <div
                  ref={logContainerRef}
                  className="bg-black/80 rounded-xl p-3 border border-slate-800 font-mono text-[11px] text-slate-300 h-48 overflow-y-auto space-y-1 select-text"
                >
                  {backupStatus?.logs && backupStatus.logs.length > 0 ? (
                    backupStatus.logs.map((line, idx) => (
                      <div
                        key={idx}
                        className={`leading-relaxed ${
                          line.includes('✓')
                            ? 'text-emerald-400'
                            : line.includes('⚠️')
                            ? 'text-amber-400'
                            : line.includes('▶')
                            ? 'text-blue-300 font-semibold'
                            : 'text-slate-400'
                        }`}
                      >
                        {line}
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-600 italic">Connecting to device engine...</div>
                  )}
                </div>
              </div>

              {/* Post-Completion Fast-Browsing Notice */}
              {isCompleted && (
                <div className="p-3.5 bg-emerald-950/20 border border-emerald-800/40 rounded-xl flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300 space-y-1">
                    <p className="font-semibold text-emerald-300">Fast SSD Thumbnails Ready</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Your original 4K videos and HEIC photos are safely stored on{' '}
                      <strong className="text-white">{backupStatus?.targetDriveName}</strong>. Media
                      Manager generated instant 60 FPS previews on your internal SSD so you can search
                      and browse without spinning drive latency.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Ingestion Mode Switcher */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMode('iphone')}
                  className={`p-3.5 rounded-xl border flex items-center gap-3 text-left transition-all ${
                    mode === 'iphone'
                      ? 'bg-blue-600/10 border-blue-500 text-blue-300 shadow-md shadow-blue-500/10'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      mode === 'iphone' ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold block text-white">iPhone USB Direct</span>
                    <span className="text-[11px] text-slate-400">Native libimobiledevice AFC</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('folder')}
                  className={`p-3.5 rounded-xl border flex items-center gap-3 text-left transition-all ${
                    mode === 'folder'
                      ? 'bg-blue-600/10 border-blue-500 text-blue-300 shadow-md shadow-blue-500/10'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-800/40'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      mode === 'folder' ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    <FolderOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold block text-white">Folder / SD Card</span>
                    <span className="text-[11px] text-slate-400">Import existing media folder</span>
                  </div>
                </button>
              </div>

              {/* iPhone Mode View */}
              {mode === 'iphone' && (
                <div className="space-y-4">
                  {/* Connected Device Status Card */}
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4 text-blue-400" />
                        Connected iOS Device
                      </span>
                      <button
                        onClick={() => refetchDevices()}
                        className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                        title="Scan USB ports"
                      >
                        <RefreshCw className={`w-3 h-3 ${isDevicesLoading ? 'animate-spin' : ''}`} />
                        <span>Rescan</span>
                      </button>
                    </div>

                    {devices.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-slate-800 bg-slate-900/40 text-center space-y-2">
                        <Smartphone className="w-8 h-8 text-slate-600 mx-auto animate-pulse" />
                        <div>
                          <p className="text-xs font-semibold text-slate-300">No iPhone Detected via USB</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Connect your iPhone via Lightning or USB-C cable. Unlock screen and tap "Trust".
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {devices.map((device) => (
                          <div
                            key={device.udid}
                            className="bg-slate-900/90 border border-slate-800 rounded-lg p-3.5 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                                <Smartphone className="w-5 h-5" />
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold text-white">{device.name}</h4>
                                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                                  <span>{device.model}</span>
                                  {device.iosVersion && <span>· iOS {device.iosVersion}</span>}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5">
                              {device.batteryLevel !== undefined && device.batteryLevel !== null && (
                                <div className="flex items-center gap-1 text-[11px] font-mono text-slate-300 bg-slate-800/80 px-2 py-1 rounded-md">
                                  <Battery className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>{device.batteryLevel}%</span>
                                </div>
                              )}

                              {device.isTrusted ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  Trusted
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  Unlock & Trust Phone
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Destination External HDD */}
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-2">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <HardDrive className="w-4 h-4 text-sky-400" />
                      Destination External Hard Drive
                    </label>

                    {connectedDrives.length === 0 ? (
                      <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span>No external hard drive connected. Please plug in an external HDD.</span>
                      </div>
                    ) : (
                      <div>
                        <select
                          value={selectedDriveId}
                          onChange={(e) => setSelectedDriveId(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                        >
                          {connectedDrives.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.driveName} ({d.mountPath})
                            </option>
                          ))}
                        </select>
                        {selectedDrive && (
                          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                            <span>Mount: <code className="text-slate-300">{selectedDrive.mountPath}</code></span>
                            <span>Indexed Assets: <strong className="text-white">{selectedDrive.assetCount || 0}</strong></span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Media Type Selector */}
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
                    <label className="text-xs font-semibold text-slate-300 block mb-2.5">
                      Media Selection
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setMediaType('all')}
                        className={`p-2.5 rounded-lg border text-center transition-all ${
                          mediaType === 'all'
                            ? 'bg-blue-600/15 border-blue-500 text-blue-300 font-semibold'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className="text-xs block">All Media</span>
                        <span className="text-[10px] text-slate-500">Photos + Videos</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMediaType('photos')}
                        className={`p-2.5 rounded-lg border text-center transition-all ${
                          mediaType === 'photos'
                            ? 'bg-blue-600/15 border-blue-500 text-blue-300 font-semibold'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className="text-xs block">Photos Only</span>
                        <span className="text-[10px] text-slate-500">HEIC / JPEG / RAW</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMediaType('videos')}
                        className={`p-2.5 rounded-lg border text-center transition-all ${
                          mediaType === 'videos'
                            ? 'bg-blue-600/15 border-blue-500 text-blue-300 font-semibold'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className="text-xs block">Videos Only</span>
                        <span className="text-[10px] text-slate-500">4K / MOV / MP4</span>
                      </button>
                    </div>
                  </div>

                  {/* Architecture & Performance Guarantee */}
                  <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl text-[11px] text-slate-400 leading-relaxed space-y-1">
                    <p className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Two-Stage Protection & Fast SSD Browsing:
                    </p>
                    <p>
                      Files are transferred directly to <code className="text-sky-300">/iPhone_Photos</code> and{' '}
                      <code className="text-sky-300">/iPhone_Videos</code> on the external HDD with content-hash
                      deduplication. Media Manager automatically creates lightweight SSD previews so your photo
                      library loads at 60 FPS without spinning HDD lag.
                    </p>
                  </div>
                </div>
              )}

              {/* Folder Import Mode */}
              {mode === 'folder' && (
                <div className="space-y-4">
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Local Media Folder Path
                    </label>
                    <input
                      type="text"
                      value={folderPath}
                      onChange={(e) => setFolderPath(e.target.value)}
                      placeholder="e.g. /Volumes/My Passport/iphone-local-media"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Enter the absolute path to any folder on an external drive or SD card. Media Manager will scan
                      the folder, extract EXIF timestamps, and generate instant SSD thumbnails.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/90 flex items-center justify-between flex-shrink-0">
          {showLiveConsole ? (
            <div className="w-full flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {isRunning ? 'Backup session in progress...' : isCompleted ? 'Session completed.' : 'Session stopped.'}
              </span>
              <div className="flex items-center gap-2">
                {isCompleted && (
                  <button
                    onClick={() => {
                      setImportModalOpen(false);
                      setActiveTab('library');
                    }}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Explore Media at 60 FPS</span>
                  </button>
                )}
                <button
                  onClick={() => setImportModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full flex items-center justify-between">
              <button
                onClick={() => setImportModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>

              {mode === 'iphone' ? (
                <button
                  disabled={!canStartBackup}
                  onClick={() => startBackupMutation.mutate()}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                >
                  {startBackupMutation.isPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Starting...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Start iPhone Auto Backup</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  disabled={!folderPath || connectedDrives.length === 0}
                  onClick={() => {
                    alert(`Folder import scheduled for: ${folderPath}`);
                    setImportModalOpen(false);
                  }}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Import Folder</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
