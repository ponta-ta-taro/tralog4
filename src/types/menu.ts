export type MenuType = 'weight' | 'bodyweight' | 'time' | 'distance';

interface Menu {
  id: string;
  name: string; // メニュー名（例：ベンチプレス）
  category: string[]; // カテゴリ（例：["胸", "肩"]）
  type: MenuType; // 種目タイプ
  hasSides: boolean; // 左右があるか（例：サイドレイズ）
  order: number; // 表示順
  userId: string; // ユーザーID
  createdAt: Date;
  updatedAt: Date;
}

export type { Menu };
