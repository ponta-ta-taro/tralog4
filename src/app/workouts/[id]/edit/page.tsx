'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getWorkoutById, updateWorkout } from '@/services/workoutService';
import { getMenus } from '@/services/menuService';
import type { WorkoutExercise, ExerciseSet } from '@/types/workout';
import type { Menu, MenuType } from '@/types/menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';

interface ValidationResult {
  isValid: boolean;
  message: string;
}

const mapMenuTypeToExerciseType = (type: Menu['type']): WorkoutExercise['type'] => {
  if (type === 'time' || type === 'distance') {
    return 'time';
  }
  return 'weight';
};

const getPrimaryCategory = (category?: string[]): string => {
  if (!category || category.length === 0) {
    return '未分類';
  }
  return category[0];
};

const createDefaultSet = (type: WorkoutExercise['type']): ExerciseSet => ({
  id: crypto.randomUUID(),
  weight: type === 'weight' ? 20 : undefined,
  reps: type === 'weight' ? 10 : undefined,
  duration: type === 'time' ? 60 : undefined,
  side: 'both'
});

export default function EditWorkoutPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useAuth();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [menus, setMenus] = useState<Menu[]>([]);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [isMenuLoading, setIsMenuLoading] = useState(false);

  const [date, setDate] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [selectedMenuIds, setSelectedMenuIds] = useState<string[]>([]);
  const [startTimeInput, setStartTimeInput] = useState('');
  const [endTimeInput, setEndTimeInput] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number | undefined>(undefined);
  const [warmupMinutes, setWarmupMinutes] = useState<number>(0);
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(0);

  const toTimeInputValue = (value?: Date | string) => {
    if (!value) return '';
    const dateValue = value instanceof Date ? value : new Date(value);
    if (isNaN(dateValue.getTime())) return '';
    const hours = String(dateValue.getHours()).padStart(2, '0');
    const minutes = String(dateValue.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const combineDateAndTime = useCallback((dateStr: string, timeStr: string): Date | undefined => {
    if (!dateStr || !timeStr) return undefined;
    const candidate = new Date(`${dateStr}T${timeStr}:00`);
    if (isNaN(candidate.getTime())) return undefined;
    return candidate;
  }, []);

  const calculateDurationFromTimes = useCallback((dateStr: string, startStr: string, endStr: string): number | undefined => {
    const start = combineDateAndTime(dateStr, startStr);
    const end = combineDateAndTime(dateStr, endStr);
    if (!start || !end) return undefined;
    let diff = end.getTime() - start.getTime();
    if (diff < 0) {
      diff += 24 * 60 * 60 * 1000;
    }
    return Math.max(0, Math.round(diff / 60000));
  }, [combineDateAndTime]);

  const formatDurationLabel = (minutes?: number) => {
    if (!minutes || minutes <= 0) return '-';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours > 0 && rest > 0) return `${hours}時間${rest}分`;
    if (hours > 0) return `${hours}時間`;
    return `${rest}分`;
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setIsMenuLoading(true);
      setError(null);
      setMenuError(null);

      try {
        const [workoutData, fetchedMenus] = await Promise.all([
          getWorkoutById(user.uid, id),
          getMenus(user.uid)
        ]);

        const sortedMenus = [...fetchedMenus].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setMenus(sortedMenus);

        if (!workoutData) {
          setError('指定されたトレーニング記録が見つかりません');
          setExercises([]);
          setDate(new Date().toISOString().split('T')[0]);
          return;
        }

        const workoutDate = normalizeDate(workoutData.date);
        setDate(workoutDate);
        setNotes(workoutData.notes || '');

        const normalizedExercises = workoutData.exercises.map((exercise) => normalizeExercise(exercise));
        setExercises(normalizedExercises);

        setSelectedMenuIds(normalizedExercises.map(exercise => {
          const matchingMenu = sortedMenus.find(menu =>
            menu.name === exercise.name &&
            mapMenuTypeToExerciseType(menu.type) === exercise.type
          );
          return matchingMenu?.id ?? '';
        }));

        const initialStartTime = toTimeInputValue(workoutData.startTime);
        const initialEndTime = toTimeInputValue(workoutData.endTime);
        setStartTimeInput(initialStartTime);
        setEndTimeInput(initialEndTime);

        if (typeof workoutData.duration === 'number') {
          setDurationMinutes(workoutData.duration);
        } else {
          setDurationMinutes(
            initialStartTime && initialEndTime
              ? calculateDurationFromTimes(workoutDate, initialStartTime, initialEndTime)
              : undefined
          );
        }

        setWarmupMinutes(typeof workoutData.warmupDuration === 'number' ? workoutData.warmupDuration : 0);
        setCooldownMinutes(typeof workoutData.cooldownDuration === 'number' ? workoutData.cooldownDuration : 0);
      } catch (err) {
        console.error('トレーニング編集データの取得中にエラーが発生しました:', err);
        setError('トレーニングデータの取得に失敗しました。時間をおいて再度お試しください。');
        setMenuError('メニューの取得に失敗しました');
      } finally {
        setIsLoading(false);
        setIsMenuLoading(false);
      }
    };

    fetchData();
  }, [user, id, calculateDurationFromTimes]);

  useEffect(() => {
    if (startTimeInput && endTimeInput) {
      setDurationMinutes(calculateDurationFromTimes(date, startTimeInput, endTimeInput));
    }
  }, [startTimeInput, endTimeInput, date, calculateDurationFromTimes]);

  const handleExerciseMenuSelect = (index: number, menuId: string) => {
    const menu = menus.find(m => m.id === menuId);
    if (!menu) return;

    const exerciseType = mapMenuTypeToExerciseType(menu.type);

    setExercises(prev => {
      const next = [...prev];
      const current = next[index];
      next[index] = {
        id: current?.id ?? crypto.randomUUID(),
        name: menu.name,
        type: exerciseType,
        menuType: menu.type,
        hasSideOption: menu.hasSides,
        category: getPrimaryCategory(menu.category),
        sets: current?.sets?.length ? current.sets.map(set => normalizeSet(set, exerciseType, menu.hasSides)) : [createDefaultSet(exerciseType)]
      };
      return next;
    });

    setSelectedMenuIds(prev => {
      const next = [...prev];
      next[index] = menuId;
      return next;
    });
  };

  const addExercise = () => {
    setExercises(prev => [...prev, {
      id: crypto.randomUUID(),
      name: '新しいメニュー',
      type: 'weight',
      menuType: 'weight',
      hasSideOption: false,
      category: '未分類',
      sets: [createDefaultSet('weight')]
    }]);
    setSelectedMenuIds(prev => [...prev, '']);
  };

  const removeExercise = (exerciseIndex: number) => {
    setExercises(prev => prev.filter((_, idx) => idx !== exerciseIndex));
    setSelectedMenuIds(prev => prev.filter((_, idx) => idx !== exerciseIndex));
  };

  const addSet = (exerciseId: string) => {
    setExercises(prev => prev.map(exercise => {
      if (exercise.id !== exerciseId) return exercise;
      const lastSet = exercise.sets[exercise.sets.length - 1];
      const newSet: ExerciseSet = {
        id: crypto.randomUUID(),
        weight: exercise.type === 'weight' ? lastSet?.weight ?? 20 : undefined,
        reps: exercise.type === 'weight' ? lastSet?.reps ?? 10 : undefined,
        duration: exercise.type === 'time' ? lastSet?.duration ?? 60 : undefined,
        side: exercise.hasSideOption ? (lastSet?.side ?? 'both') : undefined
      };
      return {
        ...exercise,
        sets: [...exercise.sets, newSet]
      };
    }));
  };

  const removeSet = (exerciseId: string, setId: string) => {
    setExercises(prev => prev.map(exercise => {
      if (exercise.id !== exerciseId) return exercise;
      if (exercise.sets.length <= 1) return exercise;
      return {
        ...exercise,
        sets: exercise.sets.filter(set => set.id !== setId)
      };
    }));
  };

  const updateSet = (exerciseId: string, setId: string, updates: Partial<ExerciseSet>) => {
    setExercises(prev => prev.map(exercise => {
      if (exercise.id !== exerciseId) return exercise;
      return {
        ...exercise,
        sets: exercise.sets.map(set => set.id === setId ? { ...set, ...updates } : set)
      };
    }));
  };

  const validateForm = (): ValidationResult => {
    if (!user) {
      return { isValid: false, message: 'ユーザー情報を取得できません。再度ログインしてください。' };
    }

    if (exercises.length === 0) {
      return { isValid: false, message: '少なくとも1つのメニューを追加してください。' };
    }

    for (const exercise of exercises) {
      if (!exercise.sets.length) {
        return { isValid: false, message: `${exercise.name} にセットがありません。` };
      }

      for (const [index, set] of exercise.sets.entries()) {
        if (exercise.type === 'weight') {
          if (!set.weight || !set.reps || set.weight <= 0 || set.reps <= 0) {
            return { isValid: false, message: `${exercise.name} のセット${index + 1}に重量・回数を入力してください。` };
          }
        } else {
          if (!set.duration || set.duration <= 0) {
            return { isValid: false, message: `${exercise.name} のセット${index + 1}に時間を入力してください。` };
          }
        }
      }
    }

    return { isValid: true, message: '' };
  };

  const cleanWorkoutData = (rawExercises: WorkoutExercise[]) => {
    return rawExercises.map(exercise => {
      const type = exercise.type ?? 'weight';
      return {
        ...exercise,
        type,
        hasSideOption: Boolean(exercise.hasSideOption),
        category: exercise.category || '未分類',
        sets: exercise.sets.map(set => normalizeSet(set, type, exercise.hasSideOption)).filter(set => {
          if (type === 'weight') {
            return (set.weight ?? 0) > 0 && (set.reps ?? 0) > 0;
          }
          return (set.duration ?? 0) > 0;
        })
      };
    }).filter(exercise => exercise.sets.length > 0);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const { isValid, message } = validateForm();
    if (!isValid) {
      alert(message);
      return;
    }

    if (!user) return;

    setIsSaving(true);
    setError(null);

    try {
      const cleanedExercises = cleanWorkoutData(exercises);
      if (!cleanedExercises.length) {
        throw new Error('有効なメニューが存在しません。');
      }

      const computedStartTime = startTimeInput ? combineDateAndTime(date, startTimeInput) : undefined;
      const computedEndTime = endTimeInput ? combineDateAndTime(date, endTimeInput) : undefined;
      let computedDuration = durationMinutes;
      if (computedStartTime && computedEndTime) {
        const diff = computedEndTime.getTime() - computedStartTime.getTime();
        const normalizedDiff = diff < 0 ? diff + 24 * 60 * 60 * 1000 : diff;
        computedDuration = Math.max(0, Math.round(normalizedDiff / 60000));
      }

      const workoutData = {
        date,
        exercises: cleanedExercises,
        notes: notes.trim(),
        updatedAt: new Date(),
        startTime: computedStartTime,
        endTime: computedEndTime,
        duration: computedDuration,
        warmupDuration: Math.max(0, Number.isFinite(warmupMinutes) ? warmupMinutes : 0),
        cooldownDuration: Math.max(0, Number.isFinite(cooldownMinutes) ? cooldownMinutes : 0)
      };

      await updateWorkout(user.uid, id, workoutData);
      router.push(`/workouts/${id}`);
    } catch (err) {
      console.error('トレーニング更新中にエラーが発生しました:', err);
      setError(err instanceof Error ? err.message : 'トレーニングの更新に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-12 animate-spin rounded-full border-b-2 border-t-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href={`/workouts/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">トレーニング編集</h1>
          <p className="text-sm text-muted-foreground">記録内容を更新できます。</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-medium">基本情報</h2>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <Label htmlFor="date">日付</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={event => setDate(event.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label htmlFor="warmup-minutes">ウォームアップ (分)</Label>
              <Input
                id="warmup-minutes"
                type="number"
                min="0"
                placeholder="0"
                value={Number.isFinite(warmupMinutes) ? warmupMinutes : 0}
                onChange={e => setWarmupMinutes(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="cooldown-minutes">クールダウン (分)</Label>
              <Input
                id="cooldown-minutes"
                type="number"
                min="0"
                placeholder="0"
                value={Number.isFinite(cooldownMinutes) ? cooldownMinutes : 0}
                onChange={e => setCooldownMinutes(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="startTime">開始時刻</Label>
              <Input
                id="startTime"
                type="time"
                value={startTimeInput}
                onChange={event => setStartTimeInput(event.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="endTime">終了時刻</Label>
              <Input
                id="endTime"
                type="time"
                value={endTimeInput}
                onChange={event => setEndTimeInput(event.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>所要時間</Label>
              <p className="mt-2 text-sm text-muted-foreground">{formatDurationLabel(durationMinutes)}</p>
            </div>

            <div>
              <Label>メニューを追加</Label>
              <div className="mt-1 flex gap-2">
                <Select
                  value=""
                  onValueChange={menuId => {
                    const menu = menus.find(m => m.id === menuId);
                    if (!menu) return;
                    const exerciseType = mapMenuTypeToExerciseType(menu.type);
                    setExercises(prev => [...prev, {
                      id: crypto.randomUUID(),
                      name: menu.name,
                      type: exerciseType,
                      menuType: menu.type,
                      hasSideOption: menu.hasSides,
                      category: getPrimaryCategory(menu.category),
                      sets: [createDefaultSet(exerciseType)]
                    }]);
                    setSelectedMenuIds(prev => [...prev, menuId]);
                  }}
                  disabled={isMenuLoading || menus.length === 0}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="メニューを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {menus.map(menu => (
                      <SelectItem key={menu.id} value={menu.id}>
                        {menu.name} {menu.category?.length ? `(${menu.category.join(' / ')})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={addExercise} variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {isMenuLoading && <p className="mt-2 text-sm text-muted-foreground">メニューを読み込んでいます...</p>}
              {menuError && <p className="mt-2 text-sm text-red-600">{menuError}</p>}
              {!isMenuLoading && menus.length === 0 && !menuError && (
                <div className="mt-2 text-sm text-muted-foreground">
                  <p>利用できるメニューがありません。まずはメニューを追加してください。</p>
                  <Link href="/menus" className="text-primary underline">メニュー管理ページへ移動</Link>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4">
            <Label>メモ（任意）</Label>
            <Textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              placeholder="トレーニング全体のメモを記入"
              className="mt-1"
              rows={3}
            />
          </div>
        </div>

        {exercises.map((exercise, index) => (
          <div key={exercise.id} className="rounded-lg bg-white p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">{exercise.name || `メニュー ${index + 1}`}</h3>
                <p className="text-sm text-muted-foreground">タイプ: {exercise.type === 'weight' ? 'ウェイト' : '時間 / 距離'}</p>
              </div>
              <div className="flex gap-2">
                <Select
                  value={selectedMenuIds[index] ?? ''}
                  onValueChange={menuId => handleExerciseMenuSelect(index, menuId)}
                  disabled={menus.length === 0}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="メニューを変更" />
                  </SelectTrigger>
                  <SelectContent>
                    {menus.map(menu => (
                      <SelectItem key={menu.id} value={menu.id}>
                        {menu.name} {menu.category?.length ? `(${menu.category.join(' / ')})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeExercise(index)}
                  disabled={exercises.length <= 1}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="mr-1 h-4 w-4" /> 削除
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-sm text-muted-foreground">
                    <th className="p-2 text-left">セット</th>
                    {exercise.type === 'weight' && <th className="p-2 text-right">重量 (kg)</th>}
                    {exercise.type === 'weight' && <th className="p-2 text-right">回数</th>}
                    {exercise.type === 'time' && <th className="p-2 text-right">時間 (秒)</th>}
                    {exercise.hasSideOption && <th className="p-2 text-right">左右</th>}
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {exercise.sets.map((set, setIndex) => (
                    <tr key={set.id} className="border-b text-sm">
                      <td className="p-2">{setIndex + 1}</td>
                      {exercise.type === 'weight' && (
                        <>
                          <td className="p-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={set.weight ?? ''}
                              onChange={event => updateSet(exercise.id, set.id, { weight: event.target.value ? parseFloat(event.target.value) : 0 })}
                              className="w-24 text-right"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min="1"
                              value={set.reps ?? ''}
                              onChange={event => updateSet(exercise.id, set.id, { reps: event.target.value ? parseInt(event.target.value) : 0 })}
                              className="w-20 text-right"
                            />
                          </td>
                        </>
                      )}
                      {exercise.type === 'time' && (
                        <td className="p-2">
                          <Input
                            type="number"
                            min="1"
                            value={set.duration ?? ''}
                            onChange={event => updateSet(exercise.id, set.id, { duration: event.target.value ? parseInt(event.target.value) : 0 })}
                            className="w-24 text-right"
                          />
                        </td>
                      )}
                      {exercise.hasSideOption && (
                        <td className="p-2">
                          <Select
                            value={set.side ?? 'both'}
                            onValueChange={(value: 'left' | 'right' | 'both') => updateSet(exercise.id, set.id, { side: value })}
                          >
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="both">両方</SelectItem>
                              <SelectItem value="left">左</SelectItem>
                              <SelectItem value="right">右</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                      <td className="p-2 text-right">
                        {exercise.sets.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSet(exercise.id, set.id)}
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 flex items-center justify-between">
                <Button type="button" size="sm" onClick={() => addSet(exercise.id)} className="bg-green-600 hover:bg-green-700 text-white">
                  <Plus className="mr-1 h-4 w-4" /> セットを追加
                </Button>
                {exercise.type === 'weight' && (
                  <p className="text-sm text-muted-foreground">
                    合計ボリューム: {calculateVolume(exercise).toLocaleString()} kg
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="flex justify-end gap-3 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/workouts/${id}`)}
            disabled={isSaving}
          >
            キャンセル
          </Button>
          <Button type="submit" disabled={isSaving || exercises.length === 0}>
            {isSaving ? '更新中...' : 'トレーニングを更新する'}
          </Button>
        </div>
      </form>
    </div>
  );
}

type FirestoreTimestampLike = Timestamp | { seconds: number; nanoseconds?: number } | string | number | Date | null | undefined;

function normalizeDate(value?: FirestoreTimestampLike): string {
  try {
    if (!value) return new Date().toISOString().split('T')[0];
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) throw new Error('Invalid date');
      return date.toISOString().split('T')[0];
    }
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    if (value && typeof (value as Timestamp).toDate === 'function') {
      const date = (value as Timestamp).toDate();
      return date.toISOString().split('T')[0];
    }
    if (value && typeof value === 'object' && 'seconds' in (value as { seconds: number })) {
      const t = value as { seconds: number; nanoseconds?: number };
      const date = new Date(t.seconds * 1000 + (t.nanoseconds || 0) / 1_000_000);
      return date.toISOString().split('T')[0];
    }
  } catch (error) {
    console.error('Failed to normalize date:', error, value);
  }
  return new Date().toISOString().split('T')[0];
}

function resolveMenuTypeForExercise(exercise: WorkoutExercise): MenuType {
  if (exercise.menuType) return exercise.menuType;
  if (exercise.type === 'time') {
    const hasDistance = exercise.sets?.some(set => typeof set.distance === 'number' && set.distance > 0);
    return hasDistance ? 'distance' : 'time';
  }
  const hasWeight = exercise.sets?.some(set => typeof set.weight === 'number' && set.weight > 0);
  if (hasWeight) return 'weight';
  return 'bodyweight';
}

function normalizeExercise(exercise: WorkoutExercise): WorkoutExercise {
  const type = exercise.type ?? 'weight';
  const hasSideOption = Boolean(exercise.hasSideOption);
  const sets = exercise.sets?.length ? exercise.sets.map(set => normalizeSet(set, type, hasSideOption)) : [createDefaultSet(type)];

  return {
    id: exercise.id || crypto.randomUUID(),
    name: exercise.name || 'メニュー',
    type,
    menuType: resolveMenuTypeForExercise({ ...exercise, type, sets } as WorkoutExercise),
    hasSideOption,
    category: exercise.category || '未分類',
    sets
  };
}

function normalizeSet(set: ExerciseSet, type: WorkoutExercise['type'], hasSideOption: boolean): ExerciseSet {
  return {
    id: set.id || crypto.randomUUID(),
    weight: type === 'weight' ? Number(set.weight ?? 0) : undefined,
    reps: type === 'weight' ? Number(set.reps ?? 0) : undefined,
    duration: type === 'time' ? Number(set.duration ?? 0) : undefined,
    side: hasSideOption ? (set.side ?? 'both') : undefined
  };
}

function calculateVolume(exercise: WorkoutExercise): number {
  if (exercise.type !== 'weight') return 0;
  return exercise.sets.reduce((total, set) => total + (set.weight ?? 0) * (set.reps ?? 0), 0);
}
