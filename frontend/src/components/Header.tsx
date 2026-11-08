import React from 'react';
import {
  Search,
  X,
  Sidebar as SidebarIcon,
  LayoutGrid,
  Calendar,
  HardDrive,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';
import { useMediaStore } from '../store/useMediaStore';
import { Drive, Album } from '../types';

interface HeaderProps {
  totalAssets: number;
  drives: Drive[];
  albums: Album[];
}

export const Header: React.FC<HeaderProps> = ({ totalAssets, drives, albums }) => {
  const {
    activeTab,
    setActiveTab,
    selectedAlbumId,
    setSelectedAlbumId,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    gridSize,
    setGridSize,
    isInspectorOpen,
    toggleInspector,
    filterDriveId,
    setFilterDriveId,
    activeImport,
    setSelectedRebuildDrive,
    setRebuildModalOpen,
  } = useMediaStore();

  const getTitle = () => {
    if (selectedAlbumId) {
      const album = albums.find((a) => a.id === selectedAlbumId);
      return album ? album.name : 'Album';
    }
    switch (activeTab) {
      case 'library':
        return 'All Media';
      case 'photos':
        return 'Photos';
      case 'videos':
        return 'Videos';
      case 'favorites':
        return 'Favorites';
      case 'recents':
        return 'Recently Added';
      case 'collections':
      case 'albums':
        return 'Collections & Albums';
      case 'drives':
        return 'External Storage Drives';
      default:
        return 'Library';
    }
  };

  const currentAlbum = selectedAlbumId ? albums.find((a) => a.id === selectedAlbumId) : null;
  const albumMeta = React.useMemo(() => {
    if (!currentAlbum) return null;
    let category = 'manual';
    let subtitle = currentAlbum.description || null;
    let badge = 'Album';
    let badgeColor = 'bg-slate-800 text-slate-300 border-slate-700';

    if (currentAlbum.albumType === 'smart' && currentAlbum.rulesJson) {
      try {
        const rules = JSON.parse(currentAlbum.rulesJson);
        category = rules.category || 'trip';

        if (category === 'year') {
          badge = 'Year';
          badgeColor = 'bg-blue-500/10 text-blue-300 border-blue-500/30';
          subtitle = `All media captured in ${rules.year || currentAlbum.name}`;
        } else if (category === 'country') {
          badge = 'Country';
          badgeColor = 'bg-rose-500/10 text-rose-300 border-rose-500/30';
          subtitle = `Media captured in ${rules.country || currentAlbum.name}`;
        } else if (category === 'city') {
          badge = 'City';
          badgeColor = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
          subtitle = rules.country ? `${rules.city || currentAlbum.name}, ${rules.country}` : `Captured in ${rules.city || currentAlbum.name}`;
        } else if (category === 'event') {
          const isBday = rules.eventType === 'birthday';
          const isAnniv = rules.eventType === 'anniversary';
          badge = isBday ? '🎂 Birthday' : isAnniv ? '💍 Anniversary' : '🎉 Celebration';
          badgeColor = isBday
            ? 'bg-pink-500/10 text-pink-300 border-pink-500/30'
            : isAnniv
              ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
              : 'bg-amber-500/10 text-amber-300 border-amber-500/30';
          subtitle = rules.startDate && rules.endDate
            ? `${rules.personName ? `${rules.personName}'s celebration` : 'Celebration'} • ${rules.startDate} to ${rules.endDate}`
            : currentAlbum.description || 'Family Celebration';
        } else if (category === 'trip') {
          badge = 'Trip';
          badgeColor = 'bg-amber-500/10 text-amber-300 border-amber-500/30';
          const parts: string[] = [];
          if (rules.startDate && rules.endDate) {
            parts.push(`${rules.startDate} to ${rules.endDate}`);
          }
          if (rules.city || rules.country) {
            parts.push([rules.city, rules.country].filter(Boolean).join(', '));
          }
          subtitle = parts.length > 0 ? parts.join(' • ') : currentAlbum.description || 'Smart Trip Collection';
        } else {
          badge = 'Smart Collection';
          badgeColor = 'bg-purple-500/10 text-purple-300 border-purple-500/30';
        }
      } catch { }
    }
    return { category, subtitle, badge, badgeColor };
  }, [currentAlbum]);

  return (
    <header className="h-14 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-5 flex items-center justify-between gap-4 select-none flex-shrink-0 z-10">
      {/* Title & Stats */}
      <div className="flex items-center gap-3 min-w-[200px]">
        {selectedAlbumId && (
          <button
            onClick={() => {
              setSelectedAlbumId(null);
              setActiveTab('collections');
            }}
            className="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-medium border border-slate-700/60"
            title="Back to Collections overview"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline text-[11px]">Collections</span>
          </button>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
              {getTitle()}
              {!((activeTab === 'collections' || activeTab === 'albums') && !selectedAlbumId) && (
                <span className="text-xs font-normal text-slate-400 font-mono">
                  ({totalAssets})
                </span>
              )}
            </h2>
            {albumMeta && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${albumMeta.badgeColor}`}>
                {albumMeta.badge}
              </span>
            )}
          </div>
          {albumMeta?.subtitle && (
            <p className="text-[11px] text-slate-400 truncate max-w-sm">
              {albumMeta.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Instant FTS5 Search Input */}
      <div className="flex-1 max-w-md relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by city, country, filename, camera, lens..."
          className="w-full bg-slate-800/70 hover:bg-slate-800 focus:bg-slate-800 text-xs text-white placeholder-slate-400 pl-9 pr-8 py-1.5 rounded-lg border border-slate-700/60 focus:border-blue-500 focus:outline-none transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Live Rebuild Progress Pill */}
      {activeImport && (
        <button
          onClick={() => {
            const drive = drives.find((d) => d.id === activeImport.sessionId);
            if (drive) {
              setSelectedRebuildDrive(drive);
              setRebuildModalOpen(true);
            }
          }}
          className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-xs transition-all cursor-pointer animate-in fade-in max-w-[280px]"
          title="Click to view rebuild details"
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />
          <div className="flex flex-col text-left overflow-hidden min-w-0">
            <div className="flex items-center gap-1.5 font-medium text-blue-300 text-[11px] leading-tight">
              <span>Rebuilding Index</span>
              <span className="font-mono font-semibold">{activeImport.percent}%</span>
              {activeImport.totalFiles > 0 && (
                <span className="text-[10px] text-blue-400/80 font-mono">
                  ({activeImport.completedFiles}/{activeImport.totalFiles})
                </span>
              )}
            </div>
            {activeImport.currentFile && (
              <span className="text-[10px] text-slate-400 font-mono truncate max-w-[200px]">
                {activeImport.currentFile}
              </span>
            )}
          </div>
        </button>
      )}

      {/* Control Actions & Toggles */}
      <div className="flex items-center gap-2">
        {/* Drive Filter Selector */}
        {drives.length > 0 && activeTab !== 'drives' && (
          <div className="relative">
            <select
              value={filterDriveId || ''}
              onChange={(e) => setFilterDriveId(e.target.value || null)}
              className="bg-slate-800/80 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700/60 hover:text-white focus:outline-none focus:border-blue-500 transition-colors cursor-pointer appearance-none pr-7"
            >
              <option value="">All Storage Drives</option>
              {drives.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.driveName} {d.status === 'disconnected' ? '(Offline)' : ''}
                </option>
              ))}
            </select>
            <HardDrive className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}

        {/* View Mode Toggle (Grid vs Timeline) */}
        <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1 rounded text-xs transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            title="Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`p-1 rounded text-xs transition-colors ${viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            title="Chronological Timeline"
          >
            <Calendar className="w-4 h-4" />
          </button>
        </div>

        {/* Grid Size Selector */}
        <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60">
          <button
            onClick={() => setGridSize('small')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${gridSize === 'small' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            title="Compact grid"
          >
            S
          </button>
          <button
            onClick={() => setGridSize('medium')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${gridSize === 'medium' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            title="Standard grid"
          >
            M
          </button>
          <button
            onClick={() => setGridSize('large')}
            className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${gridSize === 'large' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            title="Expanded grid"
          >
            L
          </button>
        </div>

        {/* Inspector Toggle */}
        <button
          onClick={toggleInspector}
          className={`p-1.5 rounded-lg border border-slate-700/60 transition-colors ${isInspectorOpen
              ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
              : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          title="Toggle Info Inspector (Cmd+I)"
        >
          <SidebarIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
