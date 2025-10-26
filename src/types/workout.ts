import type { MenuType } from '@/types/menu';

export type ExerciseType = 'weight' | 'time';

export interface ExerciseSet {
  id: string;
  weight?: number;
  reps?: number;
  duration?: number; // in seconds
  side?: 'left' | 'right' | 'both';
  time?: number;
  distance?: number;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  type: ExerciseType;
  menuType: MenuType;
  hasSideOption: boolean;
  category: string;
  sets: ExerciseSet[];
  notes?: string;
  durationSeconds?: number;
}

export interface Workout {
  id: string;
  userId: string;
  date: string; // ISO date string
  exercises: WorkoutExercise[];
  totalVolume: number;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
  startTime?: Date;
  endTime?: Date;
  duration?: number; // minutes
  warmupDuration?: number; // minutes
  cooldownDuration?: number; // minutes
}
// Predefined exercises
export const PREDEFINED_EXERCISES = [
  { id: '1', name: 'ベンチプレス', type: 'weight' as const, category: '胸', hasSideOption: false },
  { id: '2', name: 'スミスマシン', type: 'weight' as const, category: '胸', hasSideOption: false },
  { id: '3', name: 'ダンベルプレス', type: 'weight' as const, category: '胸', hasSideOption: true },
  { id: '4', name: 'ラットプルダウン', type: 'weight' as const, category: '背中', hasSideOption: false },
  { id: '5', name: 'シーテッドロー', type: 'weight' as const, category: '背中', hasSideOption: true },
  { id: '6', name: 'サイドレイズ', type: 'weight' as const, category: '肩', hasSideOption: true },
  { id: '7', name: 'レッグプレス', type: 'weight' as const, category: '足', hasSideOption: false },
  { id: '8', name: '腹筋', type: 'time' as const, category: '体幹', hasSideOption: false },
];
