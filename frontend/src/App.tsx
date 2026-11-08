import React, { Component, ErrorInfo, ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MediaGrid } from './components/MediaGrid';
import { InfoPanel } from './components/InfoPanel';
import { DrivesView } from './components/DrivesView';
import { CollectionsView } from './components/CollectionsView';
import { RegisterDriveModal } from './components/RegisterDriveModal';
import { RebuildModal } from './components/RebuildModal';
import { CreateAlbumModal } from './components/CreateAlbumModal';
import { FamilyEventsModal } from './components/FamilyEventsModal';
import { ImportModal } from './components/ImportModal';
import { useMediaStore } from './store/useMediaStore';
import { fetchAssets, fetchDrives, fetchAlbums } from './services/api';
import { initializeWebSocket } from './services/websocket';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in Media Manager:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 p-6 text-slate-100">
          <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-950/20 p-6 text-center">
            <h2 className="text-lg font-bold text-red-400">Application Error</h2>
            <p className="mt-2 text-xs text-slate-300 font-mono break-words">
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
    },
  },
});

const MainApplication: React.FC = () => {
  // Use atomic selectors to prevent unnecessary re-render loops
  const activeTab = useMediaStore((state) => state.activeTab);
  const selectedAlbumId = useMediaStore((state) => state.selectedAlbumId);
  const searchQuery = useMediaStore((state) => state.searchQuery);
  const filterDriveId = useMediaStore((state) => state.filterDriveId);
  const activeImport = useMediaStore((state) => state.activeImport);

  // Initialize live WebSocket listener
  useEffect(() => {
    const cleanup = initializeWebSocket(queryClient);
    return cleanup;
  }, []);

  // Fetch drives
  const { data: drives = [] } = useQuery({
    queryKey: ['drives'],
    queryFn: fetchDrives,
  });

  // Fetch albums
  const { data: albums = [] } = useQuery({
    queryKey: ['albums'],
    queryFn: fetchAlbums,
  });

  // Compute filters based on active tab
  const getFilterParams = () => {
    const params: {
      mediaType?: string;
      isFavorite?: boolean;
      driveId?: string;
      albumId?: string;
      q?: string;
      limit: number;
    } = {
      limit: 500,
    };

    if (activeTab === 'photos') params.mediaType = 'photo';
    if (activeTab === 'videos') params.mediaType = 'video';
    if (activeTab === 'favorites') params.isFavorite = true;
    if (selectedAlbumId) params.albumId = selectedAlbumId;
    if (filterDriveId) params.driveId = filterDriveId;
    if (searchQuery.trim()) params.q = searchQuery.trim();

    return params;
  };

  // Fetch assets
  const { data: assetsData, isLoading } = useQuery({
    queryKey: ['assets', activeTab, selectedAlbumId, filterDriveId, searchQuery],
    queryFn: () => fetchAssets(getFilterParams()),
    refetchInterval: activeImport ? 3000 : false,
  });

  const assets = assetsData?.assets || [];
  const totalAssets = assetsData?.total || 0;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar Navigation */}
      <Sidebar albums={albums} drives={drives} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-950">
        <Header totalAssets={totalAssets} drives={drives} albums={albums} />

        <div className="flex-1 flex overflow-hidden relative">
          {activeTab === 'drives' ? (
            <DrivesView drives={drives} />
          ) : (activeTab === 'collections' || activeTab === 'albums') && !selectedAlbumId ? (
            <CollectionsView albums={albums} />
          ) : isLoading ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
              Loading library catalog...
            </div>
          ) : (
            <MediaGrid assets={assets} />
          )}

          {/* Right Inspector Info Panel */}
          {selectedAlbumId || activeTab !== 'collections' ? <InfoPanel drives={drives} /> : null}
        </div>
      </div>

      {/* Modals */}
      <RegisterDriveModal />
      <RebuildModal />
      <CreateAlbumModal />
      <FamilyEventsModal />
      <ImportModal drives={drives} />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MainApplication />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

