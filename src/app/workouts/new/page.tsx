'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { createWorkout } from '@/services/workoutService';
import { getMenus } from '@/services/menuService';
import type { Menu, MenuType } from '@/types/menu';
import type { WorkoutExercise, ExerciseSet } from '@/types/workout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const MENU_TYPE_LABELS: Record<MenuType, string> = {
  weight: '重量',
  bodyweight: '自重',
  time: '時間',
  distance: '距離'
};

const TYPE_BADGE_STYLES: Record<MenuType, string> = {
  weight: 'bg-blue-100 text-blue-700',
  bodyweight: 'bg-amber-100 text-amber-700',
  time: 'bg-violet-100 text-violet-700',
  distance: 'bg-emerald-100 text-emerald-700'
};

const getMenuTypeLabel = (type: MenuType) => MENU_TYPE_LABELS[type] ?? type;

const parseTimeInput = (value: string): number => {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  if (trimmed.includes(':')) {
    const [minutesPart, secondsPart = '0'] = trimmed.split(':');
    const minutes = Number(minutesPart) || 0;
    const seconds = Number(secondsPart) || 0;
    return Math.max(0, minutes * 60 + seconds);
  }

  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
};

const formatSecondsForInput = (seconds?: number): string => {
  if (!seconds || Number.isNaN(seconds) || seconds <= 0) {
    return '';
  }
  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return String(rounded);
  }
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
};

const formatSecondsDisplay = (seconds?: number): string => {
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
};

const createDefaultSet = (type: MenuType): ExerciseSet => {
  switch (type) {
    case 'bodyweight':
      return {
        id: crypto.randomUUID?.() ?? Date.now().toString(),
        reps: 12
      };
    case 'time': {
      const seconds = 60;
      return {
        id: crypto.randomUUID?.() ?? Date.now().toString(),
        duration: seconds,
        time: seconds
      };
    }
    case 'distance':
      return {
        id: crypto.randomUUID?.() ?? Date.now().toString(),
        distance: 1
      };
    case 'weight':
    default:
      return {
        id: crypto.randomUUID?.() ?? Date.now().toString(),
        weight: 20,
        reps: 10
      };
  }
};

const computeVolumeForExercise = (exercise: WorkoutExercise, menuType: MenuType) => {
  switch (menuType) {
    case 'bodyweight':
      return exercise.sets.reduce((total, set) => {
        const reps = Number(set.reps ?? 0);
        return total + (Number.isNaN(reps) ? 0 : reps);
      }, 0);
    case 'time':
      return exercise.sets.reduce((total, set) => {
        const seconds = Number(set.duration ?? set.time ?? 0);
        return total + (Number.isNaN(seconds) ? 0 : seconds);
      }, 0);
    case 'distance':
      return exercise.sets.reduce((total, set) => {
        const distance = Number(set.distance ?? 0);
        return total + (Number.isNaN(distance) ? 0 : distance);
      }, 0);
    case 'weight':
    default:
      return exercise.sets.reduce((total, set) => {
        const weight = Number(set.weight ?? 0);
        const reps = Number(set.reps ?? 0);
        if (!weight || !reps) {
          return total;
        }
        return total + weight * reps;
      }, 0);
  }
};

const resolveExerciseMenuType = (exercise: WorkoutExercise): MenuType => {
  if (exercise.menuType) {
    return exercise.menuType;
  }

  if (exercise.type === 'time') {
    const hasDistance = exercise.sets?.some(set => typeof set.distance === 'number' && set.distance > 0);
    return hasDistance ? 'distance' : 'time';
  }

  const hasWeight = exercise.sets?.some(set => typeof set.weight === 'number' && set.weight > 0);
  if (hasWeight) {
    return 'weight';
  }

  return 'bodyweight';
};

const formatVolumeLabel = (volume: number, menuType: MenuType): string => {
  switch (menuType) {
    case 'bodyweight':
      return `${Math.round(volume)} 回`;
    case 'time':
      return formatSecondsDisplay(volume);
    case 'distance': {
      if (!volume) {
        return '0 km';
      }
      const formatted = Number(volume.toFixed(2));
      return `${formatted} km`;
    }
    case 'weight':
    default:
      return `${Math.round(volume).toLocaleString()} kg`;
  }
};

const formatSetSummary = (set: ExerciseSet, index: number, menuType: MenuType): string => {
  const prefix = `セット ${index + 1}: `;
  switch (menuType) {
    case 'bodyweight': {
      const reps = Number(set.reps ?? 0);
      return `${prefix}${reps > 0 ? `${reps}回` : '-'}`;
    }
    case 'time': {
      const seconds = Number(set.duration ?? set.time ?? 0);
      return `${prefix}${formatSecondsDisplay(seconds)}`;
    }
    case 'distance': {
      const distance = Number(set.distance ?? 0);
      if (!distance) {
        return `${prefix}-`;
      }
      const formatted = Number(distance.toFixed(2));
      return `${prefix}${formatted}km`;
    }
    case 'weight':
    default: {
      const weight = Number(set.weight ?? 0);
      const reps = Number(set.reps ?? 0);
      if (!weight || !reps) {
        return `${prefix}-`;
      }
      return `${prefix}${weight}kg × ${reps}回`;
    }
  }
};

export default function NewWorkoutPage() {
  const { user } = useAuth();
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];
  
  const [date, setDate] = useState(today);
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState('');
  const [menus, setMenus] = useState<Menu[]>([]);
  const [isMenuLoading, setIsMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(0);

  const selectedMenu = useMemo(
    () => menus.find(menu => menu.id === selectedExerciseId) ?? null,
    [menus, selectedExerciseId]
  );

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

  useEffect(() => {
    const fetchMenus = async () => {
      if (!user) {
        setMenus([]);
        return;
      }

      setIsMenuLoading(true);
      setMenuError(null);

      try {
        const fetchedMenus = await getMenus(user.uid);
        const sortedMenus = [...fetchedMenus].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setMenus(sortedMenus);
      } catch (error) {
        console.error('メニューの取得中にエラーが発生しました:', error);
        setMenuError('メニューの取得に失敗しました。時間をおいて再度お試しください。');
      } finally {
        setIsMenuLoading(false);
      }
    };

    fetchMenus();
  }, [user]);

  useEffect(() => {
    const initialStart = new Date();
    setStartTime(initialStart);
  }, []);

  useEffect(() => {
    if (!startTime) {
      setElapsedMinutes(0);
      return;
    }

    const updateElapsed = () => {
      const diffMs = Date.now() - startTime.getTime();
      const minutes = Math.max(0, Math.floor(diffMs / 60000));
      setElapsedMinutes(minutes);
    };

    updateElapsed();
    const timerId = window.setInterval(updateElapsed, 60000);
    return () => {
      window.clearInterval(timerId);
    };
  }, [startTime]);

  const handleStart = () => {
    const now = new Date();
    setStartTime(now);
    setElapsedMinutes(0);
  };

  const formatTimeDisplay = (value: Date | null) => {
    if (!value) return '--:--';
    return value.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const formatDurationDisplay = (minutes: number) => {
    if (!minutes || minutes <= 0) return '0分';
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    if (hours > 0 && remaining > 0) {
      return `${hours}時間${remaining}分`;
    }
    if (hours > 0) {
      return `${hours}時間`;
    }
    return `${remaining}分`;
  };

  const addExercise = () => {
    if (!selectedMenu) return;

    const exerciseType = mapMenuTypeToExerciseType(selectedMenu.type);
    const newExercise: WorkoutExercise = {
      id: Date.now().toString(),
      name: selectedMenu.name,
      type: exerciseType,
      menuType: selectedMenu.type,
      hasSideOption: selectedMenu.hasSides,
      category: getPrimaryCategory(selectedMenu.category),
      sets: [{
        id: Date.now().toString(),
        weight: exerciseType === 'weight' ? 20 : undefined,
        reps: exerciseType === 'weight' ? 10 : undefined,
        duration: exerciseType === 'time' ? 60 : undefined,
        side: selectedMenu.hasSides ? 'both' : undefined,
      }],
    };

    setExercises([...exercises, newExercise]);
    setSelectedExerciseId('');
  };

  const addSet = (exerciseId: string) => {
    setExercises(exercises.map(exercise => {
      if (exercise.id === exerciseId && exercise.sets.length > 0) {
        const lastSet = exercise.sets[exercise.sets.length - 1];
        return {
          ...exercise,
          sets: [
            ...exercise.sets,
            {
              id: Date.now().toString(),
              weight: lastSet.weight,
              reps: lastSet.reps,
              duration: lastSet.duration,
              side: lastSet.side,
            },
          ],
        };
      }
      return exercise;
    }));
  };

  const removeSet = (exerciseId: string, setId: string) => {
    setExercises(exercises.map(exercise => {
      if (exercise.id === exerciseId) {
        const newSets = exercise.sets.filter(set => set.id !== setId);
        return { ...exercise, sets: newSets };
      }
      return exercise;
    }));
  };

  const updateSet = (exerciseId: string, setId: string, updates: Partial<ExerciseSet>) => {
    setExercises(exercises.map(exercise => {
      if (exercise.id === exerciseId) {
        return {
          ...exercise,
          sets: exercise.sets.map(set => {
            if (set.id === setId) {
              return { ...set, ...updates };
            }
            return set;
          }),
        };
      }
      return exercise;
    }));
  };

  const removeExercise = (exerciseId: string) => {
    setExercises(exercises.filter(ex => ex.id !== exerciseId));
  };

  const calculateVolume = (exercise: WorkoutExercise) => {
    if (exercise.type === 'weight') {
      return exercise.sets.reduce((total, set) => {
        return total + (set.weight || 0) * (set.reps || 0);
      }, 0);
    }
    return 0;
  };

  const validateForm = (): { isValid: boolean; message: string } => {
    if (!user) {
      return { isValid: false, message: 'ユーザーが認証されていません。再度ログインしてください。' };
    }

    if (exercises.length === 0) {
      return { isValid: false, message: '少なくとも1つのエクササイズを追加してください。' };
    }

    // 各エクササイズのバリデーション
    for (const exercise of exercises) {
      if (exercise.sets.length === 0) {
        return { isValid: false, message: `「${exercise.name}」にセットが追加されていません。` };
      }

      for (const [index, set] of exercise.sets.entries()) {
        if (exercise.type === 'weight') {
          if (!set.weight || isNaN(Number(set.weight))) {
            return { 
              isValid: false, 
              message: `「${exercise.name}」のセット${index + 1}で有効な重量を入力してください。` 
            };
          }
          if (!set.reps || isNaN(Number(set.reps))) {
            return { 
              isValid: false, 
              message: `「${exercise.name}」のセット${index + 1}で有効な回数を入力してください。` 
            };
          }
        } else if (exercise.type === 'time') {
          if (!set.duration || isNaN(Number(set.duration)) || Number(set.duration) <= 0) {
            return { 
              isValid: false, 
              message: `「${exercise.name}」のセット${index + 1}で有効な時間を入力してください。` 
            };
          }
        }
      }
    }

    return { isValid: true, message: '' };
  };

  // ワークアウトデータをクリーニングする関数
  const cleanWorkoutData = (exercises: WorkoutExercise[]) => {
    return exercises
      .map(exercise => {
        const menuType = resolveExerciseMenuType(exercise);
        return {
          ...exercise,
          // 必須フィールドのデフォルト値設定
          id: exercise.id || Date.now().toString(),
          name: exercise.name || '無名のエクササイズ',
          type: exercise.type || 'weight',
          menuType,
          category: exercise.category || 'その他',
          hasSideOption: Boolean(exercise.hasSideOption),
          // セットデータのクリーニング
          sets: exercise.sets
            .map(set => ({
              id: set.id || Date.now().toString(),
              // 数値フィールドのデフォルト値設定と型変換
              weight: exercise.type === 'weight' ? Number(set.weight || 0) : undefined,
              reps: exercise.type === 'weight' ? Number(set.reps || 0) : undefined,
              duration: exercise.type === 'time' ? Number(set.duration || 0) : undefined,
              side: exercise.hasSideOption ? (set.side || 'both') : undefined,
            }))
            .filter(set => {
              // 無効なセットを除外
              if ((exercise.type || 'weight') === 'weight') {
                return Number(set.weight) > 0 && Number(set.reps) > 0;
              } else {
                return Number(set.duration) > 0;
              }
            })
        } as WorkoutExercise;
      })
      .filter(exercise => exercise.sets.length > 0); // セットが空のエクササイズを除外
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      console.error('ユーザーが認証されていません');
      alert('セッションが切れました。再度ログインしてください。');
      return;
    }
    
    // フォームのバリデーション
    const { isValid, message } = validateForm();
    if (!isValid) {
      console.error('バリデーションエラー:', message);
      alert(message);
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      console.log('=== 保存処理開始 ===');
      console.log('1. 入力された日付 (date state):', date);
      console.log('2. 入力日付の型:', typeof date);
      
      // 日付の処理
      let dateToSave: string;
      
      if (!date) {
        console.log('3. 日付が未入力のため、現在日時を使用します');
        dateToSave = new Date().toISOString().split('T')[0];
      } else if (typeof date === 'string') {
        console.log('3. 文字列形式の日付を処理します');
        // 日付が正しい形式か検証
        const dateObj = new Date(date);
        if (isNaN(dateObj.getTime())) {
          console.error('4. 無効な日付形式です:', date);
          throw new Error('無効な日付形式です');
        }
        dateToSave = dateObj.toISOString().split('T')[0];
        console.log('4. 有効な日付です。ISO形式に変換:', dateToSave);
      } else {
        console.error('3. 予期しない日付形式です:', date);
        dateToSave = new Date().toISOString().split('T')[0];
      }
      
      // データをクリーニングして整形
      const cleanedExercises = cleanWorkoutData(exercises);
      
      if (cleanedExercises.length === 0) {
        throw new Error('有効なエクササイズがありません');
      }
      
      // 総ボリュームを計算
      const totalVolume = cleanedExercises.reduce((total, ex) => {
        return total + (ex.sets?.reduce((sum, set) => 
          sum + ((set.weight || 0) * (set.reps || 0)), 0) || 0);
      }, 0);

      const actualStart = startTime ?? new Date();
      const endTime = new Date();
      const durationMinutes = Math.max(0, Math.round((endTime.getTime() - actualStart.getTime()) / 60000));

      // 保存用データの準備
      const workoutData = {
        userId: user.uid,
        date: dateToSave,
        exercises: cleanedExercises.map(ex => ({
          id: ex.id,
          name: ex.name,
          type: ex.type,
          menuType: ex.menuType,
          category: ex.category,
          hasSideOption: ex.hasSideOption,
          sets: ex.sets,
          notes: ex.notes
        })),
        notes: notes.trim() || undefined,
        totalVolume,
        createdAt: new Date(),
        startTime: actualStart,
        endTime,
        duration: durationMinutes,
        warmupDuration: 0,
        cooldownDuration: 0
      };
      
      console.log('5. 保存するデータ:', JSON.stringify(workoutData, null, 2));
      console.log('=== createWorkout 実行 ===');
      
      await createWorkout(user.uid, workoutData);
      
      console.log('6. 保存が完了しました');
      console.log('=== 保存成功 ===');
      
      // 保存後は一覧にリダイレクト
      router.push('/workouts');
    } catch (error) {
      console.error('=== 保存エラー ===', error);
      
      const errorDetails = {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        date: new Date().toISOString(),
        exercises: JSON.stringify(exercises, null, 2),
      };
      
      console.error('トレーニングの保存に失敗しました:', errorDetails);
      
      let errorMessage = 'トレーニングの保存中にエラーが発生しました。';
      
      if (error instanceof Error) {
        if (error.message.includes('permission-denied')) {
          errorMessage = '保存する権限がありません。ログイン状態を確認してください。';
        } else if (error.message.includes('network-request-failed')) {
          errorMessage = 'ネットワーク接続に問題があります。インターネット接続を確認してください。';
        } else if (error.message.includes('有効なエクササイズがありません')) {
          errorMessage = '有効なエクササイズがありません。正しい値を入力してください。';
        } else if (error.message.includes('無効な日付形式です')) {
          errorMessage = '日付の形式が正しくありません。';
        }
      }
      
      alert(`${errorMessage}\n\n詳細: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/workouts" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4 mr-1" /> トレーニング履歴に戻る
        </Link>
        <h1 className="text-2xl font-bold mt-2">過去のトレーニングを追加</h1>
        <p className="text-sm text-muted-foreground mt-1">記録し忘れたトレーニングを後から追加できます。リアルタイムでセッションを記録する場合は「セッション記録」をご利用ください。</p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium mb-4">基本情報</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="date">日付</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={today}
                className="mt-1"
                required
              />
            </div>
            
            <div>
              <Label>トレーニング開始時刻</Label>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div>
                  <p className="text-lg font-medium">{formatTimeDisplay(startTime)}</p>
                  <p className="text-sm text-muted-foreground">経過時間: {formatDurationDisplay(elapsedMinutes)}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleStart}>
                  {startTime ? '開始時刻をリセット' : 'トレーニング開始'}
                </Button>
              </div>
            </div>
            
            <div>
              <Label htmlFor="exercise">メニューを追加</Label>
              <div className="flex gap-2 mt-1">
                <Select value={selectedExerciseId} onValueChange={setSelectedExerciseId}>
                  <SelectTrigger className="flex-1" disabled={isMenuLoading || menus.length === 0}>
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
                <Button
                  type="button"
                  onClick={addExercise}
                  disabled={!selectedMenu}
                >
                  <Plus className="w-4 h-4 mr-1" /> 追加
                </Button>
              </div>
              {isMenuLoading && (
                <p className="mt-2 text-sm text-muted-foreground">メニューを読み込んでいます...</p>
              )}
              {menuError && (
                <p className="mt-2 text-sm text-red-600">{menuError}</p>
              )}
              {!isMenuLoading && menus.length === 0 && !menuError && (
                <div className="mt-2 text-sm text-muted-foreground">
                  <p>利用できるメニューがありません。まずはメニューを追加してください。</p>
                  <Link href="/menus" className="text-primary underline">
                    メニュー管理ページへ移動
                  </Link>
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-2">
            <Label>メモ（任意）</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="トレーニングのメモを記入"
              className="mt-1"
              rows={3}
            />
          </div>
        </div>
        
        {exercises.map((exercise) => (
          <div key={exercise.id} className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">{exercise.name}</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeExercise(exercise.id)}
                className="text-red-500 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-1" /> 削除
              </Button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">セット</th>
                    {exercise.type === 'weight' && (
                      <>
                        <th className="text-right py-2 px-2">重量 (kg)</th>
                        <th className="text-right py-2 px-2">回数</th>
                      </>
                    )}
                    {exercise.type === 'time' && (
                      <th className="text-right py-2 px-2">時間 (秒)</th>
                    )}
                    {exercise.hasSideOption && (
                      <th className="text-right py-2 px-2">左右</th>
                    )}
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {exercise.sets.map((set, index) => (
                    <tr key={set.id} className="border-b">
                      <td className="py-2 px-2">{index + 1}</td>
                      
                      {exercise.type === 'weight' && (
                        <>
                          <td className="py-2 px-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={set.weight || ''}
                              onChange={(e) => 
                                updateSet(exercise.id, set.id, { 
                                  weight: e.target.value ? parseFloat(e.target.value) : 0 
                                })
                              }
                              className="w-24 text-right"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              type="number"
                              min="1"
                              value={set.reps || ''}
                              onChange={(e) => 
                                updateSet(exercise.id, set.id, { 
                                  reps: e.target.value ? parseInt(e.target.value) : 0 
                                })
                              }
                              className="w-20 text-right"
                            />
                          </td>
                        </>
                      )}
                      
                      {exercise.type === 'time' && (
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            min="1"
                            value={set.duration || ''}
                            onChange={(e) => 
                              updateSet(exercise.id, set.id, { 
                                duration: e.target.value ? parseInt(e.target.value) : 0 
                              })
                            }
                            className="w-24 text-right"
                          />
                        </td>
                      )}
                      
                      {exercise.hasSideOption && (
                        <td className="py-2 px-2">
                          <Select
                            value={set.side || 'both'}
                            onValueChange={(value: 'left' | 'right' | 'both') => 
                              updateSet(exercise.id, set.id, { side: value })
                            }
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
                      
                      <td className="py-2 px-2 text-right">
                        {exercise.sets.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSet(exercise.id, set.id)}
                            className="text-red-500 hover:bg-red-50 h-8 w-8"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              <div className="flex justify-between items-center mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addSet(exercise.id)}
                >
                  <Plus className="w-4 h-4 mr-1" /> セットを追加
                </Button>
                
                {exercise.type === 'weight' && (
                  <div className="text-sm text-gray-600">
                    合計ボリューム: <span className="font-medium">{calculateVolume(exercise)} kg</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        
        <div className="flex justify-end gap-4 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/workouts')}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
          <Button
            type="submit"
            disabled={exercises.length === 0 || isSubmitting}
          >
            {isSubmitting ? '保存中...' : 'トレーニングを記録する'}
          </Button>
        </div>
      </form>
    </div>
  );
}
