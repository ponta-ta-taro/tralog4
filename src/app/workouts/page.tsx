'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getWorkouts } from '@/services/workoutService';
import { Workout } from '@/types/workout';

const toDateSafe = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    const converted = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (dateValue: unknown): string => {
  const date = toDateSafe(dateValue);
  if (!date) return '';
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
};

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Dumbbell, Calendar, Download } from 'lucide-react';
import { WorkoutCard } from '@/components/WorkoutCard';

export default function WorkoutsPage() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  // 展開状態などのUIステートは未使用のため削除

  // Calendar states
  const today = new Date();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth()); // 0-based
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay(); // 0: Sun
  const monthLabel = `${year}年${month + 1}月`;

  useEffect(() => {
    const fetchWorkouts = async () => {
      if (!user) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const userWorkouts = await getWorkouts(user.uid);
        setWorkouts(userWorkouts);
      } catch (err) {
        console.error('トレーニング履歴の取得に失敗しました:', err);
        setError('トレーニング履歴の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkouts();
  }, [user]);

  const handleExport = async () => {
    if (!user) {
      window.alert('エクスポートにはログインが必要です。');
      return;
    }

    setIsExporting(true);

    const escapeCsvValue = (value: string | number): string => {
      const stringValue = String(value ?? '').replace(/\r?\n|\r/g, ' ');
      if (stringValue.includes(',') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    try {
      const allWorkouts = await getWorkouts(user.uid);

      if (allWorkouts.length === 0) {
        window.alert('エクスポートできるトレーニングデータがありません。');
        setIsExporting(false);
        return;
      }

      const header = ['日付', 'メニュー', 'セット番号', '重量(kg)', '回数', 'ボリューム(kg)', 'メモ'];
      const rows: string[][] = [];

      allWorkouts.forEach(workout => {
        const workoutDate = formatDate(workout.date);
        const workoutRows: string[][] = [];

        workout.exercises.forEach(exercise => {
          exercise.sets.forEach((set, index) => {
            const isWeightExercise = exercise.type === 'weight';
            const weightValue = isWeightExercise ? Number(set.weight ?? 0) : NaN;
            const repsValue = isWeightExercise ? Number(set.reps ?? 0) : NaN;
            const volumeValue = !Number.isNaN(weightValue) && !Number.isNaN(repsValue) && weightValue > 0 && repsValue > 0
              ? weightValue * repsValue
              : NaN;

            workoutRows.push([
              workoutDate,
              exercise.name || '',
              String(index + 1),
              !Number.isNaN(weightValue) && weightValue > 0 ? String(weightValue) : '',
              !Number.isNaN(repsValue) && repsValue > 0 ? String(repsValue) : '',
              !Number.isNaN(volumeValue) && volumeValue > 0 ? String(volumeValue) : '',
              ''
            ]);
          });
        });

        if (workoutRows.length === 0) {
          workoutRows.push([workoutDate, '', '', '', '', '', '']);
        }

        if (workout.notes) {
          workoutRows[workoutRows.length - 1][6] = workout.notes;
        }

        rows.push(...workoutRows);
      });

      if (rows.length === 0) {
        window.alert('エクスポートできるセットデータがありません。');
        setIsExporting(false);
        return;
      }

      const csvLines = [header, ...rows].map(line => line.map(escapeCsvValue).join(','));
      const csvContent = csvLines.join('\r\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const downloadUrl = URL.createObjectURL(blob);
      const now = new Date();
      const fileName = `tralog4_export_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.csv`;

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      window.alert('CSVのダウンロードを開始しました。');
    } catch (err) {
      console.error('CSVエクスポート中にエラーが発生しました:', err);
      window.alert('CSVエクスポート中にエラーが発生しました。時間をおいて再度お試しください。');
    } finally {
      setIsExporting(false);
    }
  };

  const getDateKey = (value: unknown): string => {
    const date = toDateSafe(value);
    if (!date) return 'unknown';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDayHeader = (isoDate: string): string => {
    const date = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return '日付未設定';
    }
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  };

  // 未使用のユーティリティは削除

  // 日付でグループ化
  const workoutsByDate = workouts.reduce<Record<string, Workout[]>>((acc, workout) => {
    const dateKey = getDateKey(workout.date);

    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(workout);
    return acc;
  }, {});

  const handleDayClick = (dateObj: Date) => {
    const key = getDateKey(dateObj);
    const el = document.getElementById(`day-${key}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 日付順にソート
  const sortedDates = Object.keys(workoutsByDate).sort((a, b) => {
    const aDate = new Date(`${a}T00:00:00`).getTime();
    const bDate = new Date(`${b}T00:00:00`).getTime();
    return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
  });

  // ローディングスケルトン
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">トレーニング履歴</h1>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-4 py-6">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </CardContent>
              <CardFooter>
                <Skeleton className="h-4 w-20" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">トレーニング履歴</h1>
        <div className="flex w-full sm:w-auto items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download size={18} className="mr-2" />
            {isExporting ? 'エクスポート中...' : 'CSVエクスポート'}
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/workouts/new" className="flex items-center gap-2">
              <Plus size={18} />
              新しい記録
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Calendar Section */}
      <div className="mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">📅 カレンダー</h2>
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
              const has = Boolean(workoutsByDate[key]?.length);
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
      </div>

      {sortedDates.length === 0 ? (
        <div className="text-center py-12">
          <Dumbbell className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">トレーニング記録がありません</h3>
          <p className="text-gray-500 mb-6">新しいトレーニングを記録しましょう！</p>
          <Button asChild>
            <Link href="/workouts/new" className="flex items-center gap-2 mx-auto">
              <Plus size={18} />
              トレーニングを記録する
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedDates.map(date => {
            const dayWorkouts = workoutsByDate[date];
            return (
              <div key={date} id={`day-${date}`} className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 text-gray-900">
                    <Calendar className="h-5 w-5 text-gray-500" />
                    <h2 className="text-lg font-semibold">
                      {formatDayHeader(date)}
                    </h2>
                  </div>
                </div>

                <div className="space-y-4 border-l border-gray-200 pl-4">
                  {dayWorkouts.map(workout => (
                    <div key={workout.id}>
                      <WorkoutCard workout={workout} showEditButton={true} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
