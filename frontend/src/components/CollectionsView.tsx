import React, { useState } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  FolderClosed,
  Calendar,
  MapPin,
  Plane,
  Cake,
  Heart,
  Compass,
  ArrowRight,
  PartyPopper,
  Search
} from 'lucide-react';
import { useMediaStore } from '../store/useMediaStore';
import { Album, CollectionsMeta } from '../types';
import {
  deleteAlbum,
  autoGenerateCollections,
  fetchCollectionsMeta,
  createAlbum
} from '../services/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface CollectionsViewProps {
  albums: Album[];
}

type CollectionFilterTab = 'all' | 'events' | 'places' | 'trips' | 'years' | 'manual';

export const CollectionsView: React.FC<CollectionsViewProps> = ({ albums }) => {
  const {
    setSelectedAlbumId,
    setCreateAlbumOpen,
    setFamilyEventsModalOpen
  } = useMediaStore();

  const [activeFilterTab, setActiveFilterTab] = useState<CollectionFilterTab>('all');
  const [filterSearch, setFilterSearch] = useState('');

  const queryClient = useQueryClient();

  const { data: meta } = useQuery<CollectionsMeta>({
    queryKey: ['collections-meta'],
    queryFn: fetchCollectionsMeta,
  });

  const deleteAlbumMutation = useMutation({
    mutationFn: (id: string) => deleteAlbum(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] });
    },
  });

  const autoGenerateMutation = useMutation({
    mutationFn: autoGenerateCollections,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] });
      queryClient.invalidateQueries({ queryKey: ['collections-meta'] });
    },
  });

  // Categorize albums
  const parsedAlbums = React.useMemo(() => {
    return albums.map((album) => {
      let category = 'manual';
      let parsedRules: any = null;
      if (album.albumType === 'smart' && album.rulesJson) {
        try {
          parsedRules = JSON.parse(album.rulesJson);
          category = parsedRules.category || 'trip';
        } catch { }
      }
      return { ...album, category, parsedRules };
    });
  }, [albums]);

  const eventAlbums = parsedAlbums.filter(
    (a) => a.category === 'event' || a.parsedRules?.personName || a.parsedRules?.eventType
  );
  const tripAlbums = parsedAlbums.filter(
    (a) => a.category === 'trip' || a.category === 'custom'
  );
  const yearAlbums = parsedAlbums
    .filter((a) => a.category === 'year')
    .sort((a, b) => b.name.localeCompare(a.name));
  const manualAlbums = parsedAlbums.filter((a) => a.albumType === 'manual');

  // Country groups with nested cities from meta (or constructed from albums)
  const countryGroups = React.useMemo(() => {
    if (meta?.countryGroups && meta.countryGroups.length > 0) {
      return meta.countryGroups;
    }
    // Fallback if not populated in meta
    const map = new Map<string, { totalCount: number; cities: { name: string; count: number }[] }>();
    if (meta?.cities) {
      meta.cities.forEach((c) => {
        const country = c.country || 'Other';
        if (!map.has(country)) {
          map.set(country, { totalCount: 0, cities: [] });
        }
        const group = map.get(country)!;
        group.totalCount += c.count;
        group.cities.push({ name: c.name, count: c.count });
      });
    }
    return Array.from(map.entries()).map(([country, data]) => ({
      country,
      totalCount: data.totalCount,
      cities: data.cities,
    }));
  }, [meta]);

  const getCountryFlag = (country: string) => {
    const c = country.toLowerCase();
    if (c.includes('india')) return '🇮🇳';
    if (c.includes('singapore')) return '🇸🇬';
    if (c.includes('indonesia')) return '🇮🇩';
    if (c.includes('vietnam')) return '🇻🇳';
    if (c.includes('thailand')) return '🇹🇭';
    if (c.includes('united states') || c === 'usa' || c === 'us') return '🇺🇸';
    if (c.includes('united kingdom') || c === 'uk') return '🇬🇧';
    if (c.includes('japan')) return '🇯🇵';
    if (c.includes('france')) return '🇫🇷';
    if (c.includes('germany')) return '🇩🇪';
    if (c.includes('australia')) return '🇦🇺';
    if (c.includes('malaysia')) return '🇲🇾';
    if (c.includes('uae') || c.includes('emirates')) return '🇦🇪';
    return '🌍';
  };

  const handleOpenCity = async (cityName: string, countryName: string) => {
    const existing = albums.find((a) => {
      if (a.name.toLowerCase() === cityName.toLowerCase()) return true;
      if (a.rulesJson) {
        try {
          const r = JSON.parse(a.rulesJson);
          return r.city?.toLowerCase() === cityName.toLowerCase();
        } catch { }
      }
      return false;
    });

    if (existing) {
      setSelectedAlbumId(existing.id);
    } else {
      try {
        const newAlbum = await createAlbum(
          cityName,
          `Captured in ${cityName}, ${countryName}`,
          'smart',
          { category: 'city', city: cityName, country: countryName }
        );
        queryClient.invalidateQueries({ queryKey: ['albums'] });
        setSelectedAlbumId(newAlbum.id);
      } catch (err) {
        console.error('Failed to create city album:', err);
      }
    }
  };

  const handleOpenCountry = async (countryName: string) => {
    const existing = albums.find((a) => {
      if (a.name.toLowerCase() === countryName.toLowerCase()) return true;
      if (a.rulesJson) {
        try {
          const r = JSON.parse(a.rulesJson);
          return (
            r.category === 'country' &&
            r.country?.toLowerCase() === countryName.toLowerCase()
          );
        } catch { }
      }
      return false;
    });

    if (existing) {
      setSelectedAlbumId(existing.id);
    } else {
      try {
        const newAlbum = await createAlbum(
          countryName,
          `Photos and videos from ${countryName}`,
          'smart',
          { category: 'country', country: countryName }
        );
        queryClient.invalidateQueries({ queryKey: ['albums'] });
        setSelectedAlbumId(newAlbum.id);
      } catch (err) {
        console.error('Failed to create country album:', err);
      }
    }
  };

  const matchesSearch = (text?: string) => {
    if (!filterSearch.trim()) return true;
    if (!text) return false;
    return text.toLowerCase().includes(filterSearch.toLowerCase().trim());
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-950 text-slate-100 p-6 space-y-8 select-none">
      {/* Top Banner & Actions Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white">
              <Compass className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Collections & Albums
                <span className="text-xs font-mono font-normal text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full">
                  {albums.length} collections
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Organized by family celebrations, countries & cities, vacation trips, and years
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setFamilyEventsModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-pink-300 text-xs font-semibold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
            title="Define family birthdays & anniversaries to auto-collect memories every year"
          >
            <Cake className="w-4 h-4 text-pink-400" />
            <span>+ Birthday / Anniversary</span>
          </button>

          <button
            onClick={() => setCreateAlbumOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>+ New Trip / Collection</span>
          </button>

          <button
            onClick={() => autoGenerateMutation.mutate()}
            disabled={autoGenerateMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-200 text-xs font-medium transition-all"
            title="Auto-scan library for years, countries, cities & family milestones"
          >
            <Sparkles
              className={`w-4 h-4 text-amber-400 ${autoGenerateMutation.isPending ? 'animate-spin' : ''
                }`}
            />
            <span>
              {autoGenerateMutation.isPending ? 'Syncing...' : 'Auto-Generate'}
            </span>
          </button>
        </div>
      </div>

      {/* Sub-Filters & Quick Filter Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setActiveFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeFilterTab === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
          >
            All Collections ({albums.length})
          </button>

          <button
            onClick={() => setActiveFilterTab('events')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeFilterTab === 'events'
                ? 'bg-pink-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-pink-300 hover:bg-slate-800/60'
              }`}
          >
            <Cake className="w-3.5 h-3.5 text-pink-400" />
            <span>Family & Milestones ({eventAlbums.length})</span>
          </button>

          <button
            onClick={() => setActiveFilterTab('places')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeFilterTab === 'places'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800/60'
              }`}
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>Places ({countryGroups.length} Countries)</span>
          </button>

          <button
            onClick={() => setActiveFilterTab('trips')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeFilterTab === 'trips'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800/60'
              }`}
          >
            <Plane className="w-3.5 h-3.5 text-amber-400" />
            <span>Trips ({tripAlbums.length})</span>
          </button>

          <button
            onClick={() => setActiveFilterTab('years')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeFilterTab === 'years'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-indigo-300 hover:bg-slate-800/60'
              }`}
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span>Years ({yearAlbums.length})</span>
          </button>

          {manualAlbums.length > 0 && (
            <button
              onClick={() => setActiveFilterTab('manual')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeFilterTab === 'manual'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
            >
              <FolderClosed className="w-3.5 h-3.5 text-slate-400" />
              <span>Manual ({manualAlbums.length})</span>
            </button>
          )}
        </div>

        {/* Filter search bar */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Filter collections..."
            className="w-full bg-slate-900/80 border border-slate-800 focus:border-blue-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* 1. FAMILY & MILESTONES SECTION */}
      {(activeFilterTab === 'all' || activeFilterTab === 'events') && (
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-400">
                <Cake className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Family Milestones & Celebrations
                </h2>
                <p className="text-[11px] text-slate-400">
                  Birthdays & anniversaries automatically discovered across all years
                </p>
              </div>
            </div>
            <button
              onClick={() => setFamilyEventsModalOpen(true)}
              className="text-xs text-pink-400 hover:text-pink-300 font-medium flex items-center gap-1"
            >
              <span>Manage Milestones</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {eventAlbums.length === 0 ? (
            <div className="p-5 rounded-xl border border-dashed border-pink-500/30 bg-gradient-to-r from-pink-950/20 via-purple-950/10 to-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2 text-pink-300 text-xs font-semibold">
                  <PartyPopper className="w-4 h-4 text-pink-400" />
                  <span>Never miss a birthday or anniversary memory!</span>
                </div>
                <p className="text-xs text-slate-400">
                  Define your loved ones' birthdays or wedding anniversaries once. Media Manager will scan your entire photo archive and auto-generate albums for each year (e.g. 2022–2026) around those special days.
                </p>
              </div>
              <button
                onClick={() => setFamilyEventsModalOpen(true)}
                className="px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold shadow-md shadow-pink-500/20 transition-all flex items-center gap-1.5 flex-shrink-0"
              >
                <Cake className="w-4 h-4" />
                <span>+ Define Milestone</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {eventAlbums
                .filter((album) => matchesSearch(album.name) || matchesSearch(album.description))
                .map((album) => {
                  const isBirthday = album.parsedRules?.eventType === 'birthday';
                  const isAnniv = album.parsedRules?.eventType === 'anniversary';
                  return (
                    <div
                      key={album.id}
                      onClick={() => setSelectedAlbumId(album.id)}
                      className="group relative flex flex-col rounded-xl overflow-hidden border border-slate-800 bg-slate-900/60 hover:border-pink-500/50 hover:bg-slate-900 transition-all cursor-pointer shadow-sm hover:shadow-lg hover:shadow-pink-500/10"
                    >
                      {/* Album Cover Thumbnail */}
                      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-950 flex items-center justify-center">
                        {album.coverThumbnailUrl ? (
                          <img
                            src={album.coverThumbnailUrl}
                            alt={album.name}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-tr from-pink-900/40 via-purple-900/30 to-slate-900 flex items-center justify-center">
                            {isBirthday ? (
                              <Cake className="w-8 h-8 text-pink-400/80" />
                            ) : (
                              <Heart className="w-8 h-8 text-rose-400/80" />
                            )}
                          </div>
                        )}
                        {/* Event type badge */}
                        <div className="absolute top-2.5 left-2.5">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-md ${isBirthday
                                ? 'bg-pink-500/80 text-white border-pink-400/50'
                                : isAnniv
                                  ? 'bg-purple-600/80 text-white border-purple-400/50'
                                  : 'bg-amber-600/80 text-white border-amber-400/50'
                              }`}
                          >
                            {isBirthday ? '🎂 Birthday' : isAnniv ? '💍 Anniversary' : '🎉 Event'}
                          </span>
                        </div>
                        {/* Item count badge */}
                        <div className="absolute bottom-2.5 right-2.5">
                          <span className="text-[10px] font-mono bg-slate-900/80 backdrop-blur-md text-slate-200 px-2 py-0.5 rounded-md border border-slate-700/60">
                            {album.assetCount} items
                          </span>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-3.5 flex flex-col flex-1 justify-between gap-2">
                        <div>
                          <h3 className="text-xs font-semibold text-white group-hover:text-pink-300 transition-colors line-clamp-1">
                            {album.name}
                          </h3>
                          {album.description && (
                            <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                              {album.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] text-slate-500">
                          <span className="truncate">
                            {album.parsedRules?.startDate && album.parsedRules?.endDate
                              ? `${album.parsedRules.startDate} to ${album.parsedRules.endDate}`
                              : 'Annual Celebration'}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete celebration album "${album.name}"?`)) {
                                deleteAlbumMutation.mutate(album.id);
                              }
                            }}
                            className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                            title="Delete Album"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </section>
      )}

      {/* 2. PLACES SECTION (COUNTRIES WITH NESTED CITIES) */}
      {(activeFilterTab === 'all' || activeFilterTab === 'places') && (
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Places & Locations
                </h2>
                <p className="text-[11px] text-slate-400">
                  Countries with nested cities based on GPS coordinates
                </p>
              </div>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {countryGroups.length} Countries
            </span>
          </div>

          {countryGroups.length === 0 ? (
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 text-center text-xs text-slate-400">
              No GPS location data detected in media assets yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {countryGroups
                .filter(
                  (cg) =>
                    matchesSearch(cg.country) ||
                    cg.cities.some((c) => matchesSearch(c.name))
                )
                .map((cg) => {
                  const flag = getCountryFlag(cg.country);
                  return (
                    <div
                      key={cg.country}
                      className="group flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-emerald-500/40 transition-all shadow-sm"
                    >
                      {/* Country Card Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl leading-none">{flag}</span>
                          <div>
                            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                              {cg.country}
                            </h3>
                            <span className="text-[11px] text-emerald-400/90 font-mono">
                              {cg.totalCount.toLocaleString()} {cg.totalCount === 1 ? 'item' : 'items'}
                            </span>
                          </div>
                        </div>

                        {/* View all in country button */}
                        <button
                          onClick={() => handleOpenCountry(cg.country)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium transition-colors"
                          title={`View all photos from ${cg.country}`}
                        >
                          <span>Explore All</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Nested Cities List / Chips */}
                      <div className="pt-3 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                            <span>Cities ({cg.cities.length})</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {cg.cities
                              .filter((city) => matchesSearch(city.name) || matchesSearch(cg.country))
                              .map((city) => (
                                <button
                                  key={city.name}
                                  onClick={() => handleOpenCity(city.name, cg.country)}
                                  className="group/city flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/70 hover:bg-emerald-600 hover:text-white border border-slate-700/60 text-slate-300 text-xs transition-all hover:scale-[1.02] active:scale-[0.98]"
                                  title={`View ${city.count} photos in ${city.name}`}
                                >
                                  <MapPin className="w-3 h-3 text-emerald-400 group-hover/city:text-white" />
                                  <span className="font-medium">{city.name}</span>
                                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-900/60 group-hover/city:bg-emerald-700/60 text-slate-400 group-hover/city:text-white">
                                    {city.count}
                                  </span>
                                </button>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </section>
      )}

      {/* 3. TRIPS & CUSTOM QUERIES SECTION */}
      {(activeFilterTab === 'all' || activeFilterTab === 'trips') && tripAlbums.length > 0 && (
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Plane className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Trips & Custom Collections
                </h2>
                <p className="text-[11px] text-slate-400">
                  Smart collections curated by dates, destinations, or custom filters
                </p>
              </div>
            </div>
            <button
              onClick={() => setCreateAlbumOpen(true)}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
            >
              <span>+ New Trip</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {tripAlbums
              .filter((album) => matchesSearch(album.name) || matchesSearch(album.description))
              .map((album) => (
                <div
                  key={album.id}
                  onClick={() => setSelectedAlbumId(album.id)}
                  className="group relative flex flex-col rounded-xl overflow-hidden border border-slate-800 bg-slate-900/60 hover:border-amber-500/50 hover:bg-slate-900 transition-all cursor-pointer shadow-sm hover:shadow-lg hover:shadow-amber-500/10"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-950 flex items-center justify-center">
                    {album.coverThumbnailUrl ? (
                      <img
                        src={album.coverThumbnailUrl}
                        alt={album.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-tr from-amber-900/30 to-slate-900 flex items-center justify-center">
                        <Compass className="w-8 h-8 text-amber-400/80" />
                      </div>
                    )}
                    <div className="absolute top-2.5 left-2.5">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-md bg-amber-600/80 text-white border-amber-400/50">
                        ✈️ Trip
                      </span>
                    </div>
                    <div className="absolute bottom-2.5 right-2.5">
                      <span className="text-[10px] font-mono bg-slate-900/80 backdrop-blur-md text-slate-200 px-2 py-0.5 rounded-md border border-slate-700/60">
                        {album.assetCount} items
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 flex flex-col flex-1 justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-white group-hover:text-amber-300 transition-colors line-clamp-1">
                        {album.name}
                      </h3>
                      {album.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                          {album.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] text-slate-500">
                      <span className="truncate">
                        {album.parsedRules?.startDate && album.parsedRules?.endDate
                          ? `${album.parsedRules.startDate} – ${album.parsedRules.endDate}`
                          : album.parsedRules?.city || 'Custom Collection'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete trip collection "${album.name}"?`)) {
                            deleteAlbumMutation.mutate(album.id);
                          }
                        }}
                        className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Delete Collection"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* 4. YEARS SECTION */}
      {(activeFilterTab === 'all' || activeFilterTab === 'years') && yearAlbums.length > 0 && (
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Chronological Years
                </h2>
                <p className="text-[11px] text-slate-400">
                  Media grouped by capture year
                </p>
              </div>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {yearAlbums.length} Years
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3.5">
            {yearAlbums
              .filter((album) => matchesSearch(album.name))
              .map((album) => (
                <div
                  key={album.id}
                  onClick={() => setSelectedAlbumId(album.id)}
                  className="group relative flex flex-col rounded-xl overflow-hidden border border-slate-800 bg-slate-900/60 hover:border-indigo-500/50 hover:bg-slate-900 transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-slate-950 flex items-center justify-center">
                    {album.coverThumbnailUrl ? (
                      <img
                        src={album.coverThumbnailUrl}
                        alt={album.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-tr from-indigo-900/30 to-slate-900 flex items-center justify-center">
                        <Calendar className="w-6 h-6 text-indigo-400/80" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between">
                      <span className="text-base font-bold text-white tracking-tight">
                        {album.name}
                      </span>
                      <span className="text-[10px] font-mono bg-slate-900/80 backdrop-blur-md text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                        {album.assetCount}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* 5. MANUAL ALBUMS SECTION */}
      {(activeFilterTab === 'all' || activeFilterTab === 'manual') && manualAlbums.length > 0 && (
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                <FolderClosed className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Manual Albums
                </h2>
                <p className="text-[11px] text-slate-400">
                  Custom curated photo albums
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {manualAlbums
              .filter((album) => matchesSearch(album.name) || matchesSearch(album.description))
              .map((album) => (
                <div
                  key={album.id}
                  onClick={() => setSelectedAlbumId(album.id)}
                  className="group relative flex flex-col rounded-xl overflow-hidden border border-slate-800 bg-slate-900/60 hover:border-blue-500/50 hover:bg-slate-900 transition-all cursor-pointer shadow-sm"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-slate-950 flex items-center justify-center">
                    {album.coverThumbnailUrl ? (
                      <img
                        src={album.coverThumbnailUrl}
                        alt={album.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <FolderClosed className="w-8 h-8 text-slate-600" />
                    )}
                    <div className="absolute bottom-2 right-2">
                      <span className="text-[10px] font-mono bg-slate-900/80 backdrop-blur-md text-slate-300 px-1.5 py-0.5 rounded">
                        {album.assetCount} items
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-white truncate">
                      {album.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete manual album "${album.name}"?`)) {
                          deleteAlbumMutation.mutate(album.id);
                        }
                      }}
                      className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
};
