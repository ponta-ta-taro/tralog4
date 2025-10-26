'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getThisWeeksStats, getLastWeeksStats } from '@/services/workoutService';
import type { MenuType } from '@/types/menu';

// 型ガード関数
const isFirestoreTimestamp = (value: unknown): value is { toDate: () => Date } => {
  return value !== null && 
         typeof value === 'object' && 
         'toDate' in (value as object) && 
         typeof (value as { toDate: unknown }).toDate === 'function';
};

// 日付をフォーマットするヘルパー関数
const formatDate = (dateValue: unknown): string => {
  try {
    let date: Date;
    
    if (isFirestoreTimestamp(dateValue)) {
      // Firestore Timestampの場合
      date = dateValue.toDate();
    } else if (dateValue instanceof Date) {
      // Dateオブジェクトの場合
      date = dateValue;
    } else if (typeof dateValue === 'string') {
      // 文字列の場合
      date = new Date(dateValue);
    } else if (typeof dateValue === 'number') {
      // タイムスタンプの場合
      date = new Date(dateValue);
    } else {
      console.error('無効な日付形式です:', dateValue);
      return '日付不明';
    }
    
    // 日付が有効かチェック
    if (isNaN(date.getTime())) {
      console.error('無効な日付値です:', dateValue);
      return '日付不明';
    }
    
    // yyyy年MM月dd日 (EEE) 形式で返す
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    });
  } catch (error) {
    console.error('日付フォーマットエラー:', error, dateValue);
    return '日付不明';
  }
};


export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  // Removed recent/today sections to simplify dashboard
  const [weeklyStats, setWeeklyStats] = useState({
    count: 0,
    totalVolume: 0,
    uniqueDays: 0,
    uniqueExercises: 0,
    volumeByType: {
      weight: 0,
      bodyweight: 0,
      time: 0,
      distance: 0
    } satisfies Record<MenuType, number>,
    warmupTotal: 0, // minutes (legacy)
    cooldownTotal: 0, // minutes (legacy)
    warmupTotalSeconds: 0, // seconds (new)
    cooldownTotalSeconds: 0 // seconds (new)
  });
  const [lastWeekStats, setLastWeekStats] = useState({
    count: 0,
    totalVolume: 0,
    uniqueDays: 0,
    uniqueExercises: 0,
    volumeByType: {
      weight: 0,
      bodyweight: 0,
      time: 0,
      distance: 0
    } satisfies Record<MenuType, number>,
    warmupTotal: 0,
    cooldownTotal: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      const fetchData = async () => {
        try {
          setIsLoading(true);
          const [thisWeek, lastWeek] = await Promise.all([
            getThisWeeksStats(user.uid),
            getLastWeeksStats(user.uid)
          ]);
          setWeeklyStats(thisWeek);
          setLastWeekStats(lastWeek);
          console.log('=== ダッシュボード: 今週のワークアウト統計 ===');
          console.log('warmupTotalSeconds:', thisWeek.warmupTotalSeconds);
          console.log('cooldownTotalSeconds:', thisWeek.cooldownTotalSeconds);
        } catch (error) {
          console.error('Error fetching dashboard data:', error);
        } finally {
          setIsLoading(false);
        }
      };

      fetchData();
    }
  }, [user, loading, router]);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const formatSeconds = (totalSeconds?: number): string => {
    if (!totalSeconds || totalSeconds <= 0) return '0秒';
    const s = Math.round(totalSeconds);
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m > 0 && r > 0) return `${m}分${r}秒`;
    if (m > 0) return `${m}分`;
    return `${r}秒`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
          ようこそ、{user?.displayName || 'ユーザー'}さん！
        </h1>
        <p className="text-gray-600 mt-2">今日もトレーニングを記録しましょう！</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">今週のトレーニング</h3>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-4">
            <span className="text-3xl font-bold text-blue-600">{weeklyStats.uniqueDays} 日</span>
            <span className="text-2xl font-semibold text-emerald-500">{weeklyStats.uniqueExercises} 種目</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">合計 {weeklyStats.count} 回</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">今週のトレーニング統計</h3>
          <dl className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-gray-300" aria-hidden />
              <dt className="font-medium text-gray-700">ウォームアップ:</dt>
              <dd>{formatSeconds(weeklyStats.warmupTotalSeconds || (weeklyStats.warmupTotal * 60))}</dd>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-gray-300" aria-hidden />
              <dt className="font-medium text-gray-700">クールダウン:</dt>
              <dd>{formatSeconds(weeklyStats.cooldownTotalSeconds || (weeklyStats.cooldownTotal * 60))}</dd>
            </div>
            {Object.entries(weeklyStats.volumeByType).map(([type, value]) => {
              if (!value || value <= 0) {
                return null;
              }

              const formatValue = (menuType: MenuType, total: number): string => {
                switch (menuType) {
                  case 'weight':
                    return `${total.toLocaleString()} kg`;
                  case 'bodyweight':
                    return `${total.toLocaleString()}回`;
                  case 'time': {
                    const rounded = Math.round(total);
                    const minutes = Math.floor(rounded / 60);
                    const seconds = rounded % 60;
                    if (minutes > 0 && seconds > 0) {
                      return `${minutes.toLocaleString()}分${seconds.toLocaleString()}秒`;
                    }
                    if (minutes > 0) {
                      return `${minutes.toLocaleString()}分`;
                    }
                    return `${seconds.toLocaleString()}秒`;
                  }
                  case 'distance':
                    return `${Number(total.toFixed(1)).toLocaleString()} km`;
                  default:
                    return total.toLocaleString();
                }
              };

              const labelMap: Record<MenuType, string> = {
                weight: '総ボリューム（重量）',
                bodyweight: '自重',
                time: '時間',
                distance: '距離'
              };

              const menuType = type as MenuType;

              return (
                <div key={type} className="flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-gray-300" aria-hidden />
                  <dt className="font-medium text-gray-700">{labelMap[menuType]}:</dt>
                  <dd>{formatValue(menuType, value)}</dd>
                </div>
              );
            })}
          </dl>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">先週のトレーニング統計</h3>
          <dl className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-gray-300" aria-hidden />
              <dt className="font-medium text-gray-700">ウォームアップ:</dt>
              <dd>{lastWeekStats.warmupTotal.toLocaleString()}分</dd>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-gray-300" aria-hidden />
              <dt className="font-medium text-gray-700">クールダウン:</dt>
              <dd>{lastWeekStats.cooldownTotal.toLocaleString()}分</dd>
            </div>
            {Object.entries(lastWeekStats.volumeByType).map(([type, value]) => {
              if (!value || value <= 0) {
                return null;
              }

              const formatValue = (menuType: MenuType, total: number): string => {
                switch (menuType) {
                  case 'weight':
                    return `${total.toLocaleString()} kg`;
                  case 'bodyweight':
                    return `${total.toLocaleString()}回`;
                  case 'time': {
                    const rounded = Math.round(total);
                    const minutes = Math.floor(rounded / 60);
                    const seconds = rounded % 60;
                    if (minutes > 0 && seconds > 0) {
                      return `${minutes.toLocaleString()}分${seconds.toLocaleString()}秒`;
                    }
                    if (minutes > 0) {
                      return `${minutes.toLocaleString()}分`;
                    }
                    return `${seconds.toLocaleString()}秒`;
                  }
                  case 'distance':
                    return `${Number(total.toFixed(1)).toLocaleString()} km`;
                  default:
                    return total.toLocaleString();
                }
              };

              const labelMap: Record<MenuType, string> = {
                weight: '総ボリューム（重量）',
                bodyweight: '自重',
                time: '時間',
                distance: '距離'
              };

              const menuType = type as MenuType;

              return (
                <div key={type} className="flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-gray-300" aria-hidden />
                  <dt className="font-medium text-gray-700">{labelMap[menuType]}:</dt>
                  <dd>{formatValue(menuType, value)}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>

      {/* Simplified: remove Today's Workouts Details section */}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Link 
          href="/workouts/session"
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg text-center transition-colors"
        >
          🏋️ セッションを開始
        </Link>
        <Link 
          href="/workouts"
          className="bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 font-medium py-3 px-6 rounded-lg text-center transition-colors"
        >
          履歴を見る
        </Link>
      </div>

      {/* Simplified: remove Recent Workouts section */}
    </div>
  );
}
