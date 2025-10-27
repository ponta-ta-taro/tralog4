import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  Timestamp,
  where
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Workout, WorkoutExercise, ExerciseSet } from '@/types/workout';
import type { MenuType } from '@/types/menu';

const WORKOUTS_COLLECTION = 'workouts';

const MENU_TYPE_VALUES: readonly MenuType[] = ['weight', 'bodyweight', 'time', 'distance'] as const;

type WeeklyVolumeByType = Record<MenuType, number>;

type FirestoreTimestampLike =
  | Timestamp
  | { seconds: number; nanoseconds?: number }
  | string
  | number
  | Date
  | null
  | undefined;

type WorkoutDoc = {
  userId?: string;
  date: FirestoreTimestampLike;
  exercises?: Array<Partial<WorkoutExercise> & { sets?: ExerciseSet[]; menuName?: string; name?: string; menuType?: MenuType }>;
  notes?: string;
  totalVolume?: number;
  createdAt?: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;
  startTime?: FirestoreTimestampLike;
  endTime?: FirestoreTimestampLike;
  duration?: number;
  warmupDuration?: number;
  cooldownDuration?: number;
};

const createInitialVolumeByType = (): WeeklyVolumeByType => ({
  weight: 0,
  bodyweight: 0,
  time: 0,
  distance: 0
});

const parseNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Get today's workouts (JST)
export const getTodaysWorkouts = async (userId: string): Promise<Workout[]> => {
  try {
    console.log('=== getTodaysWorkouts 開始 ===');

    // JST 今日の yyyy-MM-dd を作成（週次集計と同じ方式）
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstDate = new Date(now.getTime() + jstOffset);
    const todayStr = jstDate.toISOString().split('T')[0];

    // 当日開始(UTC)と翌日開始(UTC)を生成
    const startOfDay = new Date(`${todayStr}T00:00:00Z`);
    const nextDay = new Date(startOfDay);
    nextDay.setDate(nextDay.getDate() + 1);

    const workoutsRef = collection(db, `users/${userId}/${WORKOUTS_COLLECTION}`);
    const q = query(
      workoutsRef,
      where('date', '>=', Timestamp.fromDate(startOfDay)),
      where('date', '<', Timestamp.fromDate(nextDay)),
      orderBy('date', 'desc')
    );

    const snap = await getDocs(q);

    const workouts: Workout[] = snap.docs.map((docSnap) => {
      const data = docSnap.data() as WorkoutDoc;
      const date = convertToDate(data.date);
      const createdAt = data.createdAt ? convertToDate(data.createdAt) : new Date();
      const updatedAt = data.updatedAt ? convertToDate(data.updatedAt) : new Date();
      const startTime = data.startTime ? convertToDate(data.startTime) : undefined;
      const endTime = data.endTime ? convertToDate(data.endTime) : undefined;

      const workout: Workout = {
        id: docSnap.id,
        userId: data.userId || userId,
        date: date.toISOString(),
        exercises: (data.exercises as unknown as WorkoutExercise[]) || [],
        notes: data.notes || '',
        totalVolume: data.totalVolume || 0,
        createdAt,
        updatedAt,
        startTime,
        endTime,
        duration: typeof data.duration === 'number' ? data.duration : undefined,
        warmupDuration: data.warmupDuration || 0,
        cooldownDuration: data.cooldownDuration || 0
      };
      return workout;
    });

    console.log('=== getTodaysWorkouts 完了 ===', { count: workouts.length });
    return workouts;
  } catch (error) {
    console.error('Error getting today\'s workouts:', error);
    return [];
  }
};

// Get last week's statistics (previous Monday 00:00 to this Monday 00:00, JST)
export const getLastWeeksStats = async (
  userId: string
): Promise<{
  count: number;
  totalVolume: number;
  uniqueDays: number;
  uniqueExercises: number;
  volumeByType: WeeklyVolumeByType;
  warmupTotal: number; // minutes (legacy)
  cooldownTotal: number; // minutes (legacy)
  warmupTotalSeconds: number; // seconds (new)
  cooldownTotalSeconds: number; // seconds (new)
}> => {
  console.log('=== getLastWeeksStats 開始 ===');
  try {
    const now = new Date();
    const thisWeekStart = getStartOfWeekJST(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setUTCDate(thisWeekStart.getUTCDate() - 7);
    const lastWeekEnd = thisWeekStart; // exclusive end

    console.log('1. 先週の開始日 (JST 月曜日 00:00:00):', lastWeekStart.toISOString());
    console.log('2. 先週の終了日 (JST 月曜日 00:00:00):', lastWeekEnd.toISOString());

    const workoutsRef = collection(db, `users/${userId}/${WORKOUTS_COLLECTION}`);
    const q = query(
      workoutsRef,
      orderBy('date', 'desc')
    );

    const querySnapshot = await getDocs(q);

    let count = 0;
    let totalVolume = 0;
    let warmupTotal = 0; // minutes
    let cooldownTotal = 0; // minutes
    let warmupTotalSeconds = 0; // seconds
    let cooldownTotalSeconds = 0; // seconds
    const volumeByType = createInitialVolumeByType();
    const daySet = new Set<string>();
    const exerciseSet = new Set<string>();

    querySnapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const workoutDate = convertToDate(data.date);
      if (workoutDate >= lastWeekStart && workoutDate < lastWeekEnd) {
        count++;
        const workoutVolume = (data.totalVolume ?? 0);
        totalVolume += workoutVolume;
        daySet.add(workoutDate.toISOString().split('T')[0]);

        // Field-based warmup/cooldown (minutes) accumulation
        if (typeof data.warmupDuration === 'number' && data.warmupDuration > 0) {
          warmupTotal += Math.round(data.warmupDuration / 60);
          warmupTotalSeconds += data.warmupDuration;
        }
        if (typeof data.cooldownDuration === 'number' && data.cooldownDuration > 0) {
          cooldownTotal += Math.round(data.cooldownDuration / 60);
          cooldownTotalSeconds += data.cooldownDuration;
        }

        if (Array.isArray(data.exercises)) {
          let warmupSecondsFromMenus = 0;
          let cooldownSecondsFromMenus = 0;
          data.exercises.forEach((exercise: Partial<WorkoutExercise> & { sets?: ExerciseSet[]; menuName?: string; name?: string; menuType?: MenuType }) => {
            if (exercise && typeof exercise.name === 'string' && exercise.name.trim().length > 0) {
              exerciseSet.add(exercise.name.trim());
            }
            const { type, volume } = computeVolumeForExercise(exercise);
            if (volume > 0) {
              volumeByType[type] += volume;
            }

            // New menu-based warmup/cooldown aggregation (time exercises only)
            const menuName: string = exercise.menuName ?? exercise.name ?? '';
            const isTimeMenu = exercise.menuType === 'time' || resolveMenuType(exercise) === 'time';
            if (typeof menuName === 'string' && menuName.length > 0 && isTimeMenu) {
              const secondsSum = Array.isArray(exercise?.sets)
                ? exercise.sets.reduce((sec: number, set: ExerciseSet) => {
                    const s = Number(set?.time ?? set?.duration);
                    return Number.isFinite(s) && s > 0 ? sec + s : sec;
                  }, 0)
                : 0;
              if (secondsSum > 0) {
                if (menuName.includes('ウォームアップ')) {
                  warmupSecondsFromMenus += secondsSum;
                }
                if (menuName.includes('クールダウン')) {
                  cooldownSecondsFromMenus += secondsSum;
                }
              }
            }
          });

          // Convert seconds to minutes and add to totals
          if (warmupSecondsFromMenus > 0) {
            warmupTotal += Math.round(warmupSecondsFromMenus / 60);
            warmupTotalSeconds += warmupSecondsFromMenus;
          }
          if (cooldownSecondsFromMenus > 0) {
            cooldownTotal += Math.round(cooldownSecondsFromMenus / 60);
            cooldownTotalSeconds += cooldownSecondsFromMenus;
          }
        }
      }
    });

    console.log('=== 週次集計(先週) ===');
    console.log('totalWarmup:', warmupTotal);
    console.log('totalCooldown:', cooldownTotal);
    return {
      count,
      totalVolume,
      uniqueDays: daySet.size,
      uniqueExercises: exerciseSet.size,
      volumeByType,
      warmupTotal,
      cooldownTotal,
      warmupTotalSeconds,
      cooldownTotalSeconds
    };
  } catch (error) {
    console.error('Error getting last week stats:', error);
    throw new Error(`先週の週間統計の取得中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

const resolveMenuType = (exercise: Partial<WorkoutExercise> & { sets?: ExerciseSet[] }): MenuType => {
  if (exercise?.menuType && MENU_TYPE_VALUES.includes(exercise.menuType)) {
    return exercise.menuType;
  }

  const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];

  const hasDistance = sets.some(set => parseNumber(set?.distance) > 0);
  if (hasDistance) {
    return 'distance';
  }

  if (exercise?.type === 'time') {
    return 'time';
  }

  const hasWeight = sets.some(set => parseNumber(set?.weight) > 0 && parseNumber(set?.reps) > 0);
  if (hasWeight || exercise?.type === 'weight') {
    return 'weight';
  }

  const hasTime = sets.some(set => parseNumber(set?.duration ?? set?.time) > 0);
  if (hasTime) {
    return 'time';
  }

  const hasBodyweight = sets.some(set => parseNumber(set?.reps) > 0);
  if (hasBodyweight) {
    return 'bodyweight';
  }

  return 'bodyweight';
};

const computeVolumeForExercise = (exercise: Partial<WorkoutExercise> & { sets?: ExerciseSet[] }): { type: MenuType; volume: number } => {
  const type = resolveMenuType(exercise);
  const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];

  const volume = sets.reduce((total, set) => {
    if (!set) {
      return total;
    }

    switch (type) {
      case 'weight': {
        const weight = parseNumber(set.weight);
        const reps = parseNumber(set.reps);
        if (weight <= 0 || reps <= 0) {
          return total;
        }
        return total + weight * reps;
      }
      case 'bodyweight': {
        const reps = parseNumber(set.reps);
        if (reps <= 0) {
          return total;
        }
        return total + reps;
      }
      case 'time': {
        const seconds = parseNumber(set.time ?? set.duration);
        if (seconds <= 0) {
          return total;
        }
        return total + seconds;
      }
      case 'distance': {
        const distance = parseNumber(set.distance);
        if (distance <= 0) {
          return total;
        }
        return total + distance;
      }
      default:
        return total;
    }
  }, 0);

  return { type, volume };
};

// Helper function to remove undefined values
const removeUndefined = <T>(obj: T): T => {
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item)).filter(item => item !== undefined) as unknown as T;
  }
  
  if (obj !== null && typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, removeUndefined(v as unknown)] as const);
    return Object.fromEntries(entries) as T;
  }
  
  return obj;
};

// Create a new workout
export const createWorkout = async (userId: string, workoutData: Omit<Workout, 'id'>): Promise<Workout> => {
  try {
    console.log('=== createWorkout 開始 ===');
    console.log('1. 受信したデータ:', JSON.stringify(workoutData, null, 2));
    
    // 日付の処理
    const rawDate: unknown = workoutData.date as unknown;
    let dateToSave: Timestamp;

    if (typeof rawDate === 'string') {
      console.log('2. 日付が文字列で渡されました。Dateオブジェクトに変換します:', rawDate);
      const parsed = new Date(rawDate);
      if (isNaN(parsed.getTime())) {
        console.error('3. 無効な日付形式です:', rawDate);
        throw new Error('無効な日付形式です');
      }
      dateToSave = Timestamp.fromDate(parsed);
    } else if (rawDate && typeof rawDate === 'object' && Object.prototype.toString.call(rawDate) === '[object Date]') {
      console.log('2. 日付がDateオブジェクトで渡されました。Timestampに変換します');
      dateToSave = Timestamp.fromDate(rawDate as Date);
    } else if (rawDate && typeof rawDate === 'object' && typeof (rawDate as { toDate?: () => Date }).toDate === 'function') {
      console.log('2. 日付がすでにTimestamp形式です');
      dateToSave = rawDate as Timestamp;
    } else {
      console.error('2. 不明な日付形式です:', workoutData.date);
      throw new Error('不明な日付形式です');
    }
    
    // 保存するデータを準備
    const normalizeTimeField = (value: Date | string | Timestamp | undefined) => {
      if (!value) return undefined;
      if (typeof value === 'object' && value !== null && typeof (value as Timestamp).toDate === 'function' && typeof (value as Timestamp).toMillis === 'function') {
        return value as Timestamp;
      }
      if (typeof value === 'object' && value !== null && Object.prototype.toString.call(value) === '[object Date]') {
        return Timestamp.fromDate(value as Date);
      }
      if (typeof value === 'string') {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
          return Timestamp.fromDate(parsed);
        }
      }
      return undefined;
    };

    const dataToSave = {
      ...workoutData,
      // 明示的に含める（0 も有効な値として保存）
      warmupDuration:
        typeof workoutData.warmupDuration === 'number'
          ? Math.max(0, workoutData.warmupDuration)
          : undefined,
      cooldownDuration:
        typeof workoutData.cooldownDuration === 'number'
          ? Math.max(0, workoutData.cooldownDuration)
          : undefined,
      date: dateToSave,
      startTime: normalizeTimeField(workoutData.startTime),
      endTime: normalizeTimeField(workoutData.endTime),
      duration: workoutData.duration ?? undefined,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    console.log('4. 保存するデータ:', JSON.stringify(dataToSave, null, 2));
    
    // 未定義の値を削除
    const cleanedData = removeUndefined(dataToSave);
    
    console.log('5. クリーンアップ後のデータ:', JSON.stringify(cleanedData, null, 2));
    
    // Firestoreに保存
    console.log('6. Firestoreに保存します...');
    const docRef = await addDoc(
      collection(db, `users/${userId}/${WORKOUTS_COLLECTION}`),
      cleanedData
    );
    
    console.log('7. 保存が完了しました。ドキュメントID:', docRef.id);
    
    // 返却用のデータを作成
    const savedDate = dateToSave.toDate();

    const result: Workout = {
      id: docRef.id,
      userId: workoutData.userId,
      date: savedDate.toISOString(),
      exercises: workoutData.exercises,
      notes: workoutData.notes,
      totalVolume: workoutData.totalVolume,
      createdAt: new Date(),
      updatedAt: new Date(),
      startTime: dataToSave.startTime ? dataToSave.startTime.toDate() : workoutData.startTime,
      endTime: dataToSave.endTime ? dataToSave.endTime.toDate() : workoutData.endTime,
      duration: workoutData.duration
    };
    
    console.log('8. 返却するデータ:', JSON.stringify(result, null, 2));
    console.log('=== createWorkout 終了 ===');
    
    return result;
  } catch (error) {
    console.error('Error creating workout:', error);
    throw new Error(`ワークアウトの作成中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Helper function to convert Firestore Timestamp to Date
const convertToDate = (timestamp: FirestoreTimestampLike): Date => {
  try {
    // If it's a Firestore Timestamp object
    if (timestamp && typeof (timestamp as Timestamp).toDate === 'function') {
      return (timestamp as Timestamp).toDate();
    }
    
    // If it's a plain object with seconds and nanoseconds
    if (timestamp && typeof timestamp === 'object' && 'seconds' in (timestamp as { seconds: number })) {
      const t = timestamp as { seconds: number; nanoseconds?: number };
      return new Date(t.seconds * 1000 + (t.nanoseconds || 0) / 1000000);
    }
    
    // If it's a date string
    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    // If it's a number (timestamp in milliseconds or seconds)
    if (typeof timestamp === 'number') {
      // If it's in seconds, convert to milliseconds
      const date = timestamp < 10000000000 ? new Date(timestamp * 1000) : new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    console.warn('無効な日付形式です。現在時刻を使用します。', timestamp);
    return new Date();
  } catch (error) {
    console.error('日付の変換中にエラーが発生しました:', error, '入力値:', timestamp);
    return new Date();
  }
};

// Get all workouts for a user
export const getWorkouts = async (userId: string): Promise<Workout[]> => {
  try {
    console.log('=== getWorkouts 開始 ===');
    const workoutsRef = collection(db, `users/${userId}/${WORKOUTS_COLLECTION}`);
    const q = query(workoutsRef, orderBy('date', 'desc'));
    const querySnapshot = await getDocs(q);
    
    console.log(`取得したドキュメント数: ${querySnapshot.docs.length}`);
    
    const workouts = querySnapshot.docs.map((doc, index) => {
      const data = doc.data() as WorkoutDoc;
      
      // デバッグ用ログ
      console.log(`\n=== ドキュメント ${index + 1} ===`);
      console.log('ドキュメントID:', doc.id);
      console.log('date フィールド:', data.date);
      console.log('date の型:', typeof data.date);
      console.log('date のプロトタイプ:', Object.prototype.toString.call(data.date));
      
      // 日付の変換
      const date = convertToDate(data.date);
      const createdAt = data.createdAt ? convertToDate(data.createdAt) : new Date();
      const updatedAt = data.updatedAt ? convertToDate(data.updatedAt) : new Date();
      const startTime = data.startTime ? convertToDate(data.startTime) : undefined;
      const endTime = data.endTime ? convertToDate(data.endTime) : undefined;

      console.log('変換後の date:', date);

      const workout: Workout = {
        id: doc.id,
        userId: data.userId || userId,
        date: date.toISOString(),
        exercises: (data.exercises as unknown as WorkoutExercise[]) || [],
        notes: data.notes || '',
        totalVolume: data.totalVolume || 0,
        createdAt,
        updatedAt,
        startTime,
        endTime,
        duration: typeof data.duration === 'number' ? data.duration : undefined,
        warmupDuration: typeof data.warmupDuration === 'number' ? data.warmupDuration : 0,
        cooldownDuration: typeof data.cooldownDuration === 'number' ? data.cooldownDuration : 0
      };

      console.log('warmupDuration:', workout.warmupDuration, 'cooldownDuration:', workout.cooldownDuration);
      return workout;
    });
    
    console.log('=== getWorkouts 完了 ===');
    return workouts;
    
  } catch (error) {
    console.error('Error getting workouts:', error);
    throw new Error(`ワークアウトの取得中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Update an existing workout
export const updateWorkout = async (
  userId: string,
  workoutId: string,
  workoutData: Partial<Omit<Workout, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> => {
  try {
    console.log('=== updateWorkout 開始 ===');
    console.log('1. 受信したデータ:', JSON.stringify(workoutData, null, 2));
    
    // 更新するデータを準備
    const updateData: Record<string, unknown> = { ...workoutData };
    
    // 日付が含まれている場合は処理
    const convertToTimestamp = (value: string | Date | Timestamp | undefined) => {
      if (!value) return undefined;
      if (typeof value === 'object' && value !== null && typeof (value as Timestamp).toDate === 'function' && typeof (value as Timestamp).toMillis === 'function') {
        return value as Timestamp;
      }
      if (typeof value === 'object' && value !== null && Object.prototype.toString.call(value) === '[object Date]') {
        return Timestamp.fromDate(value as Date);
      }
      if (typeof value === 'string') {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
          return Timestamp.fromDate(parsed);
        }
      }
      return undefined;
    };

    if (workoutData.date !== undefined) {
      console.log('2. 日付フィールドが見つかりました。処理を開始します。');
      
      // 日付の処理
      if (typeof workoutData.date === 'string') {
        console.log('3. 日付が文字列で渡されました。Dateオブジェクトに変換します:', workoutData.date);
        const dateObj = new Date(workoutData.date);
        if (isNaN(dateObj.getTime())) {
          console.error('4. 無効な日付形式です:', workoutData.date);
          throw new Error('無効な日付形式です');
        }
        console.log('4. 有効な日付です。Timestampに変換します');
        updateData.date = Timestamp.fromDate(dateObj);
      } else if (typeof workoutData.date === 'object' && workoutData.date !== null && Object.prototype.toString.call(workoutData.date) === '[object Date]') {
        console.log('3. 日付がDateオブジェクトで渡されました。Timestampに変換します');
        updateData.date = Timestamp.fromDate(workoutData.date as Date);
      } else if (workoutData.date && typeof (workoutData.date as Timestamp).toDate === 'function') {
        console.log('3. 日付がすでにTimestamp形式です');
        // すでにTimestamp形式の場合はそのまま使用
      } else {
        console.error('3. 不明な日付形式です:', workoutData.date);
        throw new Error('不明な日付形式です');
      }
    } else {
      console.log('2. 日付フィールドは更新されません');
    }

    if (workoutData.startTime !== undefined) {
      const ts = convertToTimestamp(workoutData.startTime);
      updateData.startTime = ts;
    }

    if (workoutData.endTime !== undefined) {
      const ts = convertToTimestamp(workoutData.endTime);
      updateData.endTime = ts;
    }

    if (workoutData.duration !== undefined) {
      updateData.duration = workoutData.duration;
    }
    
    // 更新日時を設定
    updateData.updatedAt = Timestamp.now();
    
    // 未定義の値を削除
    const cleanedData = removeUndefined(updateData);
    
    console.log('5. 更新するデータ:', JSON.stringify(cleanedData, null, 2));
    
    // ドキュメント参照を取得
    const workoutRef = doc(db, `users/${userId}/${WORKOUTS_COLLECTION}`, workoutId);
    console.log('6. ドキュメントを更新します...');
    
    // ドキュメントを更新
    await updateDoc(workoutRef, cleanedData);
    
    console.log('7. 更新が完了しました');
    console.log('=== updateWorkout 終了 ===');
  } catch (error) {
    console.error('Error updating workout:', error);
    throw new Error(`ワークアウトの更新中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Get a single workout by ID
export const getWorkoutById = async (userId: string, workoutId: string): Promise<Workout | null> => {
  try {
    console.log('=== getWorkoutById 開始 ===');
    console.log('1. ドキュメントを取得します:', { userId, workoutId });
    
    const docRef = doc(db, `users/${userId}/${WORKOUTS_COLLECTION}`, workoutId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.log('2. ドキュメントが存在しません');
      console.log('=== getWorkoutById 終了 (ドキュメントなし) ===');
      return null;
    }

    const data = docSnap.data();
    
    // デバッグ用ログ
    console.log('2. ドキュメントを取得しました');
    console.log('date フィールド:', data.date);
    console.log('date の型:', typeof data.date);
    console.log('createdAt フィールド:', data.createdAt);
    
    // 日付の変換
    const date = convertToDate(data.date);
    const createdAt = data.createdAt ? convertToDate(data.createdAt) : new Date();
    const updatedAt = data.updatedAt ? convertToDate(data.updatedAt) : new Date();
    
    console.log('変換後の date:', date);
    console.log('変換後の createdAt:', createdAt);
    
    const workout: Workout = {
      id: docSnap.id,
      userId: data.userId || userId,
      date: date.toISOString(),
      exercises: (data.exercises as unknown as WorkoutExercise[]) || [],
      notes: data.notes || '',
      totalVolume: data.totalVolume || 0,
      createdAt,
      updatedAt,
      startTime: data.startTime ? convertToDate(data.startTime) : undefined,
      endTime: data.endTime ? convertToDate(data.endTime) : undefined,
      duration: typeof data.duration === 'number' ? data.duration : undefined
    };
    
    console.log('3. ワークアウトデータを返します:', JSON.stringify(workout, null, 2));
    console.log('=== getWorkoutById 完了 ===');
    
    return workout;
  } catch (error) {
    console.error('Error getting workout:', error);
    throw new Error(`ワークアウトの取得中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Delete a workout
export const deleteWorkout = async (userId: string, workoutId: string): Promise<void> => {
  try {
    const docRef = doc(db, `users/${userId}/${WORKOUTS_COLLECTION}`, workoutId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting workout:', error);
    throw new Error('ワークアウトの削除中にエラーが発生しました');
  }
};

// Get recent workouts (up to 5)
export const getRecentWorkouts = async (userId: string): Promise<Workout[]> => {
  try {
    console.log('=== getRecentWorkouts 開始 ===');
    const workoutsRef = collection(db, `users/${userId}/${WORKOUTS_COLLECTION}`);
    const q = query(
      workoutsRef,
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc')
    );
    
    console.log('1. クエリを作成しました。データを取得します...');
    const querySnapshot = await getDocs(q);
    
    console.log(`2. 取得したドキュメント数: ${querySnapshot.docs.length}`);
    
    const workouts = querySnapshot.docs.slice(0, 5).map((doc, index) => {
      const data = doc.data() as WorkoutDoc;
      
      // デバッグ用ログ
      console.log(`\n=== 最近のワークアウト ${index + 1} ===`);
      console.log('ドキュメントID:', doc.id);
      console.log('date フィールド:', data.date);
      console.log('date の型:', typeof data.date);
      
      // 日付の変換
      const date = convertToDate(data.date);
      const createdAt = convertToDate(data.createdAt);
      const updatedAt = data.updatedAt ? convertToDate(data.updatedAt) : new Date();
      
      console.log('変換後の date:', date);
      
      const workout: Workout = {
        id: doc.id,
        userId: data.userId || userId,
        date: date.toISOString(),
        exercises: (data.exercises as unknown as WorkoutExercise[]) || [],
        notes: data.notes || '',
        totalVolume: data.totalVolume || 0,
        createdAt,
        updatedAt
      };
      return workout;
    });
    
    console.log('3. 最近のワークアウトの取得が完了しました');
    console.log('=== getRecentWorkouts 完了 ===');
    
    return workouts;
  } catch (error) {
    console.error('Error getting recent workouts:', error);
    throw new Error(`最近のワークアウトの取得中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Helper function to get start of week in JST (Japan Standard Time)
const getStartOfWeekJST = (date: Date): Date => {
  // Create a new date object to avoid modifying the original
  const d = new Date(date);
  
  // Get the current day of week (0 = Sunday, 1 = Monday, etc.)
  const day = d.getUTCDay();
  
  // Calculate the difference to the previous Sunday
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust to start week on Monday
  
  // Create a new date for the start of the week
  const startOfWeek = new Date(d);
  startOfWeek.setUTCDate(diff);
  startOfWeek.setUTCHours(0, 0, 0, 0);
  
  return startOfWeek;
};

// Get this week's statistics
export const getThisWeeksStats = async (
  userId: string
): Promise<{
  count: number;
  totalVolume: number;
  uniqueDays: number;
  uniqueExercises: number;
  volumeByType: WeeklyVolumeByType;
  warmupTotal: number; // minutes (legacy)
  cooldownTotal: number; // minutes (legacy)
  warmupTotalSeconds: number; // seconds (new)
  cooldownTotalSeconds: number; // seconds (new)
}> => {
  console.log('=== getThisWeeksStats 開始 ===');
  
  try {
    // 現在の日時を取得（JST）
    const now = new Date();
    console.log('1. 現在日時 (UTC):', now.toISOString());
    
    // 今週の開始日を計算（月曜日始まり）
    const startOfWeek = getStartOfWeekJST(now);
    console.log('2. 今週の開始日 (JST 月曜日 00:00:00):', startOfWeek.toISOString());
    
    // 今週の終了日（来週の月曜日 00:00:00）
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 7);
    console.log('3. 来週の開始日 (JST 来週月曜日 00:00:00):', endOfWeek.toISOString());
    
    // ワークアウトデータを取得
    const workoutsRef = collection(db, `users/${userId}/${WORKOUTS_COLLECTION}`);
    const q = query(
      workoutsRef,
      orderBy('date', 'desc')  // 新しい順に並べ替え
    );
    
    console.log('4. ワークアウトデータを取得中...');
    const querySnapshot = await getDocs(q);
    console.log(`5. 取得したワークアウトの総数: ${querySnapshot.docs.length}`);
    
    let count = 0;
    let totalVolume = 0;
    let warmupTotal = 0; // minutes
    let cooldownTotal = 0; // minutes
    let warmupTotalSeconds = 0; // seconds
    let cooldownTotalSeconds = 0; // seconds
    const volumeByType = createInitialVolumeByType();
    const daySet = new Set<string>();
    const exerciseSet = new Set<string>();
    
    // 今週のデータをフィルタリング
    querySnapshot.docs.forEach((doc) => {
      const data = doc.data() as WorkoutDoc;
      const workoutDate = convertToDate(data.date);
      
      // デバッグ用に最初の数件の日付をログに出力
      if (querySnapshot.docs.indexOf(doc) < 5) {
        console.log(`  ワークアウト ${querySnapshot.docs.indexOf(doc) + 1}:`, {
          id: doc.id,
          date: workoutDate.toISOString(),
          dateStr: workoutDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
          volume: data.totalVolume || 0,
          warmupDuration: data.warmupDuration,
          cooldownDuration: data.cooldownDuration
        });
      }
      
      // 今週のデータかどうかをチェック
      if (workoutDate >= startOfWeek && workoutDate < endOfWeek) {
        count++;
        
        // ワークアウトのボリュームを計算
        const workoutVolume = (data.totalVolume ?? 0);
        totalVolume += workoutVolume;

        // ウォームアップ/クールダウン（ワークアウトフィールド, 秒）→ 分に換算して加算
        if (typeof data.warmupDuration === 'number' && data.warmupDuration > 0) {
          warmupTotal += Math.round(data.warmupDuration / 60);
          warmupTotalSeconds += data.warmupDuration;
        }
        if (typeof data.cooldownDuration === 'number' && data.cooldownDuration > 0) {
          cooldownTotal += Math.round(data.cooldownDuration / 60);
          cooldownTotalSeconds += data.cooldownDuration;
        }

        daySet.add(workoutDate.toISOString().split('T')[0]);

        if (Array.isArray(data.exercises)) {
          let warmupSecondsFromMenus = 0;
          let cooldownSecondsFromMenus = 0;
          data.exercises.forEach((exercise: Partial<WorkoutExercise> & { sets?: ExerciseSet[]; menuName?: string; name?: string; menuType?: MenuType }) => {
            if (exercise && typeof exercise.name === 'string' && exercise.name.trim().length > 0) {
              exerciseSet.add(exercise.name.trim());
            }

            const { type, volume } = computeVolumeForExercise(exercise);
            if (volume > 0) {
              volumeByType[type] += volume;
            }

            // メニュー名ベースのウォームアップ/クールダウン（timeメニューのみ、秒→分）
            const menuName: string = exercise.menuName ?? exercise.name ?? '';
            const isTimeMenu = exercise.menuType === 'time' || resolveMenuType(exercise) === 'time';
            if (typeof menuName === 'string' && menuName.length > 0 && isTimeMenu) {
              const secondsSum = Array.isArray(exercise?.sets)
                ? exercise.sets.reduce((sec: number, set: ExerciseSet) => {
                    const s = Number(set?.time ?? set?.duration);
                    return Number.isFinite(s) && s > 0 ? sec + s : sec;
                  }, 0)
                : 0;
              if (secondsSum > 0) {
                if (menuName.includes('ウォームアップ')) {
                  warmupSecondsFromMenus += secondsSum;
                }
                if (menuName.includes('クールダウン')) {
                  cooldownSecondsFromMenus += secondsSum;
                }
              }
            }
          });

          if (warmupSecondsFromMenus > 0) {
            warmupTotal += Math.round(warmupSecondsFromMenus / 60);
            warmupTotalSeconds += warmupSecondsFromMenus;
          }
          if (cooldownSecondsFromMenus > 0) {
            cooldownTotal += Math.round(cooldownSecondsFromMenus / 60);
            cooldownTotalSeconds += cooldownSecondsFromMenus;
          }
        }
      }
    });

    return {
      count,
      totalVolume,
      uniqueDays: daySet.size,
      uniqueExercises: exerciseSet.size,
      volumeByType,
      warmupTotal,
      cooldownTotal,
      warmupTotalSeconds,
      cooldownTotalSeconds
    };
  } catch (error) {
    console.error('Error getting weekly stats:', error);
    console.error('エラーの詳細:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new Error(`週間統計の取得中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
