'use client';

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/workouts');
  return null;
}
/*
'use client';

import { useEffect, useMemo, useState } from 'react';
import { getWorkouts } from '@/services/workoutService';
import { useAuth } from '@/contexts/AuthContext';
import type { Workout } from '@/types/workout';

const toDateSafe = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    const converted = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  const d = new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
};

const getDateKey = (value: unknown): string => {
  const date = toDateSafe(value);
  if (!date) return 'unknown';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatSeconds = (totalSeconds?: number): string => {
  if (!totalSeconds || totalSeconds <= 0) return '0秒';
  const s = Math.round(totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m > 0 && r > 0) return `${m}分${r}秒`;
  if (m > 0) return `${m}分`;
  return `${r}秒`;
};

export default function CalendarPage() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedWorkouts, setSelectedWorkouts] = useState<Workout[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const data = await getWorkouts(user.uid);
        setWorkouts(data);
      } catch (e) {
        console.error('カレンダー用ワークアウト取得エラー:', e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user]);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based

  const firstOfMonth = useMemo(() => new Date(year, month, 1), [year, month]);
  const daysInMonth = useMemo(() => new Date(year, month + 1, 0).getDate(), [year, month]);
  const startWeekday = useMemo(() => firstOfMonth.getDay(), [firstOfMonth]); // 0: Sun

  const workoutsByDay = useMemo(() => {
    const map = new Map<string, Workout[]>();
    workouts.forEach(w => {
      const key = getDateKey(w.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    });
    return map;
  }, [workouts]);

  const handleDayClick = (dateObj: Date) => {
    const key = getDateKey(dateObj);
    const list = workoutsByDay.get(key) ?? [];
    setSelectedDate(dateObj);
    setSelectedWorkouts(list);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedDate(null);
    setSelectedWorkouts([]);
  };

  const monthLabel = `${year}年${month + 1}月`;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">カレンダー</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1 rounded border text-sm hover:bg-gray-50"
            onClick={() => {
              const m = month - 1;
              if (m < 0) {
                setYear(y => y - 1);
                setMonth(11);
              } else {
                setMonth(m);
              }
            }}
          >
            ‹ 前の月
          </button>
          <div className="text-sm text-gray-700 min-w-[8rem] text-center">{monthLabel}</div>
          <button
            type="button"
            className="px-3 py-1 rounded border text-sm hover:bg-gray-50"
            onClick={() => {
              const m = month + 1;
              if (m > 11) {
                setYear(y => y + 1);
                setMonth(0);
              } else {
                setMonth(m);
              }
            }}
          >
            次の月 ›
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500">読み込み中...</div>
      ) : (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500">
            {['日','月','火','水','木','金','土'].map(d => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startWeekday }).map((_, i) => (
              <div key={`blank-${i}`} className="h-20" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateObj = new Date(year, month, dayNum);
              const key = getDateKey(dateObj);
              const has = workoutsByDay.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleDayClick(dateObj)}
                  className={`h-20 rounded border flex flex-col items-center justify-start p-1 text-sm hover:bg-gray-50 transition-colors ${has ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
                >
                  <span className="text-gray-700">{dayNum}</span>
                  {has && (
                    <span className="mt-1 inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px]">
                      記録あり
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={closeModal}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative z-10 w-full max-w-xl bg-white rounded-lg shadow-lg p-4 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">
                📅 {selectedDate ? `${selectedDate.getFullYear()}年${String(selectedDate.getMonth() + 1).padStart(2, '0')}月${String(selectedDate.getDate()).padStart(2, '0')}日` : ''} のトレーニング
              </h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700 text-xl"
                onClick={closeModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {selectedWorkouts.length === 0 ? (
              <p className="text-sm text-gray-600">この日はトレーニングが記録されていません</p>
            ) : (
              <div className="space-y-6">
                {selectedWorkouts.map(w => (
                  <div key={w.id} className="border rounded-md p-3">
                    <div className="space-y-1 text-sm text-gray-700">
                      <p>⏱️ トレーニング時間: {w.duration ?? 0}分</p>
                      <p>🔥 ウォームアップ: {formatSeconds((w as any).warmupDuration as number)}</p>
                      <p>❄️ クールダウン: {formatSeconds((w as any).cooldownDuration as number)}</p>
                    </div>
                    <div className="mt-3">
                      <p className="font-medium text-gray-800 mb-2">実施メニュー</p>
                      <ul className="ml-4 list-disc space-y-2">
                        {w.exercises.map((ex, idx) => {
                          const category = (ex as any).category || '-';
                          const type = (ex as any).menuType || ex.type;
                          const volume = ex.sets.reduce((sum, s) => {
                            if (type === 'weight') {
                              return sum + (Number(s.weight || 0) * Number(s.reps || 0));
                            }
                            return sum;
                          }, 0);
                          return (
                            <li key={`${ex.id}-${idx}`} className="text-sm text-gray-700">
                              <div>• {ex.name} ({category})</div>
                              {typeof (ex as any).durationSeconds === 'number' && (ex as any).durationSeconds > 0 && (
                                <div className="text-gray-700 mt-0.5">所要時間　{formatSeconds((ex as any).durationSeconds as number)}</div>
                              )}
                              <ul className="ml-5 mt-1 space-y-1">
                                {ex.sets.map((s, i) => (
                                  <li key={`${ex.id}-set-${i}`}>
                                    {type === 'weight' && (
                                      <span> - {Number(s.weight || 0)}kg × {Number(s.reps || 0)}回</span>
                                    )}
                                    {type === 'bodyweight' && (
                                      <span> - {Number(s.reps || 0)}回</span>
                                    )}
                                    {type === 'time' && (
                                      <span> - {Number(s.duration ?? s.time ?? 0)}秒</span>
                                    )}
                                    {type === 'distance' && (
                                      <span> - {Number((s.distance ?? 0) as number)}km</span>
                                    )}
                                  </li>
                                ))}
                                {type === 'weight' && (
                                  <li className="font-medium text-gray-800">  合計: {Math.round(volume).toLocaleString()} kg</li>
                                )}
                              </ul>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
