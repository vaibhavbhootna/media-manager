import React from 'react';
import {
  Image,
  Video,
  Heart,
  Clock,
  FolderClosed,
  HardDrive,
  Plus,
  Compass,
  Smartphone,
  Trash2,
  Sparkles,
  Cake,
  ArrowRight
} from 'lucide-react';
import { useMediaStore } from '../store/useMediaStore';
import { Album, Drive } from '../types';
import { deleteAlbum, fetchDevices, autoGenerateCollections } from '../services/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface SidebarProps {
  albums: Album[];
  drives: Drive[];
}

export const Sidebar: React.FC<SidebarProps> = ({ albums, drives }) => {
  const {
    activeTab,
    setActiveTab,
    selectedAlbumId,
    setSelectedAlbumId,
    setCreateAlbumOpen,
    setFamilyEventsModalOpen,
    setRegisterDriveOpen,
    setImportModalOpen,
    filterDriveId,
    setFilterDriveId,
  } = useMediaStore();

  const queryClient = useQueryClient();

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    refetchInterval: 5000,
  });

  const connectedIPhone = devices[0];

  const deleteAlbumMutation = useMutation({
    mutationFn: (id: string) => deleteAlbum(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['albums'] });
      if (selectedAlbumId === deletedId) {
        setSelectedAlbumId(null);
        setActiveTab('library');
      }
    },
  });

  const autoGenerateMutation = useMutation({
    mutationFn: autoGenerateCollections,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] });
    },
  });

  const connectedDrivesCount = drives.filter((d) => d.status === 'connected').length;

  const parsedAlbums = React.useMemo(() => {
    return albums.map((album) => {
      let category = 'manual';
      let rules = null;
      if (album.albumType === 'smart' && album.rulesJson) {
        try {
          rules = JSON.parse(album.rulesJson);
          category = rules.category || 'trip';
        } catch { }
      }
      return { ...album, category, parsedRules: rules };
    });
  }, [albums]);

  const tripAlbums = parsedAlbums.filter((a) => a.category === 'trip' || a.category === 'custom');
  const manualAlbums = parsedAlbums.filter((a) => a.albumType === 'manual');

  const renderAlbumItem = (album: typeof parsedAlbums[0], icon: React.ReactNode) => {
    const isSelected = selectedAlbumId === album.id;
    return (
      <div
        key={album.id}
        className={`group/album w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all cursor-pointer ${isSelected
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
          }`}
        onClick={() => setSelectedAlbumId(album.id)}
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          <span className="flex-shrink-0">{icon}</span>
          <span className="truncate">{album.name}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono group-hover/album:hidden ${isSelected ? 'bg-blue-700 text-white' : 'bg-slate-800/60 text-slate-400'
              }`}
          >
            {album.assetCount}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (
                confirm(
                  `Delete collection "${album.name}"? Original photos on your drives will never be deleted.`
                )
              ) {
                deleteAlbumMutation.mutate(album.id);
              }
            }}
            className="hidden group-hover/album:flex p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
            title="Delete Collection"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside className="w-64 flex-shrink-0 bg-slate-900/70 backdrop-blur-xl border-r border-slate-800/80 flex flex-col h-full select-none">
      {/* App Branding */}
      <div className="p-4 flex items-center justify-between border-b border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-bold">
            <Compass className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-white">Media Manager</h1>
            <p className="text-[11px] text-slate-400 font-mono">Local-First Archive</p>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5 text-xs font-medium">
        {/* Core Library */}
        <div>
          <div className="px-2.5 mb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Library
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => setActiveTab('library')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all ${activeTab === 'library' && !selectedAlbumId
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
            >
              <div className="flex items-center gap-2.5">
                <Image className="w-4 h-4" />
                <span>All Media</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('photos')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all ${activeTab === 'photos'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
            >
              <div className="flex items-center gap-2.5">
                <Image className="w-4 h-4" />
                <span>Photos</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('videos')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all ${activeTab === 'videos'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
            >
              <div className="flex items-center gap-2.5">
                <Video className="w-4 h-4" />
                <span>Videos</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('favorites')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all ${activeTab === 'favorites'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
            >
              <div className="flex items-center gap-2.5">
                <Heart className="w-4 h-4 text-rose-500 fill-rose-500/20" />
                <span>Favorites</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('recents')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all ${activeTab === 'recents'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
            >
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>Recently Added</span>
              </div>
            </button>

            <button
              onClick={() => {
                setSelectedAlbumId(null);
                setActiveTab('collections');
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all ${(activeTab === 'collections' || activeTab === 'albums') && !selectedAlbumId
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
            >
              <div className="flex items-center gap-2.5">
                <Compass className="w-4 h-4 text-amber-400" />
                <span>Collections</span>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${(activeTab === 'collections' || activeTab === 'albums') && !selectedAlbumId
                    ? 'bg-blue-700 text-white'
                    : 'bg-slate-800/60 text-slate-400'
                  }`}
              >
                {albums.length}
              </span>
            </button>
          </div>
        </div>

        {/* Collections & Albums Section */}
        <div>
          <div className="flex items-center justify-between px-2.5 mb-2">
            <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Collections
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFamilyEventsModalOpen(true)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-pink-300 transition-colors"
                title="Define Birthdays & Anniversaries"
              >
                <Cake className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => autoGenerateMutation.mutate()}
                disabled={autoGenerateMutation.isPending}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition-colors"
                title="Auto-create smart collections for detected Years, Countries & Cities"
              >
                <Sparkles className={`w-3.5 h-3.5 ${autoGenerateMutation.isPending ? 'animate-spin text-amber-400' : ''}`} />
              </button>
              <button
                onClick={() => setCreateAlbumOpen(true)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="New Collection or Album"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {/* If an album is currently selected, highlight it */}
            {selectedAlbumId && (
              <div className="p-2 rounded-lg bg-blue-950/40 border border-blue-500/30 mb-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-blue-300 truncate">
                    {albums.find((a) => a.id === selectedAlbumId)?.name || 'Selected Collection'}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedAlbumId(null);
                      setActiveTab('collections');
                    }}
                    className="text-[10px] text-blue-400 hover:text-blue-200 underline"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {/* Quick Trips / Custom Collections (limit to top 4 so sidebar doesn't get flooded) */}
            {tripAlbums.slice(0, 4).map((album) =>
              renderAlbumItem(album, <Compass className="w-3.5 h-3.5 text-amber-400" />)
            )}

            {/* Manual Albums (limit to top 3) */}
            {manualAlbums.slice(0, 3).map((album) =>
              renderAlbumItem(album, <FolderClosed className="w-3.5 h-3.5 text-indigo-400" />)
            )}

            {/* View All Collections Button */}
            <button
              onClick={() => {
                setSelectedAlbumId(null);
                setActiveTab('collections');
              }}
              className="w-full mt-2 py-1.5 px-2.5 rounded-lg border border-slate-800 bg-slate-800/40 hover:bg-slate-800 text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center justify-between transition-colors group"
            >
              <div className="flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                <span>Explore All Collections</span>
              </div>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Storage Hardware */}
        <div>
          <div className="flex items-center justify-between px-2.5 mb-1.5">
            <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Storage Drives
            </span>
            <button
              onClick={() => setRegisterDriveOpen(true)}
              className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Register External Drive"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => {
              setFilterDriveId(null);
              setActiveTab('drives');
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all ${activeTab === 'drives'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`}
          >
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-sky-400" />
              <span>External HDDs</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${connectedDrivesCount > 0 ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-amber-500'}`} />
              <span className="text-[10px] text-slate-400 font-mono">
                {connectedDrivesCount}/{drives.length}
              </span>
            </div>
          </button>

          {/* Drive quick-filters */}
          {drives.length > 0 && (
            <div className="mt-1 space-y-0.5 pl-2">
              {drives.map((d) => {
                const isSelected = filterDriveId === d.id && activeTab !== 'drives';
                return (
                  <button
                    key={d.id}
                    onClick={() => {
                      setFilterDriveId(d.id);
                      if (activeTab === 'drives') setActiveTab('library');
                    }}
                    className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] transition-all ${isSelected
                        ? 'bg-blue-600 text-white shadow-sm font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    title={`Filter library to ${d.driveName}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d.status === 'connected' ? 'bg-emerald-400' : 'bg-slate-600'
                          }`}
                      />
                      <span className="truncate">{d.driveName}</span>
                    </div>
                    {d.assetCount !== undefined && (
                      <span className="font-mono text-[10px] opacity-75">{d.assetCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Ingestion & Hardware */}
        <div>
          <div className="px-2.5 mb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Ingestion & Hardware
          </div>
          <button
            onClick={() => setImportModalOpen(true)}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-all group ${connectedIPhone
                ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-900/40 shadow-sm'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative">
                <Smartphone className={`w-4 h-4 ${connectedIPhone ? 'text-emerald-400' : 'text-slate-400'}`} />
                {connectedIPhone && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </div>
              <div className="text-left truncate">
                <span className="block truncate font-medium">
                  {connectedIPhone ? connectedIPhone.name : 'iPhone & Ingest'}
                </span>
                {connectedIPhone && (
                  <span className="text-[10px] text-emerald-400/80 font-mono block">
                    {connectedIPhone.model}
                  </span>
                )}
              </div>
            </div>
            <span
              className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${connectedIPhone
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400'
                }`}
            >
              {connectedIPhone ? 'Connected' : 'USB'}
            </span>
          </button>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800/60 text-[11px] text-slate-400 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          100% Offline Private
        </span>
        <span className="font-mono text-[10px] text-slate-400">v1.0</span>
      </div>
    </aside>
  );
};
