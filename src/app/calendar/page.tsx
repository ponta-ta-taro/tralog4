'use client';

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/workouts');
  return null;
}
/*
  }, [loading, router, user]);

  useEffect(() => {
    const fetchWorkouts = async () => {
      if (!user) {
        return;
      }

      setIsLoading(true);
      try {
        const fetched = await getWorkouts(user.uid);
        setWorkouts(fetched);
      } catch (err) {
        console.error('トレーニングデータの取得に失敗しました:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkouts();
  }, [user]);

  const workoutsByDate = useMemo(() => {
    return workouts.reduce<Record<string, Workout[]>>((acc, workout) => {
      const key = normalizeDateKey(workout.date);
      if (!key) {
        return acc;
      }
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(workout);
      return acc;
    }, {});
  }, [workouts]);

  const selectedDateKey = normalizeDateKey(selectedDate);
  const workoutsForSelectedDate = selectedDateKey ? workoutsByDate[selectedDateKey] ?? [] : [];

  const exerciseSummaries: ExerciseSummary[] = useMemo(() => {
    if (!workoutsForSelectedDate.length) {
      return [];
    }

    return workoutsForSelectedDate.flatMap(workout => {
      return workout.exercises.map(exercise => {
        const menuType = (exercise.menuType ?? inferMenuTypeFromExercise(exercise)) as MenuType;
        const volume = computeVolumeForSets(exercise.sets, menuType);
        const recordedAt = toDate(workout.createdAt) ?? undefined;

        return {
          workoutId: workout.id,
          workoutDuration: workout.duration,
          workoutNotes: workout.notes,
          recordedAt,
          exercise,
          volume,
          menuType
        } satisfies ExerciseSummary;
      });
    });
  }, [workoutsForSelectedDate]);

  const tileContent: NonNullable<CalendarProps['tileContent']> = ({ date, view }) => {
    if (view !== 'month') {
      return null;
    }

    const key = normalizeDateKey(date);
    if (!key || !workoutsByDate[key]?.length) {
      return null;
    }

    return <span className="mt-1 block h-2 w-2 rounded-full bg-primary shadow-[0_0_0_2px_rgba(59,130,246,0.2)]" />;
  };

  type OnChangeFunc = NonNullable<CalendarProps['onChange']>;

  const handleDateChange: OnChangeFunc = (value, _event) => {
    if (Array.isArray(value)) {
      const [start] = value;
      if (start instanceof Date) {
        setSelectedDate(start);
      }
      return;
    }

    if (value instanceof Date) {
      setSelectedDate(value);
    } else if (value) {
      setSelectedDate(new Date(value));
    }
  };

  const formattedSelectedDate = selectedDateKey
    ? formatJapaneseDate(new Date(selectedDateKey))
    : '';

  const todayKey = normalizeDateKey(new Date());

  const tileClassName: NonNullable<CalendarProps['tileClassName']> = ({ date, view }) => {
    if (view !== 'month') {
      return '';
    }

    const key = normalizeDateKey(date);
    const isSelected = key === selectedDateKey;
    const isToday = key === todayKey;
    const hasWorkout = key ? Boolean(workoutsByDate[key]?.length) : false;

    const baseClasses = [
      'relative mx-auto flex h-12 w-12 items-center justify-center rounded-lg text-sm font-medium transition-all md:h-11 md:w-11',
      'hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background'
    ];

    if (hasWorkout) {
      baseClasses.push('text-primary');
    } else {
      baseClasses.push('text-muted-foreground');
    }

    if (isToday && !isSelected) {
      baseClasses.push('border border-primary/30');
    }

    if (isSelected) {
      baseClasses.push('bg-primary text-primary-foreground shadow-sm hover:!bg-primary focus:ring-primary');
    }

    return baseClasses.join(' ');
  };

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="overflow-hidden border-0 bg-background shadow-md">
        <CardHeader className="flex flex-col gap-2 border-b bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-2xl font-bold">トレーニングカレンダー</CardTitle>
            <p className="text-sm text-muted-foreground">
              カレンダーでトレーニングの記録を振り返りましょう。
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="grid gap-6 sm:grid-cols-[360px,1fr]">
            <div className="border-b bg-card p-4 sm:border-r sm:border-b-0">
              {isLoading ? (
                <div className="flex h-[360px] items-center justify-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Calendar
                  locale="ja-JP"
                  calendarType="iso8601"
                  onChange={handleDateChange}
                  value={selectedDate}
                  tileContent={tileContent}
                  tileClassName={tileClassName}
                  formatShortWeekday={(_, date) => formatJapaneseWeekday(date)}
                  formatDay={(_, date) => String(date.getDate())}
                  formatMonthYear={(_, date) => formatJapaneseMonthYear(date)}
                  prevLabel="‹"
                  nextLabel="›"
                  className="react-calendar w-full rounded-xl border border-border bg-card p-3 text-sm shadow-sm [&_.react-calendar__navigation]:mb-3 [&_.react-calendar__navigation]:items-center [&_.react-calendar__navigation]:justify-between [&_.react-calendar__navigation]:gap-2 [&_.react-calendar__navigation__label]:text-lg [&_.react-calendar__navigation__label]:font-semibold [&_.react-calendar__navigation__arrow]:flex [&_.react-calendar__navigation__arrow]:h-9 [&_.react-calendar__navigation__arrow]:w-9 [&_.react-calendar__navigation__arrow]:items-center [&_.react-calendar__navigation__arrow]:justify-center [&_.react-calendar__navigation__arrow]:rounded-lg [&_.react-calendar__navigation__arrow]:transition-colors [&_.react-calendar__navigation__arrow:hover]:bg-primary/10 [&_.react-calendar__navigation__arrow]:text-muted-foreground [&_.react-calendar__navigation__label:hover]:bg-transparent [&_.react-calendar__month-view__weekdays]:text-center [&_.react-calendar__month-view__weekdays_abbr]:font-medium [&_.react-calendar__month-view__weekdays_abbr]:text-muted-foreground [&_.react-calendar__month-view__weekNumbers]:hidden [&_.react-calendar__tile]:p-0"
                />
              )}
              <p className="mt-3 text-center text-sm text-muted-foreground">
                ● が表示されている日はトレーニングがあります。
              </p>
            </div>

            <div className="flex min-h-[360px] flex-col">
              <div className="px-4 pt-4 sm:px-0">
                <h2 className="text-xl font-semibold">{formattedSelectedDate}</h2>
                <p className="text-sm text-muted-foreground">選択した日のトレーニング一覧</p>
              </div>
              <div className="my-4 h-px w-full bg-border" />

              {isLoading ? (
                <div className="space-y-4 px-4 pb-6 sm:px-0">
                  {[...Array(3)].map((_, index) => (
                    <Skeleton key={index} className="h-24 w-full" />
                  ))}
                </div>
              ) : exerciseSummaries.length === 0 ? (
                <div className="flex grow items-center justify-center px-4 pb-6 text-sm text-muted-foreground sm:px-0">
                  選択した日にトレーニング記録はありません。
                </div>
              ) : (
                <div className="px-4 pb-6 sm:px-0">
                  <div className="space-y-4 sm:pr-2">
                    {exerciseSummaries.map(summary => (
                      <div
                        key={`${summary.workoutId}-${summary.exercise.id}`}
                        className="rounded-lg border border-border bg-card p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-semibold">{summary.exercise.name ?? '不明なメニュー'}</h3>
                              <Badge>{MENU_TYPE_LABELS[summary.menuType]}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              セット数: {summary.exercise.sets.length} / 総ボリューム: {VOLUME_FORMATTERS[summary.menuType](summary.volume)}
                            </p>
                          </div>
                          <Link
                            href={`/workouts/${summary.workoutId}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            詳細を見る
                          </Link>
                        </div>

                        <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                          <p>
                            所要時間:{' '}
                            {summary.workoutDuration !== undefined
                              ? formatDuration(summary.workoutDuration)
                              : '記録なし'}
                          </p>
                          <p>
                            記録時刻:{' '}
                            {summary.recordedAt ? formatTime(summary.recordedAt) : '不明'}
                          </p>
                        </div>

                        {summary.workoutNotes && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            メモ: <span className="whitespace-pre-line">{summary.workoutNotes}</span>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function normalizeDateKey(value: unknown): string | null {
  const date = toDate(value);
  if (!date) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function formatDuration(minutes?: number): string {
  if (!minutes || minutes <= 0) {
    return '0分';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) {
    return `${hours}時間${rest}分`;
  }
  if (hours > 0) {
    return `${hours}時間`;
  }
  return `${rest}分`;
}

function inferMenuTypeFromExercise(exercise: WorkoutExercise): MenuType {
  if (exercise.menuType) {
    return exercise.menuType;
  }

  if (exercise.type === 'time') {
    const hasDistance = exercise.sets.some(set => typeof set.distance === 'number' && set.distance > 0);
    return hasDistance ? 'distance' : 'time';
  }

  const hasWeight = exercise.sets.some(set => typeof set.weight === 'number' && set.weight > 0);
  if (hasWeight) {
    return 'weight';
  }

  return 'bodyweight';
}

function computeVolumeForSets(sets: ExerciseSet[], type: MenuType): number {
  switch (type) {
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

function formatJapaneseDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = JA_WEEKDAYS[date.getDay()] ?? '';
  return `${year}年${month}月${day}日 (${weekday})`;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatJapaneseWeekday(date: Date): string {
  return JA_WEEKDAYS[date.getDay()] ?? '';
}

function formatJapaneseMonthYear(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}
*/
