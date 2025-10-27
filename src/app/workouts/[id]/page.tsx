'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getWorkoutById, deleteWorkout } from '@/services/workoutService';
import { Workout, WorkoutExercise, ExerciseSet } from '@/types/workout';
import type { MenuType } from '@/types/menu';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowLeft, Trash2, Edit } from 'lucide-react';

export default function WorkoutDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const router = useRouter();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchWorkout = async () => {
      if (!user || !id) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const workoutData = await getWorkoutById(user.uid, id as string);
        if (workoutData) {
          setWorkout(workoutData);
        } else {
          setError('指定されたトレーニング記録が見つかりません');
        }
      } catch (err) {
        console.error('トレーニングの取得に失敗しました:', err);
        setError('トレーニングの取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkout();
  }, [user, id]);

  const handleDelete = async () => {
    if (!user || !workout) return;
    
    setIsDeleting(true);
    try {
      await deleteWorkout(user.uid, workout.id);
      router.push('/workouts');
    } catch (err) {
      console.error('削除に失敗しました:', err);
      setError('削除に失敗しました');
      setIsDeleting(false);
    }
  };

  // セットのボリュームを計算
  const resolveMenuType = (exercise: WorkoutExercise): MenuType => {
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
  };

  const calculateSetVolume = (menuType: MenuType, set: ExerciseSet) => {
    switch (menuType) {
      case 'bodyweight': {
        const reps = Number(set.reps ?? 0);
        return reps > 0 ? `${Math.round(reps)}回` : '-';
      }
      case 'time': {
        const seconds = Number(set.duration ?? set.time ?? 0);
        return seconds > 0 ? formatSecondsDisplay(seconds) : '-';
      }
      case 'distance': {
        const distance = Number(set.distance ?? 0);
        return distance > 0 ? `${Number(distance.toFixed(2))} km` : '-';
      }
      case 'weight':
      default: {
        const weight = Number(set.weight ?? 0);
        const reps = Number(set.reps ?? 0);
        if (weight > 0 && reps > 0) {
          return `${(weight * reps).toLocaleString()} kg`;
        }
        return '-';
      }
    }
  };

  const calculateExerciseVolume = (exercise: Workout['exercises'][0]) => {
    const menuType = resolveMenuType(exercise);

    switch (menuType) {
      case 'bodyweight': {
        const totalReps = exercise.sets.reduce((total, set) => {
          const reps = Number(set.reps ?? 0);
          return total + (Number.isNaN(reps) ? 0 : reps);
        }, 0);
        return `${Math.round(totalReps)} 回`;
      }
      case 'time': {
        const totalSeconds = exercise.sets.reduce((total, set) => {
          const seconds = Number(set.duration ?? set.time ?? 0);
          return total + (Number.isNaN(seconds) ? 0 : seconds);
        }, 0);
        return formatSecondsDisplay(totalSeconds);
      }
      case 'distance': {
        const totalDistance = exercise.sets.reduce((total, set) => {
          const distance = Number(set.distance ?? 0);
          return total + (Number.isNaN(distance) ? 0 : distance);
        }, 0);
        return `${Number(totalDistance.toFixed(2))} km`;
      }
      case 'weight':
      default: {
        const totalWeight = exercise.sets.reduce((total, set) => {
          const weight = Number(set.weight ?? 0);
          const reps = Number(set.reps ?? 0);
          if (!weight || !reps) {
            return total;
          }
          return total + weight * reps;
        }, 0);
        return `${totalWeight.toLocaleString()} kg`;
      }
    }
  };

  const formatTotalVolumeLabel = (workout: Workout) => {
    const totals = workout.exercises.reduce<Record<MenuType, number>>((acc, exercise) => {
      const menuType = resolveMenuType(exercise);
      exercise.sets.forEach(set => {
        switch (menuType) {
          case 'bodyweight':
            acc.bodyweight += Number(set.reps ?? 0) || 0;
            break;
          case 'time':
            acc.time += Number(set.duration ?? set.time ?? 0) || 0;
            break;
          case 'distance':
            acc.distance += Number(set.distance ?? 0) || 0;
            break;
          case 'weight':
          default:
            acc.weight += (Number(set.weight ?? 0) || 0) * (Number(set.reps ?? 0) || 0);
            break;
        }
      });
      return acc;
    }, { weight: 0, bodyweight: 0, time: 0, distance: 0 });

    const parts: string[] = [];
    if (totals.weight > 0) {
      parts.push(`${totals.weight.toLocaleString()} kg`);
    }
    if (totals.bodyweight > 0) {
      parts.push(`${Math.round(totals.bodyweight)} 回`);
    }
    if (totals.time > 0) {
      parts.push(formatSecondsDisplay(totals.time));
    }
    if (totals.distance > 0) {
      parts.push(`${Number(totals.distance.toFixed(2))} km`);
    }

    return parts.length > 0 ? parts.join(' / ') : '0';
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

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>セット</TableHead>
                        <TableHead>重量 (kg)</TableHead>
                        <TableHead>回数</TableHead>
                        <TableHead>ボリューム</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[1, 2, 3].map((j) => (
                        <TableRow key={j}>
                          <TableCell>{j}</TableCell>
                          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
              <CardFooter className="justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
        <Button variant="outline" asChild>
          <Link href="/workouts">
            <ArrowLeft className="mr-2 h-4 w-4" />
            トレーニング履歴に戻る
          </Link>
        </Button>
      </div>
    );
  }

  if (!workout) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-semibold mb-4">トレーニング記録が見つかりません</h2>
        <p className="text-gray-600 mb-6">指定されたトレーニング記録は存在しないか、削除された可能性があります。</p>
        <Button asChild>
          <Link href="/workouts">
            トレーニング履歴に戻る
          </Link>
        </Button>
      </div>
    );
  }

  const formatDate = (dateValue: unknown): string => {
    try {
      let date: Date;
      
      // Firestore Timestampの場合
      if (dateValue && typeof (dateValue as { toDate?: unknown }).toDate === 'function') {
        date = (dateValue as { toDate: () => Date }).toDate();
      }
      // Dateオブジェクトの場合
      else if (dateValue instanceof Date) {
        date = dateValue;
      }
      // ISO文字列の場合
      else if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      }
      // その他（空オブジェクトなど）
      else {
        console.error('Invalid date value:', dateValue);
        return '日付不明';
      }
      
      // 無効な日付チェック
      if (isNaN(date.getTime())) {
        console.error('Invalid date after conversion:', dateValue);
        return '日付不明';
      }
      
      // 日本語形式でフォーマット
      return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short'
      });
    } catch (error) {
      console.error('Date formatting error:', error, dateValue);
      return '日付不明';
    }
  };

  const formatTime = (dateInput: string | Date | undefined) => {
    try {
      if (!dateInput) return '--:--';
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid time');
      }
      // 時間部分のみをフォーマット
      return date.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (e) {
      console.error('Error formatting time:', e);
      return '--:--';
    }
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes || minutes <= 0) return '-';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours > 0 && rest > 0) return `${hours}時間${rest}分`;
    if (hours > 0) return `${hours}時間`;
    return `${rest}分`;
  };

  const formattedDate = formatDate(workout.date);
  const formattedTime = formatTime(workout.createdAt);
  const startTimeDisplay = formatTime(workout.startTime);
  const endTimeDisplay = formatTime(workout.endTime);
  const durationDisplay = formatDuration(workout.duration);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/workouts">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">トレーニング詳細</h1>
            <p className="text-sm text-gray-500">{formattedDate} {formattedTime} 記録</p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span>開始 {startTimeDisplay}</span>
              <span>終了 {endTimeDisplay}</span>
              <span>所要時間 {durationDisplay}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/workouts/${workout.id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={isDeleting}
          >
            {isDeleting ? '削除中...' : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                削除
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {workout.exercises.map((exercise, index) => (
          <Card key={exercise.id || index} className="overflow-hidden">
            <CardHeader className="bg-gray-50 px-6 py-4 border-b">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">{exercise.name}</CardTitle>
                <div className="text-sm text-gray-500">
                  合計: <span className="font-medium">{calculateExerciseVolume(exercise)}</span>
                </div>
              </div>
              <div className="text-sm text-gray-500">{exercise.category}</div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">セット</TableHead>
                      {(() => {
                        const menuType = resolveMenuType(exercise);
                        switch (menuType) {
                          case 'weight':
                            return (
                              <>
                                <TableHead className="text-right">重量 (kg)</TableHead>
                                <TableHead className="text-right">回数</TableHead>
                              </>
                            );
                          case 'bodyweight':
                            return <TableHead className="text-right">回数</TableHead>;
                          case 'time':
                            return <TableHead className="text-right">時間</TableHead>;
                          case 'distance':
                            return <TableHead className="text-right">距離 (km)</TableHead>;
                          default:
                            return null;
                        }
                      })()}
                      {exercise.hasSideOption && (
                        <TableHead className="text-right">左右</TableHead>
                      )}
                      <TableHead className="text-right">ボリューム</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exercise.sets.map((set, setIndex) => (
                      <TableRow key={set.id || setIndex}>
                        <TableCell>{setIndex + 1}</TableCell>
                        {(() => {
                          const menuType = resolveMenuType(exercise);
                          switch (menuType) {
                            case 'weight':
                              return (
                                <>
                                  <TableCell className="text-right">{Number(set.weight ?? 0) || '-'}</TableCell>
                                  <TableCell className="text-right">{Number(set.reps ?? 0) || '-'}</TableCell>
                                </>
                              );
                            case 'bodyweight':
                              return (
                                <TableCell className="text-right">{Number(set.reps ?? 0) || '-'}</TableCell>
                              );
                            case 'time': {
                              const seconds = Number(set.duration ?? set.time ?? 0);
                              return (
                                <TableCell className="text-right">
                                  {seconds > 0 ? formatSecondsDisplay(seconds) : '-'}
                                </TableCell>
                              );
                            }
                            case 'distance': {
                              const distance = Number(set.distance ?? 0);
                              return (
                                <TableCell className="text-right">
                                  {distance > 0 ? Number(distance.toFixed(2)) : '-'}
                                </TableCell>
                              );
                            }
                            default:
                              return null;
                          }
                        })()}
                        {exercise.hasSideOption && (
                          <TableCell className="text-right">
                            {set.side === 'both' ? '両方' : set.side === 'left' ? '左' : '右'}
                          </TableCell>
                        )}
                        <TableCell className="text-right font-medium">
                          {calculateSetVolume(resolveMenuType(exercise), set)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
            {exercise.notes && (
              <CardFooter className="bg-gray-50 px-6 py-3 text-sm text-gray-600 border-t">
                <div className="flex items-start">
                  <span className="font-medium mr-2">メモ:</span>
                  <span className="whitespace-pre-line">{exercise.notes}</span>
                </div>
              </CardFooter>
            )}
          </Card>
        ))}

        <div className="bg-white rounded-lg border p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-lg font-medium">合計ボリューム</h3>
              <p className="text-3xl font-bold text-primary">
                {formatTotalVolumeLabel(workout)}
              </p>
              <div className="mt-2 text-sm text-gray-500 flex flex-wrap gap-3">
                <span>開始 {startTimeDisplay}</span>
                <span>終了 {endTimeDisplay}</span>
                <span>所要時間 {durationDisplay}</span>
              </div>
            </div>
            {workout.notes && (
              <div className="w-full sm:w-auto">
                <h4 className="font-medium mb-2">メモ</h4>
                <div className="bg-gray-50 p-4 rounded-md whitespace-pre-line">
                  {workout.notes}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は元に戻せません。このトレーニング記録を削除すると、関連するすべてのデータが完全に削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? '削除中...' : '削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
