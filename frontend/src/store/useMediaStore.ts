import { create } from 'zustand';
import { Asset, Drive, Album, ConnectedDevice, ImportProgress, SystemHealth } from '../types';

export type NavigationTab =
  | 'library'
  | 'photos'
  | 'videos'
  | 'favorites'
  | 'recents'
  | 'collections'
  | 'albums'
  | 'drives'
  | 'people'
  | 'places';

interface MediaState {
  // Navigation & View State
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  selectedAlbumId: string | null;
  setSelectedAlbumId: (id: string | null) => void;
  viewMode: 'grid' | 'timeline';
  setViewMode: (mode: 'grid' | 'timeline') => void;
  gridSize: 'small' | 'medium' | 'large';
  setGridSize: (size: 'small' | 'medium' | 'large') => void;

  // Search & Filtering
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterDriveId: string | null;
  setFilterDriveId: (driveId: string | null) => void;

  // Selection & Inspector
  selectedAssetId: string | null;
  selectedAsset: Asset | null;
  setSelectedAsset: (asset: Asset | null) => void;
  isInspectorOpen: boolean;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  multiSelectedIds: Set<string>;
  toggleAssetSelection: (id: string, isShift?: boolean) => void;
  clearSelection: () => void;
  selectAll: (ids: string[]) => void;

  // Real-time entities
  drives: Drive[];
  setDrives: (drives: Drive[]) => void;
  updateDrive: (drive: Drive) => void;
  albums: Album[];
  setAlbums: (albums: Album[]) => void;
  devices: ConnectedDevice[];
  setDevices: (devices: ConnectedDevice[]) => void;
  activeImport: ImportProgress | null;
  setActiveImport: (progress: ImportProgress | null) => void;
  systemHealth: SystemHealth | null;
  setSystemHealth: (health: SystemHealth | null) => void;

  // Modals
  isRegisterDriveOpen: boolean;
  setRegisterDriveOpen: (open: boolean) => void;
  isRebuildModalOpen: boolean;
  setRebuildModalOpen: (open: boolean) => void;
  selectedRebuildDrive: Drive | null;
  setSelectedRebuildDrive: (drive: Drive | null) => void;
  rebuildError: string | null;
  setRebuildError: (error: string | null) => void;
  isCreateAlbumOpen: boolean;
  setCreateAlbumOpen: (open: boolean) => void;
  isFamilyEventsModalOpen: boolean;
  setFamilyEventsModalOpen: (open: boolean) => void;
  isImportModalOpen: boolean;
  setImportModalOpen: (open: boolean) => void;
}

export const useMediaStore = create<MediaState>((set) => ({
  activeTab: 'library',
  setActiveTab: (tab) => set({ activeTab: tab, selectedAlbumId: null }),
  selectedAlbumId: null,
  setSelectedAlbumId: (id) => set({ selectedAlbumId: id, activeTab: 'albums' }),
  viewMode: 'grid',
  setViewMode: (mode) => set({ viewMode: mode }),
  gridSize: 'medium',
  setGridSize: (size) => set({ gridSize: size }),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  filterDriveId: null,
  setFilterDriveId: (driveId) => set({ filterDriveId: driveId }),

  selectedAssetId: null,
  selectedAsset: null,
  setSelectedAsset: (asset) => set({ selectedAsset: asset, selectedAssetId: asset ? asset.id : null }),
  isInspectorOpen: true,
  toggleInspector: () => set((state) => ({ isInspectorOpen: !state.isInspectorOpen })),
  setInspectorOpen: (open) => set({ isInspectorOpen: open }),
  multiSelectedIds: new Set(),
  toggleAssetSelection: (id) =>
    set((state) => {
      const next = new Set(state.multiSelectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { multiSelectedIds: next };
    }),
  clearSelection: () => set({ multiSelectedIds: new Set() }),
  selectAll: (ids) => set({ multiSelectedIds: new Set(ids) }),

  drives: [],
  setDrives: (drives) => set({ drives }),
  updateDrive: (drive) =>
    set((state) => ({
      drives: state.drives.map((d) => (d.id === drive.id ? drive : d)),
    })),
  albums: [],
  setAlbums: (albums) => set({ albums }),
  devices: [],
  setDevices: (devices) => set({ devices }),
  activeImport: null,
  setActiveImport: (activeImport) => set({ activeImport }),
  systemHealth: null,
  setSystemHealth: (systemHealth) => set({ systemHealth }),

  isRegisterDriveOpen: false,
  setRegisterDriveOpen: (open) => set({ isRegisterDriveOpen: open }),
  isRebuildModalOpen: false,
  setRebuildModalOpen: (open) => set({ isRebuildModalOpen: open }),
  selectedRebuildDrive: null,
  setSelectedRebuildDrive: (drive) => set({ selectedRebuildDrive: drive, rebuildError: null }),
  rebuildError: null,
  setRebuildError: (rebuildError) => set({ rebuildError }),
  isCreateAlbumOpen: false,
  setCreateAlbumOpen: (open) => set({ isCreateAlbumOpen: open }),
  isFamilyEventsModalOpen: false,
  setFamilyEventsModalOpen: (open) => set({ isFamilyEventsModalOpen: open }),
  isImportModalOpen: false,
  setImportModalOpen: (open) => set({ isImportModalOpen: open }),
}));

