import React from 'react';
import { Heart, Play, CloudOff } from 'lucide-react';
import { Asset } from '../types';

interface MediaCardProps {
  asset: Asset;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  asset,
  isSelected,
  onSelect,
  onToggleFavorite,
}) => {
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const isOffline = asset.availabilityStatus === 'offline';

  return (
    <div
      onClick={onSelect}
      title={`${asset.originalFilename}${asset.city ? ` • ${asset.city}${asset.country ? `, ${asset.country}` : ''}` : ''} • ${asset.dateTaken ? new Date(asset.dateTaken).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}`}
      className={`group relative rounded-lg overflow-hidden cursor-pointer select-none transition-all duration-150 aspect-square bg-slate-900 border ${
        isSelected
          ? 'ring-2 ring-blue-500 border-transparent shadow-lg shadow-blue-500/10'
          : 'border-slate-800/80 hover:border-slate-700 hover:shadow-md'
      }`}
    >
      {/* Thumbnail Image */}
      {asset.thumbnailPath ? (
        <img
          src={`/api/v1/assets/${asset.id}/thumbnail`}
          alt={asset.originalFilename}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800/50 text-slate-500">
          <span className="text-[10px] font-mono uppercase">{asset.fileExtension}</span>
        </div>
      )}

      {/* Top Overlays */}
      <div className="absolute inset-x-0 top-0 p-1.5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-black/60 to-transparent">
        {/* Favorite Heart Button */}
        <button
          onClick={onToggleFavorite}
          className={`p-1 rounded-full backdrop-blur-md transition-colors ${
            asset.isFavorite
              ? 'bg-rose-500 text-white'
              : 'bg-black/40 text-slate-300 hover:text-white hover:bg-black/60'
          }`}
          title={asset.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart className={`w-3.5 h-3.5 ${asset.isFavorite ? 'fill-white' : ''}`} />
        </button>

        {/* Media Format Tag */}
        <span className="text-[9px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded backdrop-blur-md bg-black/40 text-slate-300">
          {asset.fileExtension}
        </span>
      </div>

      {/* Offline Status Badge (Persistent indicator when drive is disconnected) */}
      {isOffline && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1 bg-amber-950/80 border border-amber-600/50 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] text-amber-300 font-medium shadow-sm group-hover:hidden">
          <CloudOff className="w-3 h-3 text-amber-400" />
          <span>Offline</span>
        </div>
      )}

      {/* Video Indicator & Duration */}
      {asset.mediaType === 'video' && (
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] text-white font-mono font-medium">
          <Play className="w-2.5 h-2.5 fill-white" />
          {formatDuration(asset.duration)}
        </div>
      )}

      {/* Actual Media Date & Location Badge (On hover) */}
      {(asset.dateTaken || asset.city || asset.country) && (
        <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/75 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] text-slate-300 font-mono pointer-events-none flex items-center gap-1.5 max-w-[85%] truncate">
          {asset.city && (
            <span className="text-rose-300 font-sans font-medium truncate">{asset.city}</span>
          )}
          {asset.dateTaken && (
            <span className="shrink-0 text-slate-300">
              {new Date(asset.dateTaken).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
      )}

      {/* Always Show Favorite if Favorited */}
      {asset.isFavorite && (
        <div className="absolute top-1.5 left-1.5 p-1 rounded-full bg-rose-500/90 text-white shadow-sm group-hover:hidden">
          <Heart className="w-3 h-3 fill-white" />
        </div>
      )}
    </div>
  );
};
