'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Workout } from '@/types/workout';
import { useRouter } from 'next/navigation';

interface WorkoutCardProps {
  workout: Workout;
  showEditButton?: boolean;
}

export function WorkoutCard({ workout, showEditButton = false }: WorkoutCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const router = useRouter();

  const formatTime = (date?: Date) => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date as any);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
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

  const calculateExerciseVolume = (exercise: any): number => {
    const type = (exercise as any).menuType || exercise.type;
    if (type !== 'weight') return 0;
    return (exercise.sets || []).reduce((sum: number, set: any) => sum + Number(set.weight || 0) * Number(set.reps || 0), 0);
  };

  const handleEdit = () => {
    router.push(`/workouts/${workout.id}/edit`);
  };

  return (
    <Card className="p-4 mb-4">
      <div className="mb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">📅 {formatDate(workout.date)}</h3>
          <div className="flex items-center gap-2">
            {showEditButton && (
              <Button variant="outline" size="sm" onClick={handleEdit}>編集</Button>
            )}
            <button onClick={() => setIsExpanded(!isExpanded)} className="text-xl">
              {isExpanded ? '▲' : '▼'}
            </button>
          </div>
        </div>
        <div className="text-sm text-gray-500">
          開始 {formatTime(workout.startTime)} 終了 {formatTime(workout.endTime)}
        </div>
      </div>

      {!isExpanded && (
        <div className="text-gray-700 font-medium">
          {workout.exercises.map(ex => ex.name).join('、')}
        </div>
      )}

      {isExpanded && (
        <div className="mt-4 space-y-4">
          <div className="space-y-1 text-sm">
            <div>⏱️ トレーニング時間: {workout.duration ?? 0}分</div>
            <div>🔥 ウォームアップ: {formatSeconds((workout as any).warmupDuration as number)}</div>
            <div>❄️ クールダウン: {formatSeconds((workout as any).cooldownDuration as number)}</div>
          </div>

          {workout.exercises.map((exercise) => (
            <div key={exercise.id} className="border-t pt-3">
              <div className="font-semibold text-base mb-1">{exercise.name}</div>
              {typeof (exercise as any).durationSeconds === 'number' && (exercise as any).durationSeconds > 0 && (
                <div className="text-sm text-gray-600 mb-2">所要時間　{formatSeconds((exercise as any).durationSeconds as number)}</div>
              )}
              <div className="text-sm text-gray-600 mb-2">
                セット数: {exercise.sets.length}　/　総重量{calculateExerciseVolume(exercise)}kg
              </div>
              <div className="space-y-1">
                {exercise.sets.map((set, idx) => (
                  <div key={idx} className="text-sm text-gray-600">
                    {Number(set.weight || 0)}kg　{Number(set.reps || 0)}回
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
