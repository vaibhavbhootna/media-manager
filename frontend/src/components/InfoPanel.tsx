import React, { useState } from 'react';
import {
  X,
  HardDrive,
  Camera,
  MapPin,
  Calendar,
  ExternalLink,
  Heart,
  CloudOff,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useMediaStore } from '../store/useMediaStore';
import { revealInFinder, toggleFavorite } from '../services/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Drive } from '../types';

interface InfoPanelProps {
  drives: Drive[];
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ drives }) => {
  const { selectedAsset, setSelectedAsset, isInspectorOpen, setSearchQuery } = useMediaStore();
  const [revealMsg, setRevealMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const queryClient = useQueryClient();

  const favMutation = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      toggleFavorite(id, isFavorite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      if (selectedAsset) {
        useMediaStore.getState().setSelectedAsset({
          ...selectedAsset,
          isFavorite: !selectedAsset.isFavorite,
        });
      }
    },
  });

  if (!isInspectorOpen || !selectedAsset) return null;

  const drive = drives.find((d) => d.id === selectedAsset.driveId);
  const isDriveConnected = drive ? drive.status === 'connected' : selectedAsset.availabilityStatus === 'available';

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleReveal = async () => {
    setRevealMsg(null);
    try {
      await revealInFinder(selectedAsset.id);
      setRevealMsg({ type: 'success', text: 'Revealed in Finder' });
      setTimeout(() => setRevealMsg(null), 3000);
    } catch (err: any) {
      setRevealMsg({ type: 'error', text: err.message || 'Drive is disconnected' });
      setTimeout(() => setRevealMsg(null), 5000);
    }
  };

  return (
    <aside className="w-80 flex-shrink-0 bg-slate-900/80 backdrop-blur-xl border-l border-slate-800/80 flex flex-col h-full select-none overflow-y-auto">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-800/60 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
          Info Inspector
        </h3>
        <button
          onClick={() => setSelectedAsset(null)}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Large Preview */}
      <div className="p-3.5 border-b border-slate-800/60 bg-slate-950/40">
        <div className="relative rounded-lg overflow-hidden aspect-[4/3] bg-slate-950 border border-slate-800/80 flex items-center justify-center">
          {selectedAsset.previewPath || selectedAsset.thumbnailPath ? (
            <img
              src={`/api/v1/assets/${selectedAsset.id}/preview`}
              alt={selectedAsset.originalFilename}
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="text-xs text-slate-500 font-mono">No Preview</span>
          )}

          {/* Favorite Toggle on Preview */}
          <button
            onClick={() =>
              favMutation.mutate({
                id: selectedAsset.id,
                isFavorite: !selectedAsset.isFavorite,
              })
            }
            className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-md transition-all ${
              selectedAsset.isFavorite
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                : 'bg-black/50 text-slate-300 hover:text-white'
            }`}
          >
            <Heart className={`w-4 h-4 ${selectedAsset.isFavorite ? 'fill-white' : ''}`} />
          </button>
        </div>

        <div className="mt-2.5">
          <h4 className="text-sm font-semibold text-white truncate" title={selectedAsset.originalFilename}>
            {selectedAsset.originalFilename}
          </h4>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            {formatBytes(selectedAsset.fileSize)}
            {selectedAsset.width > 0 && selectedAsset.height > 0 && (
              <span> · {selectedAsset.width} × {selectedAsset.height}</span>
            )}
          </p>
        </div>
      </div>

      {/* Physical HDD Location Card */}
      <div className="p-3.5 border-b border-slate-800/60">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-sky-400" />
            Physical Storage
          </span>
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${
              isDriveConnected
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}
          >
            {isDriveConnected ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Connected</span>
              </>
            ) : (
              <>
                <CloudOff className="w-3 h-3 text-amber-400" />
                <span>Offline</span>
              </>
            )}
          </span>
        </div>

        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-400">Drive Name:</span>
            <span className="text-slate-200 font-semibold">{drive?.driveName || selectedAsset.driveName || 'External HDD'}</span>
          </div>
          {drive?.mountPath && (
            <div className="flex justify-between">
              <span className="text-slate-400">Mount Path:</span>
              <span className="text-slate-300 font-mono text-[11px] truncate max-w-[170px]" title={drive.mountPath}>
                {drive.mountPath}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-400">Relative Path:</span>
            <span className="text-slate-300 font-mono text-[11px] truncate max-w-[170px]" title={selectedAsset.relativePath}>
              {selectedAsset.relativePath}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-slate-800/60">
            <span className="text-slate-400">Browsing Speed:</span>
            <span className="text-emerald-400 font-mono text-[11px]">Instant (Mac SSD Preview)</span>
          </div>
        </div>

        {/* Reveal in Finder Action */}
        <div className="mt-2.5">
          <button
            onClick={handleReveal}
            disabled={!isDriveConnected}
            className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
              isDriveConnected
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/20 cursor-pointer'
                : 'bg-slate-800/50 text-slate-500 border border-slate-800 cursor-not-allowed'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Reveal Original in Finder</span>
          </button>

          {!isDriveConnected && (
            <p className="text-[11px] text-amber-400/90 mt-1.5 flex items-start gap-1">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-400" />
              <span>Connect HDD <strong>{drive?.driveName || 'external drive'}</strong> to access original file.</span>
            </p>
          )}

          {revealMsg && (
            <div
              className={`mt-2 p-2 rounded text-xs flex items-center gap-1.5 ${
                revealMsg.type === 'success'
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                  : 'bg-rose-950/60 text-rose-300 border border-rose-800'
              }`}
            >
              <span>{revealMsg.text}</span>
            </div>
          )}
        </div>
      </div>

      {/* Capture Date & Time */}
      <div className="p-3.5 border-b border-slate-800/60 text-xs">
        <div className="flex items-center gap-2 text-slate-400 mb-1">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>Date & Time</span>
        </div>
        <p className="text-slate-200 font-medium">
          {selectedAsset.dateTaken
            ? new Date(selectedAsset.dateTaken).toLocaleString()
            : 'Unknown'}
        </p>
      </div>

      {/* Camera & EXIF */}
      {(selectedAsset.cameraModel || selectedAsset.iso || selectedAsset.aperture) && (
        <div className="p-3.5 border-b border-slate-800/60 text-xs space-y-2">
          <div className="flex items-center gap-2 text-slate-400">
            <Camera className="w-3.5 h-3.5 text-slate-400" />
            <span>Camera Details</span>
          </div>

          {selectedAsset.cameraModel && (
            <div>
              <p className="text-slate-200 font-semibold">{selectedAsset.cameraModel}</p>
              {selectedAsset.lensModel && (
                <p className="text-[11px] text-slate-400">{selectedAsset.lensModel}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 bg-slate-950/40 p-2 rounded border border-slate-800/60 font-mono text-[11px]">
            {selectedAsset.iso && (
              <div>
                <span className="text-slate-400">ISO:</span> {selectedAsset.iso}
              </div>
            )}
            {selectedAsset.focalLength && (
              <div>
                <span className="text-slate-400">Focal:</span> {selectedAsset.focalLength}mm
              </div>
            )}
            {selectedAsset.aperture && (
              <div>
                <span className="text-slate-400">Aperture:</span> f/{selectedAsset.aperture}
              </div>
            )}
            {selectedAsset.shutterSpeed && (
              <div>
                <span className="text-slate-400">Speed:</span> {selectedAsset.shutterSpeed}
              </div>
            )}
          </div>
        </div>
      )}

      {/* GPS Location & Place Detection */}
      {((selectedAsset.latitude && selectedAsset.longitude) || selectedAsset.city || selectedAsset.country) && (
        <div className="p-3.5 border-b border-slate-800/60 text-xs space-y-2.5">
          <div className="flex items-center justify-between text-slate-400">
            <div className="flex items-center gap-1.5 font-medium">
              <MapPin className="w-3.5 h-3.5 text-rose-400" />
              <span>Location</span>
            </div>
            {selectedAsset.latitude && selectedAsset.longitude && (
              <a
                href={`https://www.google.com/maps?q=${selectedAsset.latitude},${selectedAsset.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                title="View on Google Maps"
              >
                <span>Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {(selectedAsset.city || selectedAsset.country) && (
            <div className="bg-slate-950/40 p-2.5 rounded border border-slate-800/60 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedAsset.city && (
                  <button
                    onClick={() => setSearchQuery(selectedAsset.city!)}
                    className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold text-xs transition-colors"
                    title={`Filter by ${selectedAsset.city}`}
                  >
                    {selectedAsset.city}
                  </button>
                )}
                {selectedAsset.state && selectedAsset.state !== selectedAsset.city && (
                  <span className="text-slate-400 text-xs">
                    {selectedAsset.state},
                  </span>
                )}
                {selectedAsset.country && (
                  <button
                    onClick={() => setSearchQuery(selectedAsset.country!)}
                    className="px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs transition-colors"
                    title={`Filter by ${selectedAsset.country}`}
                  >
                    {selectedAsset.country}
                  </button>
                )}
              </div>
              {selectedAsset.placeName && (
                <p className="text-[11px] text-slate-400 leading-tight pt-0.5" title={selectedAsset.placeName}>
                  {selectedAsset.placeName}
                </p>
              )}
            </div>
          )}

          {selectedAsset.latitude && selectedAsset.longitude && (
            <div className="flex items-center justify-between font-mono text-[11px] text-slate-400 pt-0.5">
              <span>{selectedAsset.latitude.toFixed(4)}°, {selectedAsset.longitude.toFixed(4)}°</span>
              {selectedAsset.altitude && (
                <span>Alt: {selectedAsset.altitude.toFixed(0)}m</span>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
