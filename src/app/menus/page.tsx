'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createMenu, getMenus, initializeDefaultMenus, updateMenu, deleteMenu, updateMenusOrder } from '@/services/menuService';
import type { Menu } from '@/types/menu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Edit, Trash2, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type MenuTypeOption = Menu['type'];
type StatusType = 'success' | 'error' | 'info';

interface StatusMessage {
  type: StatusType;
  message: string;
}

interface MenuFormState {
  name: string;
  category: string[];
  type: MenuTypeOption;
  hasSides: boolean;
}

const CATEGORY_OPTIONS = ['胸', '背中', '肩', '腕', '足', '体幹'] as const;

const MENU_TYPE_CONFIG: Record<MenuTypeOption, { label: string; description: string }> = {
  weight: { label: '重量', description: '重量 (kg) と回数を記録します。' },
  bodyweight: { label: '自重', description: '回数のみを記録します。' },
  time: { label: '時間', description: '経過時間 (秒) のみを記録します。' },
  distance: { label: '距離', description: '移動距離 (km) のみを記録します。' }
};

const renderTypePreview = (type: MenuTypeOption) => {
  switch (type) {
    case 'bodyweight':
      return (
        <div className="grid gap-2 text-sm">
          <Label className="text-xs text-muted-foreground">想定入力項目</Label>
          <Input placeholder="回数 (例: 15)" disabled className="bg-muted" />
        </div>
      );
    case 'time':
      return (
        <div className="grid gap-2 text-sm">
          <Label className="text-xs text-muted-foreground">想定入力項目</Label>
          <Input placeholder="時間 (秒) 例: 60" disabled className="bg-muted" />
        </div>
      );
    case 'distance':
      return (
        <div className="grid gap-2 text-sm">
          <Label className="text-xs text-muted-foreground">想定入力項目</Label>
          <Input placeholder="距離 (km) 例: 2.5" disabled className="bg-muted" />
        </div>
      );
    case 'weight':
    default:
      return (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">重量 (kg)</Label>
            <Input placeholder="例: 60" disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">回数</Label>
            <Input placeholder="例: 10" disabled className="bg-muted" />
          </div>
        </div>
      );
  }
};

const TYPE_BADGE_STYLES: Record<MenuTypeOption, string> = {
  weight: 'bg-blue-100 text-blue-700',
  bodyweight: 'bg-amber-100 text-amber-700',
  time: 'bg-violet-100 text-violet-700',
  distance: 'bg-emerald-100 text-emerald-700'
};

const getMenuTypeLabel = (type: MenuTypeOption) => MENU_TYPE_CONFIG[type]?.label ?? type;

const createEmptyFormState = (): MenuFormState => ({
  name: '',
  category: [],
  type: 'weight',
  hasSides: false
});

function SortableMenuItem({
  menu,
  onEdit,
  onDelete
}: {
  menu: Menu;
  onEdit: (menu: Menu) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: menu.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-lg border bg-white p-4">
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
        aria-label="ドラッグして並び替え"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800">{menu.name || '名称未設定'}</span>
          <Badge className={TYPE_BADGE_STYLES[menu.type]}>{getMenuTypeLabel(menu.type)}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          最終更新: {menu.updatedAt?.toLocaleDateString?.('ja-JP') ?? '不明'}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onEdit(menu)}
          className="text-slate-500 hover:text-primary"
          aria-label="メニューを編集"
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onDelete(menu.id)}
          className="text-slate-500 hover:text-destructive"
          aria-label="メニューを削除"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function MenusPage() {
  const { user, loading: authLoading } = useAuth();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formState, setFormState] = useState<MenuFormState>(() => createEmptyFormState());

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [editFormState, setEditFormState] = useState<MenuFormState>(() => createEmptyFormState());
  const [isUpdating, setIsUpdating] = useState(false);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTargetMenu, setDeleteTargetMenu] = useState<Menu | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // dnd sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortedMenus = useMemo(
    () => [...menus].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [menus]
  );

  const fetchMenus = useCallback(async () => {
    if (!user) {
      console.warn('ユーザーが未ログインのためメニュー取得をスキップします');
      return;
    }

    console.log('=== getMenus 開始 ===');
    setIsLoading(true);
    setError(null);

    try {
      const data = await getMenus(user.uid);
      console.log('取得したメニュー数:', data.length);

      // order 未設定の有無を確認（null/undefined）
      const needsOrder = data.some(m => m.order === undefined || m.order === null);
      console.log('order未設定のメニューがある:', needsOrder);

      if (needsOrder) {
        console.log('order を自動付与します...');
        // createdAt が古い順に並べて連番を付与
        const sortedByCreatedAt = [...data].sort((a, b) => {
          const aTime = (a.createdAt as Date | undefined)?.getTime?.() ?? 0;
          const bTime = (b.createdAt as Date | undefined)?.getTime?.() ?? 0;
          return aTime - bTime;
        });

        const menusWithOrder = sortedByCreatedAt.map((menu, index) => ({
          ...menu,
          order: (menu.order !== undefined && menu.order !== null) ? menu.order : index
        }));
        console.log('order付与後のメニュー:', menusWithOrder);

        try {
          await updateMenusOrder(user.uid, menusWithOrder);
          console.log('✅ orderをFirestoreに保存しました');
        } catch (saveErr) {
          console.error('❌ order保存エラー:', saveErr);
        }

        const sortedMenus = [...menusWithOrder].sort((a, b) => (a.order || 0) - (b.order || 0));
        setMenus(sortedMenus);
      } else {
        console.log('既に全メニューに order が設定されています');
        const sortedMenus = [...data].sort((a, b) => (a.order || 0) - (b.order || 0));
        setMenus(sortedMenus);
      }
    } catch (err) {
      console.error('メニュー一覧の取得に失敗しました:', err);
      setError('メニューの取得に失敗しました。時間をおいて再度お試しください。');
      setStatus({
        type: 'error',
        message: `メニューの取得に失敗しました: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
    } finally {
      setIsLoading(false);
      console.log('=== getMenus 終了 ===');
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchMenus();
    } else if (!authLoading) {
      setMenus([]);
    }
  }, [user, authLoading, fetchMenus]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedMenus.findIndex(m => m.id === active.id);
    const newIndex = sortedMenus.findIndex(m => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrderList = arrayMove(sortedMenus, oldIndex, newIndex).map((m, idx) => ({ ...m, order: idx }));
    setMenus(newOrderList);
    try {
      if (user) {
        await updateMenusOrder(user.uid, newOrderList);
      }
    } catch (e) {
      console.error('順序の保存エラー:', e);
      // revert on failure
      await fetchMenus();
    }
  };

  const handleCreateDialogOpenChange = (open: boolean) => {
    setIsCreateDialogOpen(open);
    if (!open) {
      setFormState(createEmptyFormState());
    }
  };

  const handleCategoryToggle = (category: string) => {
    setFormState(prev => {
      const exists = prev.category.includes(category);
      return {
        ...prev,
        category: exists
          ? prev.category.filter(item => item !== category)
          : [...prev.category, category]
      };
    });
  };

  const handleEditCategoryToggle = (category: string) => {
    setEditFormState(prev => {
      const exists = prev.category.includes(category);
      return {
        ...prev,
        category: exists
          ? prev.category.filter(item => item !== category)
          : [...prev.category, category]
      };
    });
  };

  const handleSubmit = async () => {
    if (!user) {
      setStatus({ type: 'error', message: 'ログインしていません。' });
      return;
    }

    if (!formState.name.trim()) {
      setStatus({ type: 'error', message: 'メニュー名を入力してください。' });
      return;
    }

    console.log('新規メニューの保存処理を開始', formState);
    setIsSaving(true);
    setStatus({ type: 'info', message: 'メニューを保存しています...' });

    try {
      const nextOrder = menus.length > 0 ? Math.max(...menus.map(menu => menu.order ?? 0)) + 1 : 0;

      await createMenu(user.uid, {
        ...formState,
        order: nextOrder,
        userId: user.uid
      });

      console.log('新規メニューの保存に成功しました');
      setStatus({ type: 'success', message: 'メニューを追加しました。' });
      handleCreateDialogOpenChange(false);
      await fetchMenus();
    } catch (err) {
      console.error('新規メニューの保存に失敗しました:', err);
      setStatus({
        type: 'error',
        message: `メニューの保存に失敗しました: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleInitializeMenus = async () => {
    if (!user) {
      setStatus({ type: 'error', message: 'ログインしていません。' });
      return;
    }

    console.log('初期メニュー登録を開始します');
    setIsInitializing(true);
    setStatus({ type: 'info', message: '初期メニューを登録しています...' });

    try {
      await initializeDefaultMenus(user.uid);
      console.log('初期メニュー登録に成功しました');
      setStatus({ type: 'success', message: '初期メニューを登録しました。' });
      await fetchMenus();
    } catch (err) {
      console.error('初期メニュー登録に失敗しました:', err);
      setStatus({
        type: 'error',
        message: `初期メニューの登録に失敗しました: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
    } finally {
      setIsInitializing(false);
    }
  };

  const openEditDialog = (menu: Menu) => {
    setEditingMenu(menu);
    setEditFormState({
      name: menu.name || '',
      category: Array.isArray(menu.category) ? menu.category : [],
      type: menu.type,
      hasSides: Boolean(menu.hasSides)
    });
    setIsEditDialogOpen(true);
  };

  const handleEditDialogChange = (open: boolean) => {
    setIsEditDialogOpen(open);
    if (!open) {
      setEditingMenu(null);
      setEditFormState(createEmptyFormState());
      setIsUpdating(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!user || !editingMenu) {
      setStatus({ type: 'error', message: '編集対象のメニューが選択されていません。' });
      return;
    }

    if (!editFormState.name.trim()) {
      setStatus({ type: 'error', message: 'メニュー名を入力してください。' });
      return;
    }

    console.log('メニュー編集を開始します', { id: editingMenu.id, data: editFormState });
    setIsUpdating(true);
    setStatus({ type: 'info', message: 'メニューを更新しています...' });

    try {
      await updateMenu(user.uid, editingMenu.id, {
        name: editFormState.name.trim(),
        category: editFormState.category,
        type: editFormState.type,
        hasSides: editFormState.hasSides,
        order: editingMenu.order,
        userId: user.uid
      });

      console.log('メニュー編集に成功しました');
      setStatus({ type: 'success', message: 'メニューを更新しました。' });
      handleEditDialogChange(false);
      await fetchMenus();
    } catch (err) {
      console.error('メニュー編集に失敗しました:', err);
      setStatus({
        type: 'error',
        message: `メニューの更新に失敗しました: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const openDeleteDialog = (menu: Menu) => {
    setDeleteTargetMenu(menu);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteDialogChange = (open: boolean) => {
    setIsDeleteDialogOpen(open);
    if (!open) {
      setDeleteTargetMenu(null);
      setIsDeleting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!user || !deleteTargetMenu) {
      setStatus({ type: 'error', message: '削除対象のメニューが選択されていません。' });
      return;
    }

    console.log('メニュー削除を開始します', { id: deleteTargetMenu.id });
    setIsDeleting(true);
    setStatus({ type: 'info', message: 'メニューを削除しています...' });

    try {
      await deleteMenu(user.uid, deleteTargetMenu.id);
      console.log('メニュー削除に成功しました');
      setStatus({ type: 'success', message: 'メニューを削除しました。' });
      handleDeleteDialogChange(false);
      await fetchMenus();
    } catch (err) {
      console.error('メニュー削除に失敗しました:', err);
      setStatus({
        type: 'error',
        message: `メニューの削除に失敗しました: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">
        認証状態を確認しています...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-lg font-medium text-gray-700">メニューを管理するにはログインしてください。</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">メニュー管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">トレーニングメニューの追加・管理を行います。</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {menus.length === 0 && !isLoading && (
            <Button
              variant="secondary"
              onClick={handleInitializeMenus}
              disabled={isInitializing}
            >
              {isInitializing ? '登録中...' : '初期メニューを登録'}
            </Button>
          )}

          <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
            <Button onClick={() => handleCreateDialogOpenChange(true)}>新しいメニューを追加</Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新しいメニューを追加</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="menu-name">メニュー名</Label>
                  <Input
                    id="menu-name"
                    placeholder="例：ベンチプレス"
                    value={formState.name}
                    onChange={event => setFormState(prev => ({ ...prev, name: event.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>カテゴリ</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {CATEGORY_OPTIONS.map(option => (
                      <Label
                        key={option}
                        className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-normal hover:bg-accent"
                      >
                        <Checkbox
                          checked={formState.category.includes(option)}
                          onCheckedChange={() => handleCategoryToggle(option)}
                        />
                        {option}
                      </Label>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>タイプ</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(['weight', 'bodyweight', 'time', 'distance'] as MenuTypeOption[]).map(option => {
                        const config = MENU_TYPE_CONFIG[option];
                        const isActive = formState.type === option;
                        return (
                          <label
                            key={option}
                            className={`flex h-full cursor-pointer flex-col gap-1 rounded-md border p-3 text-left text-sm transition-colors ${
                              isActive ? 'border-primary bg-primary/10 shadow-sm' : 'border-input hover:border-primary/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name="menu-type"
                              value={option}
                              checked={isActive}
                              onChange={() => setFormState(prev => ({ ...prev, type: option }))}
                              className="hidden"
                            />
                            <span className="font-medium text-foreground">{config.label}</span>
                            <span className="text-xs text-muted-foreground">{config.description}</span>
                            <span className="text-[11px] text-muted-foreground/80">({option})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-4">
                    {renderTypePreview(formState.type)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="hasSides"
                    checked={formState.hasSides}
                    onCheckedChange={checked =>
                      setFormState(prev => ({ ...prev, hasSides: Boolean(checked) }))
                    }
                  />
                  <Label htmlFor="hasSides" className="text-sm">左右ありの種目です</Label>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => handleCreateDialogOpenChange(false)} disabled={isSaving}>
                  キャンセル
                </Button>
                <Button onClick={handleSubmit} disabled={isSaving}>
                  {isSaving ? '保存中...' : '保存する'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {status && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            status.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : status.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-blue-200 bg-blue-50 text-blue-700'
          }`}
        >
          {status.message}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Card key={index} className="animate-pulse">
              <CardHeader>
                <div className="h-5 w-1/2 rounded bg-slate-200" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-4 w-3/4 rounded bg-slate-200" />
                <div className="h-4 w-2/3 rounded bg-slate-200" />
                <div className="h-4 w-1/3 rounded bg-slate-200" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sortedMenus.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center text-muted-foreground">
          まだメニューが登録されていません。新しいメニューを追加しましょう。
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedMenus.map(m => m.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {sortedMenus.map(menu => (
                <SortableMenuItem
                  key={menu.id}
                  menu={menu}
                  onEdit={openEditDialog}
                  onDelete={(id) => openDeleteDialog(sortedMenus.find(m => m.id === id)!)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={handleEditDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>メニューを編集</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-menu-name">メニュー名</Label>
              <Input
                id="edit-menu-name"
                placeholder="例：ベンチプレス"
                value={editFormState.name}
                onChange={event => setEditFormState(prev => ({ ...prev, name: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>カテゴリ</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CATEGORY_OPTIONS.map(option => (
                  <Label
                    key={option}
                    className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-normal hover:bg-accent"
                  >
                    <Checkbox
                      checked={editFormState.category.includes(option)}
                      onCheckedChange={() => handleEditCategoryToggle(option)}
                    />
                    {option}
                  </Label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>タイプ</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['weight', 'bodyweight', 'time', 'distance'] as MenuTypeOption[]).map(option => {
                    const config = MENU_TYPE_CONFIG[option];
                    const isActive = editFormState.type === option;
                    return (
                      <label
                        key={option}
                        className={`flex h-full cursor-pointer flex-col gap-1 rounded-md border p-3 text-left text-sm transition-colors ${
                          isActive ? 'border-primary bg-primary/10 shadow-sm' : 'border-input hover:border-primary/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name="edit-menu-type"
                          value={option}
                          checked={isActive}
                          onChange={() => setEditFormState(prev => ({ ...prev, type: option }))}
                          className="hidden"
                        />
                        <span className="font-medium text-foreground">{config.label}</span>
                        <span className="text-xs text-muted-foreground">{config.description}</span>
                        <span className="text-[11px] text-muted-foreground/80">({option})</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-md border bg-muted/40 p-4">
                {renderTypePreview(editFormState.type)}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-hasSides"
                checked={editFormState.hasSides}
                onCheckedChange={checked =>
                  setEditFormState(prev => ({ ...prev, hasSides: Boolean(checked) }))
                }
              />
              <Label htmlFor="edit-hasSides" className="text-sm">左右ありの種目です</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleEditDialogChange(false)} disabled={isUpdating}>
              キャンセル
            </Button>
            <Button onClick={handleEditSubmit} disabled={isUpdating}>
              {isUpdating ? '更新中...' : '更新する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTargetMenu
                ? `${deleteTargetMenu.name || '名称未設定'} を削除すると元に戻せません。`
                : 'メニューを削除すると元に戻せません。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? '削除中...' : '削除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
