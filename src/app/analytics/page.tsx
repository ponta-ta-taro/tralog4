'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar
} from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMenus } from '@/services/menuService';
import { getWorkouts } from '@/services/workoutService';
import type { Menu, MenuType } from '@/types/menu';
import type { Workout, WorkoutExercise, ExerciseSet } from '@/types/workout';
import { format } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

interface ChartData {
  date: string;
  value: number;
}

interface WeeklyData {
  week: string;
  volume: number;
}

export default function AnalyticsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string>('');
  const [isMenusLoading, setIsMenusLoading] = useState(false);
  const [isWorkoutsLoading, setIsWorkoutsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuDataError, setMenuDataError] = useState<string | null>(null);
  const [weeklyDataError, setWeeklyDataError] = useState<string | null>(null);

  const MENU_TYPE_LABELS: Record<MenuType, string> = {
    weight: '重量',
    bodyweight: '自重',
    time: '時間',
    distance: '距離'
  };

  const Y_AXIS_LABELS: Record<MenuType, string> = {
    weight: '重量 (kg)',
    bodyweight: '回数',
    time: '時間 (秒)',
    distance: '距離 (km)'
  };

  const VOLUME_LABELS: Record<MenuType, string> = {
    weight: '総ボリューム (kg)',
    bodyweight: '総レップ数',
    time: '総時間 (秒)',
    distance: '総距離 (km)'
  };

  const TOOLTIP_TITLES: Record<MenuType, string> = {
    weight: '最大重量',
    bodyweight: '最大回数',
    time: '最大時間',
    distance: '最大距離'
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    const fetchMenusAndWorkouts = async () => {
      if (!user) {
        return;
      }

      setIsMenusLoading(true);
      setIsWorkoutsLoading(true);
      setError(null);
      setMenuDataError(null);
      setWeeklyDataError(null);

      try {
        const [fetchedMenus, fetchedWorkouts] = await Promise.all([
          getMenus(user.uid),
          getWorkouts(user.uid)
        ]);

        const sortedMenus = [...fetchedMenus].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setMenus(sortedMenus);
        setWorkouts(fetchedWorkouts);

        const defaultMenu = sortedMenus.find(menu => menu.name === 'ベンチプレス') || sortedMenus[0];
        setSelectedMenuId(defaultMenu?.id ?? '');
      } catch (err) {
        console.error('分析データの取得中にエラーが発生しました:', err);
        setError('分析データの取得に失敗しました。時間をおいて再度お試しください。');
      } finally {
        setIsMenusLoading(false);
        setIsWorkoutsLoading(false);
      }
    };

    fetchMenusAndWorkouts();
  }, [user]);

  const selectedMenu = useMemo(
    () => menus.find(menu => menu.id === selectedMenuId) ?? null,
    [menus, selectedMenuId]
  );

  const selectedMenuType: MenuType = selectedMenu?.type ?? 'weight';

  const weeklyChartData = useMemo<WeeklyData[]>(() => {
    if (!selectedMenu || workouts.length === 0) {
      return [];
    }

    try {
      const totalsByWeek = new Map<string, number>();

      workouts.forEach(workout => {
        const workoutDate = toDate(workout.date);
        if (!workoutDate) {
          return;
        }

        const weekStart = getWeekStart(workoutDate);
        const weekKey = weekStart.toISOString();
        const workoutVolume = computeWorkoutVolumeForMenu(workout, selectedMenu);
        if (workoutVolume <= 0) {
          return;
        }

        totalsByWeek.set(weekKey, (totalsByWeek.get(weekKey) ?? 0) + workoutVolume);
      });

      const sortedWeeks = Array.from(totalsByWeek.entries()).sort(
        (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
      );

      const recentFourWeeks = sortedWeeks.slice(-4);

      return recentFourWeeks.map(([weekStartIso, volume]) => {
        const startDate = new Date(weekStartIso);
        const endDate = getWeekEnd(startDate);
        return {
          week: `${format(startDate, 'M/d')} - ${format(endDate, 'M/d')}`,
          volume
        };
      });
    } catch (err) {
      console.error('週次ボリュームデータの整形中にエラー:', err);
      setWeeklyDataError('週次ボリュームの集計に失敗しました。');
      return [];
    }
  }, [workouts]);

  const chartData = useMemo<ChartData[]>(() => {
    if (!selectedMenu) {
      return [];
    }

    try {
      const groupedByDate = new Map<string, number>();

      workouts.forEach(workout => {
        const workoutDate = normalizeDate(workout.date);

        workout.exercises
          .filter(exercise => matchExercise(exercise, selectedMenu))
          .forEach(exercise => {
            const metricValue = calculateExerciseMetric(exercise, selectedMenuType);
            if (metricValue <= 0) {
              return;
            }

            const existing = groupedByDate.get(workoutDate);
            groupedByDate.set(workoutDate, Math.max(existing ?? 0, metricValue));
          });
      });

      const sortedDates = Array.from(groupedByDate.keys()).sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      );

      return sortedDates.map(dateKey => ({
        date: formatDateLabel(dateKey),
        value: groupedByDate.get(dateKey) ?? 0
      }));
    } catch (err) {
      console.error('グラフデータの整形中にエラー:', err);
      setMenuDataError('グラフ表示用のデータ整形に失敗しました。');
      return [];
    }
  }, [selectedMenu, workouts]);

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">トレーニング分析</h1>

      <Card>
        <CardHeader>
          <CardTitle>週間ボリューム推移</CardTitle>
          <CardDescription>直近4週間の総{MENU_TYPE_LABELS[selectedMenuType]}量を表示します。</CardDescription>
        </CardHeader>
        <CardContent>
          {isWorkoutsLoading ? (
            <div className="flex h-72 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>データを読み込んでいます...</span>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>エラー</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : weeklyDataError ? (
            <Alert variant="destructive">
              <AlertTitle>データ整形エラー</AlertTitle>
              <AlertDescription>{weeklyDataError}</AlertDescription>
            </Alert>
          ) : weeklyChartData.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center text-sm text-muted-foreground">
              <p>トレーニングデータがまだありません。</p>
              <p>トレーニングを記録すると週次ボリュームが表示されます。</p>
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyChartData} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" stroke="#475569" />
                  <YAxis
                    stroke="#475569"
                    width={100}
                    label={{ value: VOLUME_LABELS[selectedMenuType], angle: -90, position: 'insideLeft', offset: 10 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatValueByMenuType(value, selectedMenuType), '総量']}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                    cursor={{ strokeDasharray: '3 3' }}
                  />
                  <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-8 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>
                  {selectedMenu ? `${selectedMenu.name} の${MENU_TYPE_LABELS[selectedMenuType]}推移` : 'メニュー推移グラフ'}
                </CardTitle>
                <CardDescription>
                  トレーニング記録から日別の最大{MENU_TYPE_LABELS[selectedMenuType]}を集計しています。
                </CardDescription>
              </div>
              <Select
                value={selectedMenuId}
                onValueChange={value => setSelectedMenuId(value)}
                disabled={isMenusLoading || menus.length === 0}
              >
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder={isMenusLoading ? '読み込み中...' : 'メニューを選択'} />
                </SelectTrigger>
                <SelectContent>
                  {menus.map(menu => (
                    <SelectItem key={menu.id} value={menu.id}>
                      {menu.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {(isMenusLoading || isWorkoutsLoading) && (
              <div className="flex h-72 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>データを読み込んでいます...</span>
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="mt-2">
                <AlertTitle>エラー</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!isMenusLoading && !isWorkoutsLoading && !error && (
              <>
                {chartData.length === 0 ? (
                  <div className="flex h-72 flex-col items-center justify-center text-sm text-muted-foreground">
                    <p>選択したメニューのトレーニングデータが見つかりません。</p>
                    <p>メニューを変更するか、トレーニングを記録してください。</p>
                  </div>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" stroke="#475569" />
                        <YAxis
                          stroke="#475569"
                          width={100}
                          label={{ value: Y_AXIS_LABELS[selectedMenuType], angle: -90, position: 'insideLeft', offset: 10 }}
                        />
                        <Tooltip
                          formatter={(value: number) => [formatValueByMenuType(value, selectedMenuType), TOOLTIP_TITLES[selectedMenuType]]}
                          contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                          cursor={{ strokeDasharray: '3 3' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="hsl(var(--chart-1, var(--primary)))"
                          strokeWidth={2}
                          dot={{ r: 4, strokeWidth: 2, fill: 'hsl(var(--card))' }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {menuDataError && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTitle>データ整形エラー</AlertTitle>
                    <AlertDescription>{menuDataError}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function matchExercise(exercise: WorkoutExercise, menu: Menu) {
  return exercise.name === menu.name;
}

function calculateExerciseMetric(exercise: WorkoutExercise, menuType: MenuType): number {
  switch (menuType) {
    case 'bodyweight':
      return exercise.sets.reduce((max, set) => {
        const reps = Number(set.reps ?? 0);
        return Math.max(max, Number.isNaN(reps) ? 0 : reps);
      }, 0);
    case 'time':
      return exercise.sets.reduce((max, set) => {
        const seconds = Number(set.duration ?? set.time ?? 0);
        return Math.max(max, Number.isNaN(seconds) ? 0 : seconds);
      }, 0);
    case 'distance':
      return exercise.sets.reduce((max, set) => {
        const distance = Number(set.distance ?? 0);
        return Math.max(max, Number.isNaN(distance) ? 0 : distance);
      }, 0);
    case 'weight':
    default:
      return exercise.sets.reduce((max, set) => {
        const weight = Number(set.weight ?? 0);
        return Math.max(max, Number.isNaN(weight) ? 0 : weight);
      }, 0);
  }
}

function normalizeDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  return d.toISOString().split('T')[0];
}

function formatDateLabel(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }
    return format(date, 'M/d');
  } catch (error) {
    console.error('日付フォーマット中にエラーが発生しました:', error, dateString);
    return dateString;
  }
}

function computeVolumeForSets(sets: ExerciseSet[], menuType: MenuType): number {
  switch (menuType) {
    case 'bodyweight':
      return sets.reduce((total, set) => {
        const reps = Number(set.reps ?? 0);
        return total + (Number.isNaN(reps) ? 0 : reps);
      }, 0);
    case 'time':
      return sets.reduce((total, set) => {
        const seconds = Number(set.duration ?? set.time ?? 0);
        return total + (Number.isNaN(seconds) ? 0 : seconds);
      }, 0);
    case 'distance':
      return sets.reduce((total, set) => {
        const distance = Number(set.distance ?? 0);
        return total + (Number.isNaN(distance) ? 0 : distance);
      }, 0);
    case 'weight':
    default:
      return sets.reduce((total, set) => {
        const weight = Number(set.weight ?? 0);
        const reps = Number(set.reps ?? 0);
        if (!weight || !reps) {
          return total;
        }
        return total + weight * reps;
      }, 0);
  }
}

function computeWorkoutVolumeForMenu(workout: Workout, menu: Menu): number {
  return workout.exercises
    .filter(exercise => matchExercise(exercise, menu))
    .reduce((total, exercise) => total + computeVolumeForSets(exercise.sets, menu.type), 0);
}

function formatSecondsDisplay(seconds?: number): string {
  if (!seconds || Number.isNaN(seconds) || seconds <= 0) {
    return '-';
  }
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (minutes > 0 && remainder > 0) {
    return `${minutes}分${remainder}秒`;
  }
  if (minutes > 0) {
    return `${minutes}分`;
  }
  return `${remainder}秒`;
}

function formatValueByMenuType(value: number, menuType: MenuType): string {
  switch (menuType) {
    case 'bodyweight':
      return `${Math.round(value)}回`;
    case 'time':
      return formatSecondsDisplay(value);
    case 'distance':
      return `${Number(value.toFixed(2))}km`;
    case 'weight':
    default:
      return `${Number(value.toFixed(1))}kg`;
  }
}

function getWeekStart(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  return start;
}

function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return end;
}

function toDate(value: string | Date | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = typeof value === 'string' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
