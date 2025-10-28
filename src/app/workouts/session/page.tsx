'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getMenus } from '@/services/menuService';
import { createWorkout } from '@/services/workoutService';
import type { Menu, MenuType } from '@/types/menu';
import type { Workout, WorkoutExercise, ExerciseSet } from '@/types/workout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2 } from 'lucide-react';

function formatElapsedTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((safeSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

// Always show as N分M秒 (0分X秒 supported)
function formatTime(totalSeconds?: number): string {
  const s = Number(totalSeconds ?? 0);
  const safe = Number.isFinite(s) && s > 0 ? Math.round(s) : 0;
  const m = Math.floor(safe / 60);
  const r = safe % 60;
  return `${m}分${r}秒`;
}

function formatSavedTitleDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const w = weekdays[d.getDay()];
    return `${mm}/${dd}(${w})`;
  } catch {
    return dateStr;
  }
}

const generateId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

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

const createDefaultSet = (type: Menu['type'] = 'weight'): ExerciseSet => {
  switch (type) {
    case 'bodyweight':
      return {
        id: generateId(),
        reps: 12
      };
    case 'time': {
      const seconds = 60;
      return {
        id: generateId(),
        time: seconds,
        duration: seconds
      };
    }
    case 'distance':
      return {
        id: generateId(),
        distance: 1
      };
    case 'weight':
    default:
      return {
        id: generateId(),
        weight: 20,
        reps: 10
      };
  }
};

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
  if (seconds === undefined || seconds === null || Number.isNaN(seconds) || seconds <= 0) {
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

const computeVolumeForSets = (sets: ExerciseSet[], type: MenuType): number => {
  switch (type) {
    case 'bodyweight':
      return sets.reduce((total, set) => {
        const reps = Number(set.reps ?? 0);
        return total + (Number.isNaN(reps) ? 0 : reps);
      }, 0);
    case 'time':
      return sets.reduce((total, set) => {
        const seconds = Number(set.time ?? set.duration ?? 0);
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
};

const formatVolumeLabel = (volume: number, type: MenuType): string => {
  switch (type) {
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

const formatSetSummary = (set: ExerciseSet, index: number, type: MenuType): string => {
  const prefix = `セット ${index + 1}: `;
  switch (type) {
    case 'bodyweight': {
      const reps = Number(set.reps ?? 0);
      return `${prefix}${reps > 0 ? `${reps}回` : '-'}`;
    }
    case 'time': {
      const seconds = Number(set.time ?? set.duration ?? 0);
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

const getSetGridClass = (type: MenuType) =>
  type === 'weight' ? 'sm:grid-cols-[repeat(2,minmax(0,1fr))_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]';

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

const formatDurationMinutes = (minutes?: number) => {
  if (!minutes || minutes <= 0) return '-';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return `${hours}時間${rest}分`;
  if (hours > 0) return `${hours}時間`;
  return `${rest}分`;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value as string | number);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const formatTimeLabel = (value: unknown) => {
  const date = toDate(value);
  if (!date) return '--:--';
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

const todayISODate = () => new Date().toISOString().split('T')[0];

export default function SessionPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [sessionEndTime, setSessionEndTime] = useState<Date | null>(null);

  const [menus, setMenus] = useState<Menu[]>([]);
  const [isMenuLoading, setIsMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);

  const [date, setDate] = useState<string>(todayISODate());
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [sets, setSets] = useState<ExerciseSet[]>([createDefaultSet('weight')]);
  const [notes, setNotes] = useState('');
  const [currentMenuType, setCurrentMenuType] = useState<Menu['type']>('weight');

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [currentMenuStartTime, setCurrentMenuStartTime] = useState<Date | null>(null);
  const [currentLapSeconds, setCurrentLapSeconds] = useState(0);

  // removed savedWorkouts flow; using savedExercises instead
  // recorded seconds
  const [warmupSeconds, setWarmupSeconds] = useState<number>(0);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  // live timer counters (seconds)
  const [isWarmupRunning, setIsWarmupRunning] = useState(false);
  const [warmupTimerSeconds, setWarmupTimerSeconds] = useState(0);
  const [isCooldownRunning, setIsCooldownRunning] = useState(false);
  const [cooldownTimerSeconds, setCooldownTimerSeconds] = useState(0);
  const [warmupRecorded, setWarmupRecorded] = useState(false);
  const [cooldownRecorded, setCooldownRecorded] = useState(false);
  // flow control flags
  const [warmupStarted, setWarmupStarted] = useState(false);
  const [workoutRecorded, setWorkoutRecorded] = useState(false);
  const [cooldownStarted, setCooldownStarted] = useState(false);
  // cooldown section availability is controlled by explicit end-workout action
  const [cooldownAvailable, setCooldownAvailable] = useState(false);
  // recorded snapshot seconds (persisted when pressing 記録)
  const [recordedWarmupSeconds, setRecordedWarmupSeconds] = useState(0);
  const [recordedCooldownSeconds, setRecordedCooldownSeconds] = useState(0);

  const [isFinishing, setIsFinishing] = useState(false);

  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<{ menuCount: number; totalVolume: number; duration: number; warmup: number; cooldown: number }>({ menuCount: 0, totalVolume: 0, duration: 0, warmup: 0, cooldown: 0 });

  const [savedExercises, setSavedExercises] = useState<WorkoutExercise[]>([]);

  useEffect(() => {
    if (!user) {
      setIsRunning(false);
      return;
    }

    setIsMenuLoading(true);
    setMenuError(null);

    getMenus(user.uid)
      .then(fetched => {
        const sorted = [...fetched].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setMenus(sorted);
      })
      .catch(err => {
        console.error('メニューの取得に失敗しました:', err);
        setMenuError('メニューの取得に失敗しました。時間をおいて再度お試しください。');
      })
      .finally(() => setIsMenuLoading(false));
  }, [user]);

  // Independent timers for warmup/cooldown
  useEffect(() => {
    if (!isWarmupRunning) return;
    const id = window.setInterval(() => setWarmupTimerSeconds(prev => prev + 1), 1000);
    return () => window.clearInterval(id);
  }, [isWarmupRunning]);

  useEffect(() => {
    if (!isCooldownRunning) return;
    const id = window.setInterval(() => setCooldownTimerSeconds(prev => prev + 1), 1000);
    return () => window.clearInterval(id);
  }, [isCooldownRunning]);

  const startWarmup = () => {
    setIsWarmupRunning(true);
    setWarmupRecorded(false);
    setWarmupStarted(true);
  };
  const stopWarmup = () => {
    setIsWarmupRunning(false);
    setWarmupSeconds(warmupTimerSeconds);
    setWarmupRecorded(true);
  };
  const resumeWarmup = () => {
    if (!isWarmupRunning) setIsWarmupRunning(true);
  };
  const recordWarmup = () => {
    setWarmupSeconds(warmupTimerSeconds);
    setWarmupRecorded(true);
  };
  const resetWarmup = () => {
    setIsWarmupRunning(false);
    setWarmupTimerSeconds(0);
    setWarmupSeconds(0);
    setWarmupRecorded(false);
  };

  const startCooldown = () => {
    setIsCooldownRunning(true);
    setCooldownRecorded(false);
    setCooldownStarted(true);
  };
  const stopCooldown = () => {
    setIsCooldownRunning(false);
    setCooldownSeconds(cooldownTimerSeconds);
    setCooldownRecorded(true);
  };
  const resumeCooldown = () => {
    if (!isCooldownRunning) setIsCooldownRunning(true);
  };
  const recordCooldown = () => {
    setCooldownSeconds(cooldownTimerSeconds);
    setCooldownRecorded(true);
  };
  const resetCooldown = () => {
    setIsCooldownRunning(false);
    setCooldownTimerSeconds(0);
    setCooldownSeconds(0);
    setCooldownRecorded(false);
  };

  // removed fetching today's workouts; accumulating locally in savedExercises

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timerId = window.setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [isRunning]);

  useEffect(() => {
    if (!currentMenuStartTime) {
      setCurrentLapSeconds(0);
      return;
    }

    const updateLap = () => {
      setCurrentLapSeconds(Math.max(0, Math.floor((Date.now() - currentMenuStartTime.getTime()) / 1000)));
    };

    updateLap();
    const lapTimerId = window.setInterval(updateLap, 1000);
    return () => window.clearInterval(lapTimerId);
  }, [currentMenuStartTime]);

  useEffect(() => {
    if (selectedMenuId) {
      setCurrentMenuStartTime(new Date());
    } else {
      setCurrentMenuStartTime(null);
    }
    setCurrentLapSeconds(0);
  }, [selectedMenuId]);

  const formattedElapsed = useMemo(() => formatElapsedTime(elapsedSeconds), [elapsedSeconds]);
  const sessionStartLabel = useMemo(
    () =>
      sessionStartTime
        ? sessionStartTime.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          })
        : null,
    [sessionStartTime]
  );
  const formattedCurrentLap = useMemo(() => formatElapsedTime(currentLapSeconds), [currentLapSeconds]);

  const trainingTimeSeconds = useMemo(
    () => Math.max(0, (Number(elapsedSeconds) || 0) - (Number(warmupSeconds) || 0) - (Number(cooldownSeconds) || 0)),
    [elapsedSeconds, warmupSeconds, cooldownSeconds]
  );

  const totalVolume = useMemo(() => computeVolumeForSets(sets, currentMenuType), [sets, currentMenuType]);

  const selectedMenu = useMemo(() => menus.find(menu => menu.id === selectedMenuId), [menus, selectedMenuId]);

  const handleStart = () => {
    if (!user) {
      setIsRunning(false);
      return;
    }
    if (!sessionStartTime) {
      const now = new Date();
      setSessionStartTime(now);
      setElapsedSeconds(0);
    }
    setSessionEndTime(null);
    setIsRunning(true);
    // reset flow flags
    setWarmupStarted(false);
    setWarmupRecorded(false);
    setWorkoutRecorded(false);
    setCooldownStarted(false);
    setCooldownAvailable(false);
    // reset timers and recorded snapshots
    setWarmupTimerSeconds(0);
    setCooldownTimerSeconds(0);
    setWarmupSeconds(0);
    setCooldownSeconds(0);
    setRecordedWarmupSeconds(0);
    setRecordedCooldownSeconds(0);
  };

  const handlePause = () => {
    if (!sessionStartTime) {
      return;
    }
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setElapsedSeconds(0);
    setSessionStartTime(null);
    setSessionEndTime(null);
  };

  const handleResume = () => {
    if (!sessionStartTime || isRunning) {
      return;
    }
    setSessionEndTime(null);
    setIsRunning(true);
  };

  const handleSessionFinish = async () => {
    // 二重実行防止（保存中または終了処理中は無視）
    if (isSaving || isFinishing) {
      return;
    }
    // 終了処理開始フラグを即座に立てる
    setIsFinishing(true);
    // セッション終了時はすべてのタイマーを停止
    setIsRunning(false);
    setIsWarmupRunning(false);
    setIsCooldownRunning(false);
    // 現在値をスナップショットして非同期間の変化を防ぐ
    // Use recorded snapshot seconds captured by 記録 buttons
    const capturedWarmup = recordedWarmupSeconds;
    const capturedCooldown = recordedCooldownSeconds;

    console.log('=== handleSessionFinish 開始 ===');
    console.log('warmupSeconds(captured):', capturedWarmup);
    console.log('cooldownSeconds(captured):', capturedCooldown);

    // 成果サマリーを計算（保存予定のエクササイズ）
    const now = new Date();
    const sessionStart = sessionStartTime ?? now;
    const sessionEnd = now;
    const durationMinutes = Math.max(0, Math.round((sessionEnd.getTime() - sessionStart.getTime()) / 60000));

    const totalVolume = savedExercises.reduce((sum, ex) => {
      const mType = resolveExerciseMenuType(ex);
      if (mType !== 'weight') return sum;
      const vol = ex.sets.reduce((acc, s) => acc + (Number(s.weight || 0) * Number(s.reps || 0)), 0);
      return sum + vol;
    }, 0);

    setSessionSummary({
      menuCount: savedExercises.length,
      totalVolume: Math.round(totalVolume),
      duration: durationMinutes,
      warmup: capturedWarmup,
      cooldown: capturedCooldown
    });

    // Firestoreに保存（1回のみ）
    if (savedExercises.length > 0 && user) {
      const workoutPayload: Omit<Workout, 'id'> = {
        userId: user.uid,
        date,
        exercises: savedExercises,
        totalVolume: Math.round(totalVolume),
        createdAt: now,
        startTime: sessionStart,
        endTime: sessionEnd,
        duration: durationMinutes,
        warmupDuration: capturedWarmup,
        cooldownDuration: capturedCooldown
      };

      setIsSaving(true);
      try {
        await createWorkout(user.uid, workoutPayload);
        setSavedExercises([]);
        console.log('ワークアウト保存成功');
      } catch (err) {
        console.error('ワークアウト保存失敗:', err);
        setIsFinishing(false);
        setIsSaving(false);
        setSaveError('セッションの保存に失敗しました。');
        return;
      } finally {
        setIsSaving(false);
      }
    }

    setShowCompletionModal(true);
  };

  const handleWarmupRecord = () => {
    setIsWarmupRunning(false);
    setWarmupSeconds(warmupTimerSeconds);
    setWarmupRecorded(true);
    setRecordedWarmupSeconds(warmupTimerSeconds);
  };

  const handleCooldownRecord = () => {
    setIsCooldownRunning(false);
    setCooldownSeconds(cooldownTimerSeconds);
    setCooldownRecorded(true);
    setRecordedCooldownSeconds(cooldownTimerSeconds);
  };

  const handleMenuSelect = (value: string) => {
    const menu = menus.find(item => item.id === value);
    const type = menu?.type ?? 'weight';
    setSelectedMenuId(value);
    setCurrentMenuType(type);
    setSets([createDefaultSet(type)]);
    setNotes('');
    setSuccessMessage(null);
    setSaveError(null);
  };

  const handleAddSet = () => {
    setSets(prev => {
      const lastSet = prev[prev.length - 1];
      const newSet: ExerciseSet = {
        id: generateId(),
        weight: currentMenuType === 'weight' ? lastSet?.weight ?? 20 : undefined,
        reps:
          currentMenuType === 'weight' || currentMenuType === 'bodyweight'
            ? lastSet?.reps ?? 10
            : undefined,
        time: currentMenuType === 'time' ? lastSet?.time ?? lastSet?.duration ?? 60 : undefined,
        duration: currentMenuType === 'time' ? lastSet?.duration ?? lastSet?.time ?? 60 : undefined,
        distance: currentMenuType === 'distance' ? lastSet?.distance ?? 1 : undefined
      };
      return [...prev, newSet];
    });
  };

  const handleRemoveSet = (setId: string) => {
    setSets(prev => (prev.length <= 1 ? prev : prev.filter(set => set.id !== setId)));
  };

  const handleNumericInputChange = (
    setId: string,
    field: 'weight' | 'reps' | 'distance',
    rawValue: string
  ) => {
    setSets(prev =>
      prev.map(set => {
        if (set.id !== setId) {
          return set;
        }

        if (!rawValue.trim()) {
          return {
            ...set,
            [field]: undefined
          } as ExerciseSet;
        }

        const parsed = Number(rawValue);
        if (Number.isNaN(parsed)) {
          return set;
        }

        return {
          ...set,
          [field]: parsed
        } as ExerciseSet;
      })
    );
  };

  const handleTimeChange = (setId: string, value: string) => {
    const seconds = parseTimeInput(value);
    setSets(prev =>
      prev.map(set =>
        set.id === setId
          ? {
              ...set,
              time: seconds,
              duration: seconds
            }
          : set
      )
    );
  };

  // 現在選択中のメニューをメモリに保存（Firestoreには保存しない）
  const handleSaveExercise = () => {
    if (!selectedMenuId) {
      setSaveError('メニューを選択してください。');
      return;
    }
    const selected = menus.find(menu => menu.id === selectedMenuId);
    if (!selected) {
      setSaveError('選択されたメニューが見つかりません。');
      return;
    }

    const cleanedSets: ExerciseSet[] = [];
    sets.forEach(set => {
      const baseId = set.id ?? generateId();
      switch (selected.type) {
        case 'weight': {
          const weight = Number(set.weight) || 0;
          const reps = Number(set.reps) || 0;
          if (weight > 0 && reps > 0) cleanedSets.push({ id: baseId, weight, reps });
          break;
        }
        case 'bodyweight': {
          const reps = Number(set.reps) || 0;
          if (reps > 0) cleanedSets.push({ id: baseId, reps });
          break;
        }
        case 'time': {
          const timeSeconds = Number(set.time ?? set.duration ?? 0);
          if (timeSeconds > 0) cleanedSets.push({ id: baseId, time: timeSeconds, duration: timeSeconds });
          break;
        }
        case 'distance': {
          const distance = Number(set.distance ?? 0);
          if (distance > 0) cleanedSets.push({ id: baseId, distance });
          break;
        }
        default:
          break;
      }
    });

    if (cleanedSets.length === 0) {
      setSaveError('有効なセットを1つ以上入力してください。');
      return;
    }

    const exercise: WorkoutExercise = {
      id: generateId(),
      name: selected.name,
      type: mapMenuTypeToExerciseType(selected.type),
      menuType: selected.type,
      hasSideOption: selected.hasSides,
      category: getPrimaryCategory(selected.category),
      sets: cleanedSets,
      notes: notes.trim() || undefined,
      durationSeconds: currentLapSeconds
    };

    setSavedExercises(prev => [...prev, exercise]);
    setWorkoutRecorded(true);
    setSuccessMessage('メニューを保存しました。');
    resetMenuForm();
    setCurrentMenuStartTime(new Date());
    setCurrentLapSeconds(0);
  };

  // メニュー保存時の軽量リセット（ウォームアップ/クールダウンは保持）
  const resetMenuForm = () => {
    setSelectedMenuId('');
    setCurrentMenuType('weight');
    setSets([createDefaultSet('weight')]);
    setNotes('');
    setCurrentMenuStartTime(null);
    setCurrentLapSeconds(0);
    // ウォームアップ/クールダウンの記録・カウンタは保持
  };

  // セッション終了時のフルリセット（すべて初期化）
  const resetAllForm = () => {
    // セッション関連
    setIsRunning(false);
    setElapsedSeconds(0);
    setSessionStartTime(null);
    setSessionEndTime(null);
    // ウォームアップ
    setIsWarmupRunning(false);
    setWarmupTimerSeconds(0);
    setWarmupSeconds(0);
    setWarmupRecorded(false);
    // クールダウン
    setIsCooldownRunning(false);
    setCooldownTimerSeconds(0);
    setCooldownSeconds(0);
    setCooldownRecorded(false);
    setCooldownAvailable(false);
    // メニュー
    setSelectedMenuId('');
    setCurrentMenuType('weight');
    setSets([createDefaultSet('weight')]);
    setNotes('');
    setCurrentMenuStartTime(null);
    setCurrentLapSeconds(0);
    // 日付
    setDate(todayISODate());
  };

  // removed legacy handleSave (was saving to Firestore per exercise)

  // removed handleEndSession; finish flow handled in handleSessionFinish

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      {/* Date Card at top */}
      <Card>
        <CardHeader>
          <CardTitle>日付</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Label htmlFor="session-date-top">日付</Label>
            <Input id="session-date-top" type="date" value={date} onChange={e => setDate(e.target.value)} max={todayISODate()} className="mt-1" />
          </div>
        </CardContent>
      </Card>

      {/* Session Timer Card (primary) */}
      <Card className="border-2 border-primary">
        <CardHeader>
          <CardTitle>セッションタイマー</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">メニュー変更時にラップを計測します。</p>
              {sessionStartLabel && (
                <p className="mt-1 text-sm text-muted-foreground">
                  トレーニングを開始しました: <span className="font-medium text-foreground">{sessionStartLabel}</span>
                </p>
              )}
            </div>
            <div className="text-3xl font-bold tracking-tight">
              {formattedElapsed}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={handleStart} disabled={Boolean(sessionStartTime)}>
                セッション開始
              </Button>
              <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSessionFinish} disabled={!sessionStartTime || isSaving || isFinishing || savedExercises.length === 0}>
                セッション終了
              </Button>
              <Button type="button" variant="destructive" onClick={handlePause} disabled={!isRunning}>
                停止
              </Button>
              <Button type="button" variant="outline" onClick={handleResume} disabled={isRunning || !sessionStartTime}>
                再開
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">開始時刻</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{sessionStartLabel ?? '--:--'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">経過時間</p>
              <p className="mt-1 text-lg font-semibold text-primary">{formattedElapsed}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">現在のメニュー</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formattedCurrentLap}</p>
            </div>
          </div>

          {sessionStartTime && (
            <div className="mt-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground/80">【トレーニング内訳】</p>
              <ul className="mt-1 space-y-1">
                <li>・ウォームアップ: {warmupSeconds > 0 ? formatTime(warmupSeconds) : '-'}</li>
                <li>・筋トレ: {formatTime(trainingTimeSeconds)}</li>
                <li>・クールダウン: {cooldownSeconds > 0 ? formatTime(cooldownSeconds) : '-'}</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Warmup Timer Card (always visible) */}
      <Card className={`${!sessionStartTime ? 'opacity-50' : ''}`}>
        <CardHeader>
          <CardTitle>
            ウォームアップタイマー
            {!sessionStartTime && (
              <span className="text-sm text-red-500 ml-2">※ セッション開始後に利用可能</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!sessionStartTime && (
            <div className="text-sm text-muted-foreground">セッションを開始してください</div>
          )}
          <div className="text-2xl font-bold tracking-tight">{formatTime(warmupTimerSeconds)}</div>
          {(warmupRecorded || warmupSeconds > 0) && (
            <div className="text-sm text-emerald-600">✅ 記録: {formatTime(warmupSeconds)}</div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={startWarmup} disabled={!sessionStartTime || isWarmupRunning}>開始</Button>
            <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleWarmupRecord} disabled={!sessionStartTime || !isWarmupRunning}>記録</Button>
          </div>
        </CardContent>
      </Card>

      {/* Cooldown Timer Card (visible after ending workout) */}
      {cooldownAvailable && (
      <Card className={`${(!sessionStartTime) ? 'opacity-50' : ''}`}>
        <CardHeader>
          <CardTitle>
            クールダウンタイマー
            {!sessionStartTime && (
              <span className="text-sm text-red-500 ml-2">※ セッション開始後に利用可能</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!sessionStartTime && (
            <div className="text-sm text-muted-foreground">セッションを開始してください</div>
          )}
          <div className="text-2xl font-bold tracking-tight">{formatTime(cooldownTimerSeconds)}</div>
          {(cooldownRecorded || cooldownSeconds > 0) && (
            <div className="text-sm text-emerald-600">✅ 記録: {formatTime(cooldownSeconds)}</div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={startCooldown} disabled={!sessionStartTime || !cooldownAvailable || isCooldownRunning}>開始</Button>
            <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCooldownRecord} disabled={!sessionStartTime || !isCooldownRunning}>記録</Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Existing menu and set editor section remains below */}

      {menuError && (
        <Alert variant="destructive">
          <AlertTitle>メニュー取得エラー</AlertTitle>
          <AlertDescription>{menuError}</AlertDescription>
        </Alert>
      )}

      

      {successMessage && (
        <Alert>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          <Card className={`${(!sessionStartTime || !warmupRecorded) ? 'opacity-50' : ''}`}>
            <CardHeader>
              <CardTitle>
                ワークアウト
                {!sessionStartTime && (
                  <span className="text-sm text-red-500 ml-2">※ セッション開始後に利用可能</span>
                )}
                {sessionStartTime && !warmupRecorded && (
                  <span className="text-sm text-red-500 ml-2">※ ウォームアップ記録後に利用可能</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className={`space-y-6 ${(!sessionStartTime || !warmupRecorded) ? 'pointer-events-none' : ''}`}>
              <div className="rounded-md border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">現在のメニュー経過時間</p>
                <p className="text-2xl font-semibold">{formattedCurrentLap}</p>
              </div>

              <div className="pt-2 border-t">
                <div className="flex justify-center">
                  <Button
                    type="button"
                    className="bg-orange-600 hover:bg-orange-700"
                    onClick={() => setCooldownAvailable(true)}
                    disabled={!sessionStartTime || savedExercises.length === 0 || cooldownAvailable}
                  >
                    ワークアウトを終了する
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>メニュー</Label>
                  <Select value={selectedMenuId} onValueChange={handleMenuSelect} disabled={isMenuLoading || !menus.length || !sessionStartTime || !warmupRecorded}>
                    <SelectTrigger className="mt-1 h-14 text-lg">
                      <SelectValue placeholder={isMenuLoading ? '読み込み中...' : 'メニューを選択'} />
                    </SelectTrigger>
                    <SelectContent>
                      {menus.map(menu => (
                        <SelectItem key={menu.id} value={menu.id}>
                          {menu.name} {menu.category?.length ? `(${menu.category.join(' / ')})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isMenuLoading && (
                    <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> メニューを読み込んでいます...
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center">
                  <h3 className="text-sm font-medium">セット</h3>
                </div>

                <div className="space-y-3">
                  {sets.map((set, index) => (
                    <div
                      key={set.id}
                      className={`grid gap-3 rounded-md border p-4 ${getSetGridClass(currentMenuType)} sm:items-end`}
                    >
                      {currentMenuType === 'weight' && (
                        <>
                          <div>
                            <Label htmlFor={`weight-${set.id}`}>重量 (kg)</Label>
                            <Input
                              id={`weight-${set.id}`}
                              type="number"
                              step="0.1"
                              min="0"
                              value={set.weight ?? ''}
                              onChange={event =>
                                handleNumericInputChange(set.id, 'weight', event.target.value)
                              }
                              className="mt-1"
                              disabled={!selectedMenuId || !sessionStartTime || !warmupRecorded}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`reps-${set.id}`}>回数</Label>
                            <Input
                              id={`reps-${set.id}`}
                              type="number"
                              min="0"
                              value={set.reps ?? ''}
                              onChange={event =>
                                handleNumericInputChange(set.id, 'reps', event.target.value)
                              }
                              className="mt-1"
                              disabled={!selectedMenuId || !sessionStartTime || !warmupRecorded}
                            />
                          </div>
                        </>
                      )}

                      {currentMenuType === 'bodyweight' && (
                        <div>
                          <Label htmlFor={`reps-${set.id}`}>回数</Label>
                          <Input
                            id={`reps-${set.id}`}
                            type="number"
                            min="0"
                            value={set.reps ?? ''}
                            onChange={event =>
                              handleNumericInputChange(set.id, 'reps', event.target.value)
                            }
                            className="mt-1"
                            disabled={!selectedMenuId || !sessionStartTime || !warmupRecorded}
                          />
                        </div>
                      )}

                      {currentMenuType === 'time' && (
                        <div>
                          <Label htmlFor={`time-${set.id}`}>時間 (秒 または 分:秒)</Label>
                          <Input
                            id={`time-${set.id}`}
                            type="text"
                            value={formatSecondsForInput(set.time ?? set.duration)}
                            onChange={event => handleTimeChange(set.id, event.target.value)}
                            className="mt-1"
                            disabled={!selectedMenuId}
                          />
                        </div>
                      )}

                      {currentMenuType === 'distance' && (
                        <div>
                          <Label htmlFor={`distance-${set.id}`}>距離 (km)</Label>
                          <Input
                            id={`distance-${set.id}`}
                            type="number"
                            step="0.1"
                            min="0"
                            value={set.distance ?? ''}
                            onChange={event =>
                              handleNumericInputChange(set.id, 'distance', event.target.value)
                            }
                            className="mt-1"
                            disabled={!selectedMenuId}
                          />
                        </div>
                      )}

                      <div className="flex items-end justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveSet(set.id)}
                          disabled={sets.length <= 1}
                          aria-label={`セット${index + 1}を削除`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <Button type="button" onClick={handleAddSet} variant="outline" size="sm" disabled={!selectedMenuId}>
                    <Plus className="mr-1 h-4 w-4" /> セットを追加
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="notes">メモ (任意)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={event => setNotes(event.target.value)}
                  className="mt-1"
                  placeholder="メニューの詳細や気づきを記録"
                  disabled={!selectedMenuId || !sessionStartTime || !warmupRecorded}
                />
              </div>

              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center mt-4 mb-4">
                <div className="text-sm text-muted-foreground">
                  <span>セット数: {sets.length}</span>
                  <span className="ml-4">総ボリューム: {formatVolumeLabel(totalVolume, currentMenuType)}</span>
                </div>
                <Button
                  type="button"
                  onClick={handleSaveExercise}
                  disabled={!sessionStartTime || !warmupRecorded || !selectedMenuId || sets.length === 0}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  このメニューを保存
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{formatSavedTitleDate(date)}に記録したメニュー</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {savedExercises.length === 0 ? (
                <p className="text-sm text-muted-foreground">まだ{formatSavedTitleDate(date)}の記録はありません。</p>
              ) : (
                savedExercises.map((exercise, idx) => {
                  const menuType = resolveExerciseMenuType(exercise);
                  const volume = exercise.sets?.length ? computeVolumeForSets(exercise.sets, menuType) : 0;
                  const lapLabel = exercise.durationSeconds ? formatSecondsDisplay(exercise.durationSeconds) : '-';
                  return (
                    <div key={exercise.id ?? idx} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold">{exercise.name}</h3>
                            <Badge className={TYPE_BADGE_STYLES[menuType]}>{getMenuTypeLabel(menuType)}</Badge>
                          </div>
                        </div>
                        <span className="text-sm text-muted-foreground">ラップタイム: {lapLabel}</span>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                        <div>セット数: {exercise.sets?.length ?? 0}</div>
                        <div>総ボリューム: {formatVolumeLabel(volume, menuType)}</div>
                        <div>ラップタイム: {lapLabel}</div>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        {exercise.sets?.map((set, setIndex) => (
                          <div key={set.id ?? `${exercise.id}-${setIndex}`}>
                            {formatSetSummary(set, setIndex, menuType)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </aside>
      </section>

      {showCompletionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-4"> お疲れ様でした！</h2>
              <p className="text-gray-600 mb-6">
                本日もトレーニング頑張りましたね！<br />
                継続は力なり。次回も頑張りましょう
              </p>
              <div className="bg-gray-50 rounded-lg p-6 mb-6 text-left">
                <h3 className="font-semibold text-lg mb-4"> 今日の成果</h3>
                <div className="space-y-2 text-gray-700">
                  <p>・実施メニュー: <span className="font-semibold">{sessionSummary.menuCount}種目</span></p>
                  {sessionSummary.totalVolume > 0 && (
                    <p>・総ボリューム: <span className="font-semibold">{sessionSummary.totalVolume.toLocaleString()} kg</span></p>
                  )}
                  <p>・トレーニング時間: <span className="font-semibold">{sessionSummary.duration}分</span></p>
                  <p>・ウォームアップ: <span className="font-semibold">{formatSecondsDisplay(sessionSummary.warmup)}</span></p>
                  <p>・クールダウン: <span className="font-semibold">{formatSecondsDisplay(sessionSummary.cooldown)}</span></p>
                </div>
              </div>
              <button
                onClick={() => { setIsFinishing(false); router.push('/'); }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                ダッシュボードへ戻る
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
