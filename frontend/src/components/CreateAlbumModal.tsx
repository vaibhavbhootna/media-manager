import React, { useState } from 'react';
import {
  X,
  FolderPlus,
  Compass,
  Calendar,
  MapPin,
  Sparkles,
  Search,
  Info,
  Filter
} from 'lucide-react';
import { useMediaStore } from '../store/useMediaStore';
import { createAlbum, fetchCollectionsMeta, fetchAssets } from '../services/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SmartAlbumRules } from '../types';

export const CreateAlbumModal: React.FC = () => {
  const { isCreateAlbumOpen, setCreateAlbumOpen, setSelectedAlbumId } = useMediaStore();
  const [mode, setMode] = useState<'smart' | 'manual'>('smart');

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaType, setMediaType] = useState<'all' | 'photo' | 'video'>('all');
  const [isFavorite, setIsFavorite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Load available locations & years for helper dropdowns
  const { data: meta } = useQuery({
    queryKey: ['collections-meta'],
    queryFn: fetchCollectionsMeta,
    enabled: isCreateAlbumOpen,
  });

  // Filter cities by selected country if selected
  const availableCities = React.useMemo(() => {
    if (!meta?.cities) return [];
    if (!country) return meta.cities;
    return meta.cities.filter((c) => c.country?.toLowerCase() === country.toLowerCase());
  }, [meta, country]);

  // Live match counter
  const { data: previewData, isFetching: isCheckingPreview } = useQuery({
    queryKey: ['preview-count', startDate, endDate, country, city, searchQuery, mediaType, isFavorite],
    queryFn: () =>
      fetchAssets({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        country: country || undefined,
        city: city || undefined,
        q: searchQuery || undefined,
        mediaType: mediaType !== 'all' ? mediaType : undefined,
        isFavorite: isFavorite ? true : undefined,
        limit: 1,
      }),
    enabled: isCreateAlbumOpen && mode === 'smart',
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (mode === 'smart') {
        const rules: SmartAlbumRules = {
          category: 'trip',
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          country: country || undefined,
          city: city || undefined,
          searchQuery: searchQuery.trim() || undefined,
          mediaType: mediaType !== 'all' ? (mediaType as any) : undefined,
          isFavorite: isFavorite ? true : undefined,
        };
        return createAlbum(name.trim(), description.trim() || undefined, 'smart', rules);
      } else {
        return createAlbum(name.trim(), description.trim() || undefined, 'manual');
      }
    },
    onSuccess: (newAlbum) => {
      queryClient.invalidateQueries({ queryKey: ['albums'] });
      setSelectedAlbumId(newAlbum.id);
      setCreateAlbumOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to create collection');
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    setCountry('');
    setCity('');
    setSearchQuery('');
    setMediaType('all');
    setIsFavorite(false);
    setError(null);
  };

  if (!isCreateAlbumOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Collection name is required');
      return;
    }
    setError(null);
    createMutation.mutate();
  };

  const handleApplyPreset = (year: number) => {
    setStartDate(`${year}-01-01`);
    setEndDate(`${year}-12-31`);
    if (!name) setName(`Trip ${year}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              mode === 'smart'
                ? 'bg-gradient-to-tr from-sky-500/20 to-blue-500/20 border border-sky-500/30 text-sky-400'
                : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
            }`}>
              {mode === 'smart' ? <Compass className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">
                {mode === 'smart' ? 'New Trip & Smart Collection' : 'New Manual Album'}
              </h3>
              <p className="text-[11px] text-slate-400 font-normal">
                {mode === 'smart'
                  ? 'Dynamic query: automatically groups photos by trip dates & places'
                  : 'Manually select and drag photos into this virtual album'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setCreateAlbumOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 p-1 gap-1">
          <button
            type="button"
            onClick={() => setMode('smart')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
              mode === 'smart'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Trip / Smart Query</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
              mode === 'manual'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Manual Album</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* Collection Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Collection Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'smart' ? 'e.g. Bintan Island Trip 2022, Mathura Visit' : 'e.g. Best Portraits, Favorites'}
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
              autoFocus
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Summer vacation with family"
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          {/* Smart Query Controls (Only for Smart Mode) */}
          {mode === 'smart' && (
            <div className="space-y-3.5 pt-1">
              <div className="border-t border-slate-800/80 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    <span>Trip Date Range</span>
                  </label>
                  {/* Quick Year Presets */}
                  {meta?.years && meta.years.length > 0 && (
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="text-slate-400">Presets:</span>
                      {meta.years.slice(0, 3).map((yr) => (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => handleApplyPreset(yr)}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                          {yr}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <span className="text-[11px] text-slate-400 mb-1 block">Start Date</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 mb-1 block">End Date</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Location Controls */}
              <div className="border-t border-slate-800/80 pt-3">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
                  <MapPin className="w-3.5 h-3.5 text-rose-400" />
                  <span>Location Criteria</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <span className="text-[11px] text-slate-400 mb-1 block">Country</span>
                    <select
                      value={country}
                      onChange={(e) => {
                        setCountry(e.target.value);
                        setCity('');
                      }}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    >
                      <option value="">Any Country</option>
                      {meta?.countries.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name} ({c.count})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 mb-1 block">City</span>
                    <select
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    >
                      <option value="">Any City</option>
                      {availableCities.map((ct) => (
                        <option key={ct.name} value={ct.name}>
                          {ct.name} ({ct.count})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Additional Query Filters */}
              <div className="border-t border-slate-800/80 pt-3 space-y-2.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Filter className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Optional Search Filters</span>
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Keywords (e.g. food, beach, sunset, Sony, iPhone)"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[11px]">Type:</span>
                    {(['all', 'photo', 'video'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMediaType(t)}
                        className={`px-2 py-0.5 rounded text-[11px] capitalize transition-colors ${
                          mediaType === t
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'bg-slate-800/60 text-slate-400 hover:text-white'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={isFavorite}
                      onChange={(e) => setIsFavorite(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span className="text-[11px]">Favorites only</span>
                  </label>
                </div>
              </div>

              {/* Live Matching Asset Count Indicator */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
                  <div>
                    <p className="text-xs font-semibold text-blue-200">
                      {isCheckingPreview ? (
                        'Calculating matches...'
                      ) : (
                        `${previewData?.total || 0} media assets match this criteria`
                      )}
                    </p>
                    <p className="text-[10px] text-blue-300/70">
                      Automatically aggregates now and updates when new backups are added.
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-xs font-bold">
                    {previewData?.total || 0}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Safety Information Note */}
          <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/60 flex items-start gap-2 text-xs text-slate-400">
            <Info className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Safe read-only collection: Queries files via SQLite metadata. Original files on your external drives are never modified or deleted.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setCreateAlbumOpen(false)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {createMutation.isPending ? (
                'Creating...'
              ) : mode === 'smart' ? (
                <>
                  <Compass className="w-3.5 h-3.5" />
                  <span>Create Smart Collection</span>
                </>
              ) : (
                <>
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Create Album</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
