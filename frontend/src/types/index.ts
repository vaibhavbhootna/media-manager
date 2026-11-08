export type DriveStatus = 'connected' | 'disconnected' | 'conflict_detected' | 'rebuilding';

export interface Drive {
  id: string; // Permanent UUID
  driveName: string;
  volumeUuid?: string;
  mountPath?: string;
  filesystemType?: string;
  totalCapacity: number;
  availableCapacity: number;
  status: DriveStatus;
  lastConnected: string;
  createdAt: string;
  assetCount?: number;
}

export type MediaType = 'photo' | 'video' | 'raw' | 'live_photo';
export type AvailabilityStatus = 'available' | 'offline' | 'missing';

export interface Asset {
  id: string;
  driveId: string;
  driveName?: string;
  originalFilename: string;
  relativePath: string;
  fileExtension: string;
  mediaType: MediaType;
  mimeType: string;
  fileSize: number;
  checksum?: string;
  dateTaken?: string;
  dateImported: string;
  modifiedAt?: string;
  width: number;
  height: number;
  duration?: number; // Video length in seconds
  latitude?: number;
  longitude?: number;
  altitude?: number;
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  iso?: number;
  focalLength?: number;
  aperture?: number;
  shutterSpeed?: string;
  isFavorite: boolean;
  thumbnailPath?: string;
  previewPath?: string;
  availabilityStatus: AvailabilityStatus;
  city?: string;
  state?: string;
  country?: string;
  placeName?: string;
}

export type AlbumType = 'manual' | 'smart';

export interface SmartAlbumRules {
  category?: 'year' | 'country' | 'city' | 'trip' | 'event' | 'custom';
  year?: number;
  country?: string;
  city?: string;
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
  mediaType?: MediaType;
  isFavorite?: boolean;
  eventType?: string;
  personName?: string;
}

export interface Album {
  id: string;
  name: string;
  description?: string;
  coverAssetId?: string;
  coverThumbnailUrl?: string;
  albumType: AlbumType;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
  rulesJson?: string;
}

export interface FamilyEvent {
  id: string;
  personName: string;
  eventType: 'birthday' | 'anniversary' | 'custom';
  eventDate: string; // "MM-DD" e.g. "11-24" or "YYYY-MM-DD"
  windowDays: number;
  notes?: string;
  createdAt: string;
}

export interface CountryGroup {
  country: string;
  totalCount: number;
  cities: { name: string; country?: string; count: number }[];
}

export interface CollectionsMeta {
  years: number[];
  countries: { name: string; count: number }[];
  cities: { name: string; country?: string; count: number }[];
  countryGroups?: CountryGroup[];
}

export interface ConnectedDevice {
  udid: string;
  name: string;
  model: string;
  productType?: string;
  iosVersion?: string;
  isTrusted: boolean;
  batteryLevel?: number;
}

export interface BackupSessionStatus {
  status: 'idle' | 'running' | 'completed' | 'failed';
  targetDriveId?: string;
  targetDriveName?: string;
  currentStep?: string;
  currentFile?: string;
  progressPercent: number;
  logs: string[];
  error?: string;
}

export interface ImportProgress {
  sessionId: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  currentFile?: string;
  completedFiles: number;
  totalFiles: number;
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
}

export interface SystemHealth {
  status: string;
  version: string;
  databasePath: string;
  storagePath: string;
  connectedDrivesCount: number;
  totalDrivesCount: number;
  totalAssetsCount: number;
  uptimeSeconds: number;
}

export interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isVolume: boolean;
  totalCapacity?: number;
  availableCapacity?: number;
  hasMediaToken: boolean;
  subfolderCount?: number;
}

export interface QuickLocation {
  name: string;
  path: string;
}

export interface BrowseDirectoryResponse {
  currentPath: string;
  parentPath: string | null;
  items: DirectoryItem[];
  quickLocations: QuickLocation[];
}


