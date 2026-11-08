import React, { useEffect, useRef } from 'react';
import { Asset } from '../types';
import { MediaCard } from './MediaCard';
import { useMediaStore } from '../store/useMediaStore';
import { toggleFavorite } from '../services/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Images } from 'lucide-react';

interface MediaGridProps {
  assets: Asset[];
}

export const MediaGrid: React.FC<MediaGridProps> = ({ assets }) => {
  const {
    selectedAssetId,
    setSelectedAsset,
    multiSelectedIds,
    toggleAssetSelection,
    clearSelection,
    gridSize,
    viewMode,
  } = useMediaStore();

  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);

  const favMutation = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      toggleFavorite(id, isFavorite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (assets.length === 0) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const currentIndex = assets.findIndex((a) => a.id === selectedAssetId);

      if (e.key === 'ArrowRight') {
        const next = Math.min(assets.length - 1, currentIndex + 1);
        setSelectedAsset(assets[next]);
      } else if (e.key === 'ArrowLeft') {
        const prev = Math.max(0, currentIndex - 1);
        setSelectedAsset(assets[prev]);
      } else if (e.key.toLowerCase() === 'f' && selectedAssetId) {
        const current = assets.find((a) => a.id === selectedAssetId);
        if (current) {
          favMutation.mutate({ id: current.id, isFavorite: !current.isFavorite });
        }
      } else if (e.key === 'Escape') {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [assets, selectedAssetId]);

  if (assets.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-3">
          <Images className="w-8 h-8 text-slate-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-300">No media found</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Connect an external HDD and run Rebuild Library, or plug in an iPhone to import photos.
        </p>
      </div>
    );
  }

  const getGridCols = () => {
    switch (gridSize) {
      case 'small':
        return 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 p-3';
      case 'large':
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-5';
      case 'medium':
      default:
        return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3 p-4';
    }
  };

  // Group chronologically if timeline mode is active
  const groupAssetsByDate = () => {
    const groups: { [key: string]: Asset[] } = {};
    for (const asset of assets) {
      const dateStr = asset.dateTaken || asset.dateImported;
      const date = new Date(dateStr);
      const groupKey = isNaN(date.getTime())
        ? 'Unknown Date'
        : date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(asset);
    }
    return groups;
  };

  if (viewMode === 'timeline') {
    const dateGroups = groupAssetsByDate();
    return (
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-6">
        {Object.entries(dateGroups).map(([dateLabel, groupAssets]) => (
          <div key={dateLabel}>
            <div className="sticky top-0 z-10 py-1.5 backdrop-blur-md bg-slate-950/70 border-b border-slate-800/40 mb-2.5">
              <h3 className="text-xs font-semibold text-slate-300 font-mono tracking-tight">
                {dateLabel}
                <span className="ml-2 text-[10px] text-slate-500 font-normal">
                  ({groupAssets.length} items)
                </span>
              </h3>
            </div>
            <div className={`grid ${getGridCols()} p-0`}>
              {groupAssets.map((asset) => {
                const isSelected =
                  selectedAssetId === asset.id || multiSelectedIds.has(asset.id);
                return (
                  <MediaCard
                    key={asset.id}
                    asset={asset}
                    isSelected={isSelected}
                    onSelect={(e) => {
                      if (e.metaKey || e.shiftKey) {
                        toggleAssetSelection(asset.id);
                      } else {
                        setSelectedAsset(asset);
                      }
                    }}
                    onToggleFavorite={(e) => {
                      e.stopPropagation();
                      favMutation.mutate({ id: asset.id, isFavorite: !asset.isFavorite });
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <div className={`grid ${getGridCols()}`}>
        {assets.map((asset) => {
          const isSelected =
            selectedAssetId === asset.id || multiSelectedIds.has(asset.id);
          return (
            <MediaCard
              key={asset.id}
              asset={asset}
              isSelected={isSelected}
              onSelect={(e) => {
                if (e.metaKey || e.shiftKey) {
                  toggleAssetSelection(asset.id);
                } else {
                  setSelectedAsset(asset);
                }
              }}
              onToggleFavorite={(e) => {
                e.stopPropagation();
                favMutation.mutate({ id: asset.id, isFavorite: !asset.isFavorite });
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

