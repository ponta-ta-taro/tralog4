'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  createShare,
  deactivateShare,
  getUserShares,
  type ShareRecord
} from '@/services/shareService';
import { Loader2, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ShareManagementPage() {
  const { user } = useAuth();
  const shareBaseUrl = typeof window !== 'undefined' ? `${window.location.origin}/share` : '/share';
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdShare, setCreatedShare] = useState<ShareRecord | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPasswordCopied, setIsPasswordCopied] = useState(false);
  const [isUrlCopied, setIsUrlCopied] = useState(false);
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [isSharesLoading, setIsSharesLoading] = useState(false);
  const [shareListError, setShareListError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [deactivatingShareId, setDeactivatingShareId] = useState<string | null>(null);

  const fetchShares = useCallback(async () => {
    if (!user) {
      setShares([]);
      return;
    }

    setIsSharesLoading(true);
    setShareListError(null);
    try {
      const records = await getUserShares(user.uid);
      const sorted = [...records].sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
      setShares(sorted);
    } catch (err) {
      console.error('共有リンク一覧の取得に失敗しました:', err);
      setShareListError('共有リンク一覧の取得に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsSharesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  const handleCreateShare = async () => {
    if (!user) {
      setError('共有リンクを生成するにはログインが必要です。');
      return;
    }

    setIsCreating(true);
    setError(null);
    setIsUrlCopied(false);
    setIsPasswordCopied(false);

    try {
      const share = await createShare(user.uid);
      setCreatedShare(share);
      setIsDialogOpen(true);
      setSuccessToast('共有リンクを生成しました。');
      await fetchShares();
    } catch (err) {
      console.error('共有リンクの生成に失敗しました:', err);
      setError('共有リンクの生成に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async (value: string, type: 'url' | 'password') => {
    try {
      await navigator.clipboard.writeText(value);
      if (type === 'url') {
        setIsUrlCopied(true);
        setTimeout(() => setIsUrlCopied(false), 2500);
      } else {
        setIsPasswordCopied(true);
        setTimeout(() => setIsPasswordCopied(false), 2500);
      }
      if (type === 'url') {
        setSuccessToast('URLをコピーしました。');
      }
    } catch (err) {
      console.error('クリップボードへのコピーに失敗しました:', err);
      setError('コピーに失敗しました。ブラウザの権限を確認してください。');
    }
  };

  const shareUrl = createdShare ? `${shareBaseUrl}/${createdShare.shareId}` : '';

  const maskedShareUrl = useCallback((shareId: string) => {
    const base = typeof window !== 'undefined' ? `${window.location.origin}/share` : '/share';
    const full = `${base}/${shareId}`;
    if (full.length <= 28) {
      return full;
    }
    return `${full.slice(0, 28)}...`;
  }, []);

  const renderStatusBadge = (share: ShareRecord) => {
    const now = new Date();
    if (!share.isActive) {
      return <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">無効</span>;
    }
    if (share.expiresAt < now) {
      return <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">期限切れ</span>;
    }
    return <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">有効</span>;
  };

  const handleDeactivateShare = async (shareId: string) => {
    if (!window.confirm('共有リンクを無効化します。よろしいですか？')) {
      return;
    }

    setDeactivatingShareId(shareId);
    setError(null);

    try {
      await deactivateShare(shareId);
      setSuccessToast('共有リンクを無効化しました。');
      await fetchShares();
    } catch (err) {
      console.error('共有リンクの無効化に失敗しました:', err);
      setError('共有リンクの無効化に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setDeactivatingShareId(null);
    }
  };

  useEffect(() => {
    if (!successToast) {
      return;
    }
    const timer = setTimeout(() => setSuccessToast(null), 3000);
    return () => clearTimeout(timer);
  }, [successToast]);

  const formattedShares = useMemo(() => {
    return shares.map(share => ({
      ...share,
      shareUrl: `${shareBaseUrl}/${share.shareId}`,
      createdLabel: share.createdAt
        ? share.createdAt.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '-',
      expiresLabel: share.expiresAt
        ? share.expiresAt.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          })
        : '-'
    }));
  }, [shares, shareBaseUrl]);

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">データ共有管理</h1>
        <p className="text-muted-foreground">
          パーソナルトレーナーとデータを共有できます。
        </p>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!user && (
        <Alert>
          <AlertDescription>
            共有リンクを作成するにはログインしてください。
          </AlertDescription>
        </Alert>
      )}

      {successToast && (
        <Alert>
          <AlertDescription>{successToast}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>共有リンク</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              現在の共有リンク一覧（近日対応予定）
            </p>
            <Button onClick={handleCreateShare} disabled={!user || isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 生成中...
                </>
              ) : (
                '新しい共有リンクを生成'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">共有リンク一覧</h2>
          <p className="text-sm text-muted-foreground">生成したリンクを管理できます。</p>
        </div>

        {shareListError && (
          <Alert variant="destructive">
            <AlertDescription>{shareListError}</AlertDescription>
          </Alert>
        )}

        {isSharesLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中です...
          </div>
        ) : formattedShares.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
              <p>まだ共有リンクがありません。</p>
              <p>新しい共有リンクを生成して、トレーナーとデータを共有しましょう。</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {formattedShares.map(share => (
              <Card key={share.shareId} className="border-muted">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-lg">{maskedShareUrl(share.shareId)}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {renderStatusBadge(share)}
                    <span>作成: {share.createdLabel}</span>
                    <span>期限: {share.expiresLabel}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground break-all">{share.shareUrl}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(share.shareUrl, 'url')}
                    >
                      <Copy className="mr-2 h-4 w-4" /> URLをコピー
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      shareId: <span className="font-mono">{share.shareId}</span>
                    </p>
                    {share.isActive && share.expiresAt >= new Date() ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDeactivateShare(share.shareId)}
                        disabled={deactivatingShareId === share.shareId}
                      >
                        {deactivatingShareId === share.shareId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          '無効化'
                        )}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">無効化済み</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>共有リンクを生成しました</DialogTitle>
            <DialogDescription>
              以下の情報をトレーナーに共有してください。パスワードは後から確認できません。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">共有URL</label>
              <div className="mt-1 flex items-center gap-2">
                <Input readOnly value={shareUrl} className="font-mono" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => shareUrl && handleCopy(shareUrl, 'url')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {isUrlCopied && <p className="mt-1 text-xs text-muted-foreground">コピーしました</p>}
            </div>

            <div>
              <label className="text-sm font-medium">パスワード</label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  readOnly
                  value={createdShare?.password ?? ''}
                  className={cn('font-mono', !createdShare?.password && 'text-muted-foreground')}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => createdShare?.password && handleCopy(createdShare.password, 'password')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {isPasswordCopied && <p className="mt-1 text-xs text-muted-foreground">コピーしました</p>}
              <p className="mt-2 text-xs text-destructive">
                このパスワードは後で確認できません。必ずメモしてください。
              </p>
            </div>

            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              有効期限: {createdShare?.expiresAt.toLocaleDateString('ja-JP')}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setIsDialogOpen(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
