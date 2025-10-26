'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { verifyShare, getShare, type ShareRecord } from '@/services/shareService';
import { getWorkouts } from '@/services/workoutService';
import type { Workout, WorkoutExercise } from '@/types/workout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Lock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line
} from 'recharts';
import { format } from 'date-fns';

export default function ShareAccessPage() {
  const params = useParams();
  const shareId = typeof params?.shareId === 'string' ? params.shareId : Array.isArray(params?.shareId) ? params.shareId[0] : '';

  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareRecord, setShareRecord] = useState<ShareRecord | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [isWorkoutsLoading, setIsWorkoutsLoading] = useState(false);
  const [workoutsError, setWorkoutsError] = useState<string | null>(null);
  const [selectedMenu, setSelectedMenu] = useState<string>('');
  const [weeklyDataError, setWeeklyDataError] = useState<string | null>(null);
  const [menuDataError, setMenuDataError] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      if (!shareId) {
        setError('共有リンクが無効です。');
        setIsLoading(false);
        return;
      }
      try {
        const share = await getShare(shareId);
        if (!share) {
          setError('共有リンクが見つかりません。');
        } else if (!share.isActive) {
          setError('この共有リンクは無効化されています。');
        } else if (share.expiresAt < new Date()) {
          setError('このリンクは有効期限切れです。');
        } else {
          setShareRecord(share);
        }
      } catch (err) {
        console.error('共有リンクの検証中にエラーが発生しました:', err);
        setError('共有リンクの読み込みに失敗しました。時間をおいて再度お試しください。');
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [shareId]);

  const expiresLabel = useMemo(() => {
    if (!shareRecord?.expiresAt) return '';
    return shareRecord.expiresAt.toLocaleDateString('ja-JP');
  }, [shareRecord]);

  const formatDateLabel = (value: unknown): string => {
    const date = value instanceof Date ? value : new Date(value as string | number);
    if (Number.isNaN(date.getTime())) {
      return '不明な日付';
    }
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    });
  };

  const formatTime = (value: unknown): string => {
    const date = value instanceof Date ? value : new Date(value as string | number);
    if (Number.isNaN(date.getTime())) {
      return '--:--';
    }
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes || minutes <= 0) return '-';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours > 0 && rest > 0) return `${hours}時間${rest}分`;
    if (hours > 0) return `${hours}時間`;
    return `${rest}分`;
  };

  const calculateVolume = (workout: Workout) => {
    return workout.exercises?.reduce((total, exercise) => {
      const exerciseVolume = exercise.sets?.reduce((sum, set) => {
        const weight = Number(set.weight ?? 0);
        const reps = Number(set.reps ?? 0);
        if (!weight || !reps) {
          return sum;
        }
        return sum + weight * reps;
      }, 0) ?? 0;
      return total + exerciseVolume;
    }, 0) ?? 0;
  };

  useEffect(() => {
    if (!isAuthenticated || !shareRecord?.userId) {
      return;
    }

    const fetchWorkouts = async () => {
      setIsWorkoutsLoading(true);
      setWorkoutsError(null);
      try {
        const records = await getWorkouts(shareRecord.userId);
        setWorkouts(records);
      } catch (err) {
        console.error('共有データの読み込みに失敗しました:', err);
        setWorkoutsError('トレーニングデータの読み込みに失敗しました。時間をおいて再度お試しください。');
      } finally {
        setIsWorkoutsLoading(false);
      }
    };

    fetchWorkouts();
  }, [isAuthenticated, shareRecord?.userId]);

  const groupedWorkouts = useMemo(() => {
    if (!workouts.length) {
      return [] as { dateKey: string; displayDate: string; items: Workout[] }[];
    }

    const groups = workouts.reduce((acc, workout) => {
      const dateKey = typeof workout.date === 'string' ? workout.date.slice(0, 10) : new Date(workout.date as unknown as string).toISOString().slice(0, 10);
      if (!acc[dateKey]) {
        acc[dateKey] = {
          dateKey,
          displayDate: formatDateLabel(workout.date),
          items: [] as Workout[]
        };
      }
      acc[dateKey].items.push(workout);
      return acc;
    }, {} as Record<string, { dateKey: string; displayDate: string; items: Workout[] }>);

    return Object.values(groups).sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
  }, [workouts]);

  const menuOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    workouts.forEach(workout => {
      workout.exercises?.forEach(exercise => {
        if (exercise?.name && !seen.has(exercise.name)) {
          seen.add(exercise.name);
          options.push(exercise.name);
        }
      });
    });
    return options;
  }, [workouts]);

  useEffect(() => {
    if (menuOptions.length === 0) {
      setSelectedMenu('');
      return;
    }

    if (!selectedMenu || !menuOptions.includes(selectedMenu)) {
      setSelectedMenu(menuOptions[0]);
    }
  }, [menuOptions, selectedMenu]);

  const weeklyChartData = useMemo(() => {
    if (workouts.length === 0) {
      return [] as { week: string; volume: number }[];
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
        const workoutVolume = calculateWorkoutVolume(workout);

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

  const menuWeightChartData = useMemo(() => {
    if (!selectedMenu) {
      return [] as { date: string; weight: number }[];
    }

    try {
      const groupedByDate = new Map<string, number>();

      workouts.forEach(workout => {
        const workoutDate = normalizeDate(workout.date);

        workout.exercises
          ?.filter(exercise => exercise.name === selectedMenu)
          ?.forEach(exercise => {
            const maxWeight = calculateMaxWeight(exercise);
            if (maxWeight <= 0) {
              return;
            }
            const existing = groupedByDate.get(workoutDate);
            groupedByDate.set(workoutDate, Math.max(existing ?? 0, maxWeight));
          });
      });

      const sortedDates = Array.from(groupedByDate.keys()).sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      );

      return sortedDates.map(dateKey => ({
        date: formatDateLabel(dateKey),
        weight: groupedByDate.get(dateKey) ?? 0
      }));
    } catch (err) {
      console.error('メニュー別重量データの整形中にエラー:', err);
      setMenuDataError('メニュー別重量データの整形に失敗しました。');
      return [];
    }
  }, [selectedMenu, workouts]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!shareId) {
      setError('共有リンクが無効です。');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const verified = await verifyShare(shareId, password.trim());
      if (!verified) {
        setError('パスワードが正しくありません。');
        return;
      }
      setShareRecord(verified);
      setIsAuthenticated(true);
    } catch (err) {
      console.error('共有リンクの認証に失敗しました:', err);
      setError('認証に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>読み込み中です...</p>
        </div>
      </div>
    );
  }

  if (error && !shareRecord && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>アクセスできません</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertTitle>エラー</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-muted/20 px-4 py-12">
        <div className="mx-auto max-w-md">
          <Card className="shadow-lg">
            <CardHeader className="space-y-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Lock className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold">トレーニングデータの共有</CardTitle>
              <p className="text-sm text-muted-foreground">
                パスワードを入力してデータにアクセスしてください。
              </p>
              {expiresLabel && (
                <Badge variant="secondary" className="mx-auto w-fit">
                  有効期限: {expiresLabel}
                </Badge>
              )}
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="share-password">
                    パスワード
                  </label>
                  <Input
                    id="share-password"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="4桁のパスワード"
                    value={password}
                    onChange={event => setPassword(event.target.value.replace(/[^0-9]/g, ''))}
                    autoComplete="one-time-code"
                    className="text-center text-lg tracking-[0.3em]"
                  />
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3">
                <Button type="submit" disabled={isSubmitting || password.length !== 4} className="w-full">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'アクセス'}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  このページは読み取り専用です。入力したパスワードは安全に取り扱ってください。
                </p>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-12">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">トレーニングデータ（共有）</h1>
              <p className="text-muted-foreground">このビューは読み取り専用です。トレーナー向けに共有されています。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">読み取り専用</Badge>
              {expiresLabel && <Badge variant="outline">有効期限: {expiresLabel}</Badge>}
            </div>
          </div>
        </header>

        <Tabs defaultValue="history" className="space-y-6">
          <TabsList>
            <TabsTrigger value="history">トレーニング履歴</TabsTrigger>
            <TabsTrigger value="analytics">グラフ分析</TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="space-y-6">
            {isWorkoutsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> データを読み込んでいます...
              </div>
            ) : workoutsError ? (
              <Alert variant="destructive">
                <AlertTitle>読み込みエラー</AlertTitle>
                <AlertDescription>{workoutsError}</AlertDescription>
              </Alert>
            ) : groupedWorkouts.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  共有可能なトレーニングデータがまだありません。
                </CardContent>
              </Card>
            ) : (
              groupedWorkouts.map(group => (
                <section key={group.dateKey} className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">{group.displayDate}</h2>
                    <p className="text-sm text-muted-foreground">全 {group.items.length} 件の記録</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {group.items.map(workout => {
                      const volume = calculateVolume(workout);
                      const startTimeLabel = formatTime(workout.startTime ?? workout.createdAt);
                      const endTimeLabel = formatTime(workout.endTime ?? workout.updatedAt ?? workout.createdAt);
                      const durationLabel = formatDuration(workout.duration);
                      const exerciseNames = workout.exercises?.map(exercise => exercise.name).join(' / ') || 'メニュー未設定';

                      return (
                        <Card key={workout.id} className="border-muted">
                          <CardHeader className="space-y-2">
                            <CardTitle className="text-lg">{exerciseNames}</CardTitle>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>開始 {startTimeLabel}</span>
                              <span>終了 {endTimeLabel}</span>
                              <span>所要時間 {durationLabel}</span>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                              <span>セット数: {workout.exercises?.reduce((total, exercise) => total + (exercise.sets?.length ?? 0), 0) ?? 0}</span>
                              <span>総ボリューム: {volume.toLocaleString()} kg</span>
                            </div>

                            <div className="space-y-3">
                              {workout.exercises?.map((exercise, idx) => (
                                <div key={exercise.id ?? `${workout.id}-${idx}`} className="rounded-md border bg-muted/30 p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-medium">{exercise.name}</p>
                                      <p className="text-xs text-muted-foreground">{exercise.category}</p>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      セット数 {exercise.sets?.length ?? 0}
                                    </p>
                                  </div>
                                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                    {exercise.sets?.map((set, setIndex) => (
                                      <div key={set.id ?? `${exercise.id}-${setIndex}`} className="flex flex-wrap items-center gap-3">
                                        <span className="font-medium text-foreground">セット {setIndex + 1}</span>
                                        <span>重量: {set.weight ?? '-'} kg</span>
                                        <span>回数: {set.reps ?? '-'}</span>
                                        <span>ボリューム: {set.weight && set.reps ? (Number(set.weight) * Number(set.reps)).toLocaleString() : '-'} kg</span>
                                      </div>
                                    ))}
                                  </div>
                                  {exercise.notes && (
                                    <p className="mt-3 rounded-md bg-background p-2 text-xs text-muted-foreground">
                                      メモ: {exercise.notes}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>

                            {workout.notes && (
                              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">ワークアウトメモ:</span> {workout.notes}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>週間ボリューム推移</CardTitle>
                <p className="text-sm text-muted-foreground">過去4週間のトレーニング総ボリュームの推移です。</p>
              </CardHeader>
              <CardContent>
                {isWorkoutsLoading ? (
                  <div className="flex h-72 flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>データを読み込んでいます...</span>
                  </div>
                ) : workoutsError ? (
                  <Alert variant="destructive">
                    <AlertTitle>読み込みエラー</AlertTitle>
                    <AlertDescription>{workoutsError}</AlertDescription>
                  </Alert>
                ) : weeklyDataError ? (
                  <Alert variant="destructive">
                    <AlertTitle>データ整形エラー</AlertTitle>
                    <AlertDescription>{weeklyDataError}</AlertDescription>
                  </Alert>
                ) : weeklyChartData.length === 0 ? (
                  <div className="flex h-72 flex-col items-center justify-center text-sm text-muted-foreground">
                    <p>共有されたトレーニング記録が不足しているため、週次ボリュームを表示できません。</p>
                    <p>記録が追加されると推移が表示されます。</p>
                  </div>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyChartData} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="week" stroke="#475569" />
                        <YAxis
                          stroke="#475569"
                          width={80}
                          label={{ value: '総ボリューム (kg)', angle: -90, position: 'insideLeft', offset: 10 }}
                        />
                        <Tooltip
                          formatter={(value: number) => [`${value} kg`, '総ボリューム']}
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

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>メニュー別重量推移</CardTitle>
                    <p className="text-sm text-muted-foreground">選択したメニューの記録から日別最大重量を集計しています。</p>
                  </div>
                  <Select
                    value={selectedMenu}
                    onValueChange={value => setSelectedMenu(value)}
                    disabled={menuOptions.length === 0}
                  >
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder={menuOptions.length === 0 ? 'メニューがありません' : 'メニューを選択'} />
                    </SelectTrigger>
                    <SelectContent>
                      {menuOptions.map(menuName => (
                        <SelectItem key={menuName} value={menuName}>
                          {menuName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {menuOptions.length === 0 ? (
                  <div className="flex h-72 flex-col items-center justify-center text-sm text-muted-foreground">
                    <p>共有されたメニューがまだありません。</p>
                  </div>
                ) : isWorkoutsLoading ? (
                  <div className="flex h-72 flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>データを読み込んでいます...</span>
                  </div>
                ) : menuWeightChartData.length === 0 ? (
                  <div className="flex h-72 flex-col items-center justify-center text-sm text-muted-foreground">
                    <p>選択したメニューのトレーニングデータが見つかりません。</p>
                    <p>別のメニューを選択して確認してください。</p>
                  </div>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={menuWeightChartData} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" stroke="#475569" />
                        <YAxis
                          stroke="#475569"
                          width={80}
                          label={{ value: '重量 (kg)', angle: -90, position: 'insideLeft', offset: 10 }}
                        />
                        <Tooltip
                          formatter={(value: number) => [`${value} kg`, '最大重量']}
                          contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                          cursor={{ strokeDasharray: '3 3' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="weight"
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const matchExercise = (exercise: WorkoutExercise, menuName: string) => {
  return exercise.name === menuName;
};

const calculateMaxWeight = (exercise: WorkoutExercise): number => {
  if (exercise.type !== 'weight') {
    return 0;
  }

  return exercise.sets.reduce((max, set) => {
    const weight = typeof set.weight === 'number' ? set.weight : Number(set.weight ?? 0);
    return Math.max(max, weight || 0);
  }, 0);
};

const normalizeDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  return d.toISOString().split('T')[0];
};

const formatDateLabel = (dateString: string): string => {
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
};

const calculateWorkoutVolume = (workout: Workout): number => {
  return workout.exercises.reduce((total, exercise) => {
    if (exercise.type !== 'weight') {
      return total;
    }

    const exerciseVolume = exercise.sets.reduce((sum, set) => {
      const weight = typeof set.weight === 'number' ? set.weight : Number(set.weight ?? 0);
      const reps = typeof set.reps === 'number' ? set.reps : Number(set.reps ?? 0);
      if (!weight || !reps) {
        return sum;
      }
      return sum + weight * reps;
    }, 0);

    return total + exerciseVolume;
  }, 0);
};

const getWeekStart = (date: Date): Date => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  return start;
};

const getWeekEnd = (weekStart: Date): Date => {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return end;
};

const toDate = (value: string | Date | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};
