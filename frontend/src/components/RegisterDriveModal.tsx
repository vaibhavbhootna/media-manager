import React, { useState, useEffect } from 'react';
import {
  X,
  HardDrive,
  ShieldCheck,
  AlertCircle,
  Folder,
  RefreshCw,
  Check,
  ChevronRight,
  CornerLeftUp,
  FolderSearch,
  CheckCircle2,
  HardDriveDownload
} from 'lucide-react';
import { useMediaStore } from '../store/useMediaStore';
import { registerDrive, browseDirectory, pickFolderNative } from '../services/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowseDirectoryResponse, DirectoryItem } from '../types';

export const RegisterDriveModal: React.FC = () => {
  const { isRegisterDriveOpen, setRegisterDriveOpen } = useMediaStore();
  const [mountPath, setMountPath] = useState('');
  const [driveName, setDriveName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentBrowsePath, setCurrentBrowsePath] = useState<string>('/Volumes');
  const [isPickingNative, setIsPickingNative] = useState(false);

  const queryClient = useQueryClient();

  // Query directory contents for the browser
  const {
    data: browseData,
    isLoading: isBrowsingLoading,
    refetch: refetchBrowser,
  } = useQuery<BrowseDirectoryResponse>({
    queryKey: ['browse-dir', currentBrowsePath],
    queryFn: () => browseDirectory(currentBrowsePath),
    enabled: isRegisterDriveOpen,
  });

  // Reset state when opening
  useEffect(() => {
    if (isRegisterDriveOpen) {
      setCurrentBrowsePath('/Volumes');
      setError(null);
    }
  }, [isRegisterDriveOpen]);

  const cleanInputPath = (raw: string) => {
    let path = raw.trim();
    const quoteChars = new Set(['"', "'", '`', '\\']);
    let changed = true;
    while (changed && path.length > 0) {
      changed = false;
      if (quoteChars.has(path[0])) {
        path = path.slice(1);
        changed = true;
      }
      if (quoteChars.has(path[path.length - 1])) {
        path = path.slice(0, -1);
        changed = true;
      }
    }
    path = path.trim().replace(/\\ /g, ' ');
    while (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path;
  };

  const registerMutation = useMutation({
    mutationFn: () => {
      const cleanPath = cleanInputPath(mountPath);
      return registerDrive(cleanPath, driveName.trim() || undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drives'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      setRegisterDriveOpen(false);
      setMountPath('');
      setDriveName('');
      setError(null);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to register drive');
    },
  });

  const handleSelectPath = (path: string, suggestedName: string) => {
    const clean = cleanInputPath(path);
    setMountPath(clean);
    if (!driveName.trim()) {
      setDriveName(suggestedName);
    }
    setError(null);
  };

  const handleNativePicker = async () => {
    setIsPickingNative(true);
    setError(null);
    try {
      const result = await pickFolderNative();
      if (result.path) {
        const clean = cleanInputPath(result.path);
        setMountPath(clean);
        setCurrentBrowsePath(clean);
        const namePart = clean.split('/').filter(Boolean).pop() || 'External HDD';
        if (!driveName.trim()) {
          setDriveName(namePart);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to open native folder dialog');
    } finally {
      setIsPickingNative(false);
    }
  };

  if (!isRegisterDriveOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = cleanInputPath(mountPath);
    if (!clean) {
      setError('Please select or enter a mount directory for the external HDD.');
      return;
    }
    setError(null);
    registerMutation.mutate();
  };

  const formatCapacity = (bytes?: number) => {
    if (!bytes) return '';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
    return `${gb.toFixed(0)} GB`;
  };

  // Build breadcrumbs
  const pathSegments = currentBrowsePath === '/' ? [''] : currentBrowsePath.split('/').filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-shrink-0 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                Register External Storage Drive
                <span className="text-[10px] font-mono uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full">
                  Fast SSD Indexing
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-normal">
                Browse mounted volumes or folders to assign a cryptographic identity
              </p>
            </div>
          </div>
          <button
            onClick={() => setRegisterDriveOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Location Explorer Section */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden">
            {/* Top Toolbar: Quick Locations & Native Finder Button */}
            <div className="p-3 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {browseData?.quickLocations?.map((loc) => (
                  <button
                    key={loc.path}
                    type="button"
                    onClick={() => setCurrentBrowsePath(loc.path)}
                    className={`text-[11px] px-2.5 py-1 rounded-md transition-all ${
                      currentBrowsePath === loc.path
                        ? 'bg-blue-600 text-white font-medium shadow-sm'
                        : 'bg-slate-800/70 text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {loc.name}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleNativePicker}
                disabled={isPickingNative}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 border border-slate-700 transition-all cursor-pointer"
                title="Open macOS Finder folder chooser dialog"
              >
                <FolderSearch className={`w-3.5 h-3.5 ${isPickingNative ? 'animate-spin' : ''}`} />
                <span>{isPickingNative ? 'Selecting in Finder...' : 'Choose in Finder'}</span>
              </button>
            </div>

            {/* Breadcrumb Navigation Bar */}
            <div className="px-3 py-2 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-1 truncate text-slate-400">
                <button
                  type="button"
                  onClick={() => setCurrentBrowsePath('/')}
                  className="hover:text-white transition-colors"
                >
                  /
                </button>
                {pathSegments.map((segment, index) => {
                  const target = '/' + pathSegments.slice(0, index + 1).join('/');
                  const isLast = index === pathSegments.length - 1;
                  return (
                    <React.Fragment key={target}>
                      <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
                      <button
                        type="button"
                        onClick={() => setCurrentBrowsePath(target)}
                        className={`truncate hover:text-white transition-colors ${
                          isLast ? 'text-blue-400 font-semibold' : 'text-slate-300'
                        }`}
                      >
                        {segment}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {browseData?.parentPath && (
                  <button
                    type="button"
                    onClick={() => setCurrentBrowsePath(browseData.parentPath!)}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                    title="Up one level"
                  >
                    <CornerLeftUp className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => refetchBrowser()}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                  title="Refresh folder"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isBrowsingLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Interactive Directory Items List */}
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/60 p-1">
              {isBrowsingLoading ? (
                <div className="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                  <span>Scanning filesystem directories...</span>
                </div>
              ) : !browseData?.items || browseData.items.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 italic">
                  No subdirectories found in this location
                </div>
              ) : (
                browseData.items.map((item: DirectoryItem) => {
                  const isSelected = cleanInputPath(mountPath) === item.path;
                  return (
                    <div
                      key={item.path}
                      className={`p-2.5 rounded-lg flex items-center justify-between gap-3 transition-colors ${
                        isSelected
                          ? 'bg-blue-600/15 border border-blue-500/30'
                          : 'hover:bg-slate-900/80'
                      }`}
                    >
                      {/* Name & Attributes */}
                      <button
                        type="button"
                        onClick={() => setCurrentBrowsePath(item.path)}
                        className="flex items-center gap-2.5 min-w-0 text-left flex-1 group cursor-pointer"
                        title="Click to explore inside this folder"
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            item.isVolume
                              ? 'bg-sky-500/15 text-sky-400'
                              : 'bg-slate-800 text-amber-400'
                          }`}
                        >
                          {item.isVolume ? (
                            <HardDrive className="w-4 h-4" />
                          ) : (
                            <Folder className="w-4 h-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-slate-200 group-hover:text-white truncate block">
                            {item.name}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                            {item.isVolume && item.availableCapacity ? (
                              <span>
                                {formatCapacity(item.availableCapacity)} free /{' '}
                                {formatCapacity(item.totalCapacity)}
                              </span>
                            ) : (
                              <span className="truncate">{item.path}</span>
                            )}
                            {item.hasMediaToken && (
                              <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                                Tokenized
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Folder Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSelectPath(item.path, item.name)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-all ${
                            isSelected
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white'
                          }`}
                        >
                          {isSelected ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Selected</span>
                            </>
                          ) : (
                            <>
                              <HardDriveDownload className="w-3 h-3 text-sky-400" />
                              <span>Select</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setCurrentBrowsePath(item.path)}
                          className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                          title="Open folder"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Current Folder Selection Shortcut */}
            <div className="p-2.5 bg-slate-900/60 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 truncate max-w-xs">
                Current Folder: <code className="text-slate-200">{currentBrowsePath}</code>
              </span>
              <button
                type="button"
                onClick={() => {
                  const namePart = currentBrowsePath.split('/').filter(Boolean).pop() || 'External HDD';
                  handleSelectPath(currentBrowsePath, namePart);
                }}
                className="text-xs text-sky-400 hover:text-sky-300 font-medium transition-colors"
              >
                Use this current directory
              </button>
            </div>
          </div>

          {/* Chosen Mount Path Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Selected Mount Path / Volume Directory
              </label>
              <span className="text-[10px] text-slate-400 font-mono">Full POSIX Path</span>
            </div>
            <input
              type="text"
              value={mountPath}
              onChange={(e) => setMountPath(e.target.value)}
              placeholder="Select from above or type e.g. /Volumes/My Passport"
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none font-mono"
              required
            />
          </div>

          {/* Drive Label */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Drive Label (Friendly Name)
            </label>
            <input
              type="text"
              value={driveName}
              onChange={(e) => setDriveName(e.target.value)}
              placeholder="e.g. Vaibhav-2TB or Main Backup HDD"
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          {/* Storage Philosophy Notice */}
          <div className="bg-slate-950/80 rounded-lg p-3 border border-slate-800/80 flex items-start gap-2.5 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-300">Data Safety Guarantee:</span>
              <p className="text-[11px] mt-0.5 leading-relaxed">
                Media Manager will write a small <code className="text-blue-400">.media-manager/drive.json</code> token
                to identify the drive. Your original photos and videos remain untouched in standard folders.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setRegisterDriveOpen(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={registerMutation.isPending || !mountPath}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {registerMutation.isPending ? 'Registering...' : 'Register Drive'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
