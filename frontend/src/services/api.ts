import {
  Asset,
  Drive,
  Album,
  AlbumType,
  SmartAlbumRules,
  CollectionsMeta,
  FamilyEvent,
  SystemHealth,
  ConnectedDevice,
  BackupSessionStatus,
  BrowseDirectoryResponse
} from '../types';

const BASE_URL = '/api/v1';

export async function fetchHealth(): Promise<SystemHealth> {
  const res = await fetch(`${BASE_URL}/system/health`);
  if (!res.ok) throw new Error('Failed to fetch system health');
  return res.json();
}

export async function fetchDrives(): Promise<Drive[]> {
  const res = await fetch(`${BASE_URL}/drives`);
  if (!res.ok) throw new Error('Failed to fetch drives');
  return res.json();
}

export async function registerDrive(mountPath: string, driveName?: string): Promise<Drive> {
  const res = await fetch(`${BASE_URL}/drives/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mountPath, driveName: driveName || undefined }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to register drive');
  }
  return res.json();
}

export async function scanDrive(driveId: string): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/drives/${driveId}/scan`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to start drive scan');
  return res.json();
}

export async function deleteDrive(driveId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/drives/${driveId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to unregister drive');
}

export interface FetchAssetsParams {
  mediaType?: string;
  isFavorite?: boolean;
  driveId?: string;
  albumId?: string;
  q?: string;
  year?: number;
  country?: string;
  city?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface AssetsResponse {
  assets: Asset[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchAssets(params: FetchAssetsParams = {}): Promise<AssetsResponse> {
  const searchParams = new URLSearchParams();
  if (params.mediaType) searchParams.set('mediaType', params.mediaType);
  if (params.isFavorite !== undefined) searchParams.set('isFavorite', String(params.isFavorite));
  if (params.driveId) searchParams.set('driveId', params.driveId);
  if (params.albumId) searchParams.set('albumId', params.albumId);
  if (params.q) searchParams.set('q', params.q);
  if (params.year) searchParams.set('year', String(params.year));
  if (params.country) searchParams.set('country', params.country);
  if (params.city) searchParams.set('city', params.city);
  if (params.startDate) searchParams.set('startDate', params.startDate);
  if (params.endDate) searchParams.set('endDate', params.endDate);
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.offset) searchParams.set('offset', String(params.offset));

  const res = await fetch(`${BASE_URL}/assets?${searchParams.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch assets');
  return res.json();
}

export async function fetchAsset(id: string): Promise<Asset> {
  const res = await fetch(`${BASE_URL}/assets/${id}`);
  if (!res.ok) throw new Error('Failed to fetch asset');
  return res.json();
}

export async function toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
  const res = await fetch(`${BASE_URL}/assets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isFavorite }),
  });
  if (!res.ok) throw new Error('Failed to update favorite');
}

export async function revealInFinder(id: string): Promise<{ status?: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/assets/${id}/reveal`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to reveal original file');
  }
  return data;
}

export async function fetchAlbums(): Promise<Album[]> {
  const res = await fetch(`${BASE_URL}/albums`);
  if (!res.ok) throw new Error('Failed to fetch albums');
  return res.json();
}

export async function createAlbum(
  name: string,
  description?: string,
  albumType: AlbumType = 'manual',
  rules?: SmartAlbumRules
): Promise<Album> {
  const res = await fetch(`${BASE_URL}/albums`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, albumType, rules }),
  });
  if (!res.ok) throw new Error('Failed to create album');
  return res.json();
}

export async function autoGenerateCollections(): Promise<Album[]> {
  const res = await fetch(`${BASE_URL}/albums/auto-generate`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to auto-generate collections');
  return res.json();
}

export async function fetchCollectionsMeta(): Promise<CollectionsMeta> {
  const res = await fetch(`${BASE_URL}/collections/meta`);
  if (!res.ok) throw new Error('Failed to fetch collections meta');
  return res.json();
}

export async function fetchFamilyEvents(): Promise<FamilyEvent[]> {
  const res = await fetch(`${BASE_URL}/family-events`);
  if (!res.ok) throw new Error('Failed to fetch family events');
  return res.json();
}

export async function createFamilyEvent(event: {
  personName: string;
  eventType: 'birthday' | 'anniversary' | 'custom';
  eventDate: string;
  windowDays?: number;
  notes?: string;
}): Promise<FamilyEvent> {
  const res = await fetch(`${BASE_URL}/family-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error('Failed to create family event');
  return res.json();
}

export async function deleteFamilyEvent(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/family-events/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete family event');
}

export async function syncFamilyAlbums(): Promise<Album[]> {
  const res = await fetch(`${BASE_URL}/family-events/sync`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to sync family albums');
  return res.json();
}

export async function deleteAlbum(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/albums/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete album');
}

export async function addAssetsToAlbum(albumId: string, assetIds: string[]): Promise<void> {
  const res = await fetch(`${BASE_URL}/albums/${albumId}/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetIds }),
  });
  if (!res.ok) throw new Error('Failed to add assets to album');
}

export async function removeAssetsFromAlbum(albumId: string, assetIds: string[]): Promise<void> {
  const res = await fetch(`${BASE_URL}/albums/${albumId}/assets`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetIds }),
  });
  if (!res.ok) throw new Error('Failed to remove assets from album');
}

// MARK: - iOS Device Management & Backup

export async function fetchDevices(): Promise<ConnectedDevice[]> {
  const res = await fetch(`${BASE_URL}/devices`);
  if (!res.ok) throw new Error('Failed to fetch connected devices');
  return res.json();
}

export async function startDeviceBackup(driveId: string, mediaType: string = 'all'): Promise<BackupSessionStatus> {
  const res = await fetch(`${BASE_URL}/devices/backup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driveId, mediaType }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to start device backup');
  }
  return data;
}

export async function fetchBackupStatus(): Promise<BackupSessionStatus> {
  const res = await fetch(`${BASE_URL}/devices/backup/status`);
  if (!res.ok) throw new Error('Failed to fetch backup status');
  return res.json();
}

// MARK: - Filesystem Browsing & Folder Picker

export async function browseDirectory(path?: string): Promise<BrowseDirectoryResponse> {
  const query = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await fetch(`${BASE_URL}/filesystem/browse${query}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to browse directory');
  }
  return res.json();
}

export async function pickFolderNative(): Promise<{ path: string | null }> {
  const res = await fetch(`${BASE_URL}/filesystem/pick-folder`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Failed to open native folder picker');
  }
  return res.json();
}



