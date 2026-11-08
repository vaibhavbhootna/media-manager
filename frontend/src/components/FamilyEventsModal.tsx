import React, { useState } from 'react';
import {
  X,
  Cake,
  HeartHandshake,
  Calendar,
  Sparkles,
  Trash2,
  Plus,
  Info,
  PartyPopper
} from 'lucide-react';
import { useMediaStore } from '../store/useMediaStore';
import { fetchFamilyEvents, createFamilyEvent, deleteFamilyEvent, syncFamilyAlbums } from '../services/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const FamilyEventsModal: React.FC = () => {
  const { isFamilyEventsModalOpen, setFamilyEventsModalOpen } = useMediaStore();
  const [personName, setPersonName] = useState('');
  const [eventType, setEventType] = useState<'birthday' | 'anniversary' | 'custom'>('birthday');
  const [eventDate, setEventDate] = useState(''); // "YYYY-MM-DD" or "MM-DD"
  const [windowDays, setWindowDays] = useState(1);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['family-events'],
    queryFn: fetchFamilyEvents,
    enabled: isFamilyEventsModalOpen,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      // Normalize date to MM-DD or preserve YYYY-MM-DD
      const dateParts = eventDate.split('-');
      const normalizedDate = dateParts.length === 3 ? `${dateParts[1]}-${dateParts[2]}` : eventDate;

      return createFamilyEvent({
        personName: personName.trim(),
        eventType,
        eventDate: normalizedDate,
        windowDays,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-events'] });
      queryClient.invalidateQueries({ queryKey: ['albums'] });
      setPersonName('');
      setEventDate('');
      setNotes('');
      setError(null);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to save family milestone');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFamilyEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-events'] });
      queryClient.invalidateQueries({ queryKey: ['albums'] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: syncFamilyAlbums,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] });
    },
  });

  if (!isFamilyEventsModalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personName.trim()) {
      setError('Person / Family member name is required');
      return;
    }
    if (!eventDate) {
      setError('Event date is required');
      return;
    }
    setError(null);
    createMutation.mutate();
  };

  const formatEventDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 2) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const m = parseInt(parts[0], 10);
      const d = parseInt(parts[1], 10);
      return `${monthNames[m - 1] || parts[0]} ${d}`;
    }
    return dateStr;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
              <Cake className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">
                Family Milestones & Celebrations
              </h3>
              <p className="text-[11px] text-slate-400 font-normal">
                Define birthdays & anniversaries to auto-create albums every year
              </p>
            </div>
          </div>
          <button
            onClick={() => setFamilyEventsModalOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Add New Milestone Form */}
          <form onSubmit={handleSubmit} className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-pink-400" />
                <span>Add Birthday or Anniversary</span>
              </span>
              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setEventType('birthday')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${eventType === 'birthday' ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  <Cake className="w-3 h-3" />
                  <span>Birthday</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEventType('anniversary')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${eventType === 'anniversary' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  <HeartHandshake className="w-3 h-3" />
                  <span>Anniversary</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEventType('custom')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${eventType === 'custom' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  <PartyPopper className="w-3 h-3" />
                  <span>Other</span>
                </button>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Person / Couple Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  placeholder="e.g. Gunjan, Mom, Dad, Priya"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-pink-500 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Celebration Date <span className="text-rose-400">*</span>
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-pink-500 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none font-mono"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Capture Window (Days)
                </label>
                <select
                  value={windowDays}
                  onChange={(e) => setWindowDays(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-pink-500 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value={0}>Exact Day only</option>
                  <option value={1}>±1 Day (Eve, Day, Next day)</option>
                  <option value={2}>±2 Days (Celebration weekend)</option>
                  <option value={3}>±3 Days (Full party week)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Family dinner, cake celebration"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-pink-500 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{createMutation.isPending ? 'Saving & Scanning...' : 'Save & Auto-Create Albums'}</span>
              </button>
            </div>
          </form>

          {/* List of Defined Milestones */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-slate-300">
                Defined Family Milestones ({events.length})
              </span>
              {events.length > 0 && (
                <button
                  type="button"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                  className="text-[11px] text-pink-400 hover:text-pink-300 flex items-center gap-1 transition-colors"
                >
                  <Sparkles className={`w-3 h-3 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                  <span>{syncMutation.isPending ? 'Scanning...' : 'Re-scan Library Years'}</span>
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="p-4 text-center text-xs text-slate-500">Loading family dates...</div>
            ) : events.length === 0 ? (
              <div className="p-5 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500 space-y-1">
                <Cake className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                <p className="font-medium text-slate-400">No birthdays or anniversaries defined yet.</p>
                <p className="text-[11px] text-slate-500">
                  Add birthdays above. Media Manager will scan your entire photo archive across 2022–2026 and automatically create birthday albums for every year!
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:border-slate-700/60 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 flex-shrink-0">
                        {ev.eventType === 'birthday' ? (
                          <Cake className="w-4 h-4" />
                        ) : ev.eventType === 'anniversary' ? (
                          <HeartHandshake className="w-4 h-4" />
                        ) : (
                          <PartyPopper className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-semibold text-white">{ev.personName}</h4>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-300 font-medium capitalize">
                            {ev.eventType}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          <span>{formatEventDate(ev.eventDate)}</span>
                          <span className="text-slate-600">•</span>
                          <span>±{ev.windowDays} day window</span>
                          {ev.notes && (
                            <>
                              <span className="text-slate-600">•</span>
                              <span className="italic">{ev.notes}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (confirm(`Remove milestone for "${ev.personName}" and its generated albums?`)) {
                          deleteMutation.mutate(ev.id);
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                      title="Delete milestone"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-950/80 rounded-lg p-2.5 border border-slate-800/80 flex items-start gap-2 text-xs text-slate-400">
            <Info className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              When added, Media Manager searches every year in your library (2022–2026) for photos taken around that date and automatically generates an album like <span className="text-slate-200">"Gunjan's Birthday 2024"</span> without duplicating any files.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 flex justify-end bg-slate-900/90">
          <button
            type="button"
            onClick={() => setFamilyEventsModalOpen(false)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
