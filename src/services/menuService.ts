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
  writeBatch
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Menu } from '@/types/menu';

const MENUS_COLLECTION = 'menus';

const DEFAULT_MENUS: Array<Pick<Menu, 'name' | 'category' | 'type' | 'hasSides'>> = [
  { name: 'ベンチプレス', category: ['胸'], type: 'weight', hasSides: false },
  { name: 'スミスマシン', category: ['胸'], type: 'weight', hasSides: false },
  { name: 'ダンベルプレス', category: ['胸'], type: 'weight', hasSides: false },
  { name: 'ラットプルダウン', category: ['背中'], type: 'weight', hasSides: false },
  { name: 'シーテッドロー', category: ['背中'], type: 'weight', hasSides: true },
  { name: 'サイドレイズ', category: ['肩'], type: 'weight', hasSides: true },
  { name: 'レッグプレス', category: ['足'], type: 'weight', hasSides: false },
  { name: '腹筋', category: ['体幹'], type: 'time', hasSides: false }
];

const removeUndefined = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item)).filter(item => item !== undefined);
  }

  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  }

  return obj;
};

// Batch update order for menus
export const updateMenusOrder = async (userId: string, menus: Menu[]): Promise<void> => {
  if (!userId) throw new Error('ユーザーIDが指定されていません');
  try {
    const batch = writeBatch(db);
    const basePath = `users/${userId}/${MENUS_COLLECTION}`;
    menus.forEach(menu => {
      const ref = doc(db, basePath, menu.id);
      batch.update(ref, { order: menu.order ?? 0, updatedAt: Timestamp.now() });
    });
    await batch.commit();
    console.log('メニューの順序を更新しました');
  } catch (error) {
    console.error('順序更新エラー:', error);
    throw error;
  }
};

const convertToDate = (timestamp: any): Date => {
  try {
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }

    if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
      return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
    }

    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    if (typeof timestamp === 'number') {
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

const normalizeDateField = (value: any, fieldName: string): Timestamp | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value instanceof Timestamp) {
    return value;
  }

  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }

  try {
    const date = convertToDate(value);
    return Timestamp.fromDate(date);
  } catch (error) {
    console.warn(`${fieldName} フィールドのTimestamp変換に失敗しました:`, value, error);
    return undefined;
  }
};

export const createMenu = async (
  userId: string,
  menuData: Omit<Menu, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Menu> => {
  try {
    console.log('=== createMenu 開始 ===');

    if (!userId) {
      throw new Error('ユーザーIDが指定されていません');
    }

    console.log('1. 受信したメニューデータ:', JSON.stringify(menuData, null, 2));

    const createdAtTimestamp = Timestamp.now();
    const updatedAtTimestamp = Timestamp.now();

    const dataToSave = {
      ...menuData,
      userId,
      createdAt: createdAtTimestamp,
      updatedAt: updatedAtTimestamp
    };

    console.log('2. Firestore 保存前データ:', JSON.stringify(dataToSave, null, 2));

    const cleanedData = removeUndefined(dataToSave);

    console.log('3. 未定義値除去後データ:', cleanedData);

    const docRef = await addDoc(
      collection(db, `users/${userId}/${MENUS_COLLECTION}`),
      cleanedData
    );

    console.log('4. 保存が完了しました。ドキュメントID:', docRef.id);

    const result: Menu = {
      id: docRef.id,
      ...menuData,
      userId,
      createdAt: convertToDate(createdAtTimestamp),
      updatedAt: convertToDate(updatedAtTimestamp)
    };

    console.log('5. 返却するメニュー:', JSON.stringify(result, null, 2));
    console.log('=== createMenu 終了 ===');

    return result;
  } catch (error) {
    console.error('メニュー作成中にエラーが発生しました:', error);
    throw new Error(`メニューの作成中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const getMenus = async (userId: string): Promise<Menu[]> => {
  console.log('=== getMenus 開始 ===');

  if (!userId) {
    console.warn('ユーザーIDが指定されていません。空のリストを返します。');
    return [];
  }

  try {
    const menusRef = collection(db, `users/${userId}/${MENUS_COLLECTION}`);
    const q = query(menusRef, orderBy('order', 'asc'));
    const querySnapshot = await getDocs(q);

    console.log(`取得したドキュメント数: ${querySnapshot.docs.length}`);

    const menus = querySnapshot.docs.map((docSnap, index) => {
      const data = docSnap.data();

      console.log(`\n=== メニュー ${index + 1} ===`);
      console.log('ドキュメントID:', docSnap.id);
      console.log('name:', data.name);
      console.log('category:', data.category);
      console.log('order:', data.order);

      const createdAt = convertToDate(data.createdAt);
      const updatedAt = data.updatedAt ? convertToDate(data.updatedAt) : createdAt;

      const menu: Menu = {
        id: docSnap.id,
        name: data.name || '',
        category: Array.isArray(data.category) ? data.category : [],
        type: (data.type as Menu['type']) ?? 'weight',
        hasSides: Boolean(data.hasSides),
        order: typeof data.order === 'number' ? data.order : 0,
        userId: data.userId || userId,
        createdAt,
        updatedAt
      };

      return menu;
    });

    console.log('=== getMenus 完了 ===');
    return menus;
  } catch (error) {
    console.error('メニュー取得中にエラーが発生しました:', error);
    throw new Error(`メニューの取得中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const getMenuById = async (userId: string, menuId: string): Promise<Menu | null> => {
  try {
    console.log('=== getMenuById 開始 ===');
    console.log('1. 取得対象:', { userId, menuId });

    const docRef = doc(db, `users/${userId}/${MENUS_COLLECTION}`, menuId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.log('2. ドキュメントが存在しません');
      console.log('=== getMenuById 終了 (ドキュメントなし) ===');
      return null;
    }

    const data = docSnap.data();

    console.log('2. 取得したドキュメントデータ:', data);

    const createdAt = convertToDate(data.createdAt);
    const updatedAt = data.updatedAt ? convertToDate(data.updatedAt) : createdAt;

    const menu: Menu = {
      id: docSnap.id,
      name: data.name || '',
      category: Array.isArray(data.category) ? data.category : [],
      type: (data.type as Menu['type']) ?? 'weight',
      hasSides: Boolean(data.hasSides),
      order: typeof data.order === 'number' ? data.order : 0,
      userId: data.userId || userId,
      createdAt,
      updatedAt
    };

    console.log('3. 返却するメニュー:', JSON.stringify(menu, null, 2));
    console.log('=== getMenuById 完了 ===');

    return menu;
  } catch (error) {
    console.error('メニュー取得中にエラーが発生しました:', error);
    throw new Error(`メニューの取得中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const updateMenu = async (
  userId: string,
  menuId: string,
  menuData: Partial<Menu>
): Promise<void> => {
  try {
    console.log('=== updateMenu 開始 ===');
    console.log('1. 更新対象:', { userId, menuId });
    console.log('2. 受信した更新データ:', JSON.stringify(menuData, null, 2));

    const updateData: any = { ...menuData };

    if (menuData.createdAt !== undefined) {
      const createdAtTimestamp = normalizeDateField(menuData.createdAt, 'createdAt');
      if (createdAtTimestamp) {
        updateData.createdAt = createdAtTimestamp;
      } else {
        delete updateData.createdAt;
      }
    }

    if (menuData.category !== undefined && !Array.isArray(menuData.category)) {
      console.warn('category フィールドが配列ではありません。空配列に変換します。', menuData.category);
      updateData.category = [];
    }

    updateData.userId = userId;
    updateData.updatedAt = Timestamp.now();

    const cleanedData = removeUndefined(updateData);

    console.log('3. Firestore に更新するデータ:', cleanedData);

    const menuRef = doc(db, `users/${userId}/${MENUS_COLLECTION}`, menuId);
    await updateDoc(menuRef, cleanedData);

    console.log('=== updateMenu 終了 ===');
  } catch (error) {
    console.error('メニュー更新中にエラーが発生しました:', error);
    throw new Error(`メニューの更新中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const deleteMenu = async (userId: string, menuId: string): Promise<void> => {
  try {
    console.log('=== deleteMenu 開始 ===');
    console.log('1. 削除対象:', { userId, menuId });

    const menuRef = doc(db, `users/${userId}/${MENUS_COLLECTION}`, menuId);
    await deleteDoc(menuRef);

    console.log('=== deleteMenu 終了 ===');
  } catch (error) {
    console.error('メニュー削除中にエラーが発生しました:', error);
    throw new Error(`メニューの削除中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const deleteAllMenus = async (userId: string): Promise<void> => {
  console.log('=== deleteAllMenus 開始 ===');

  if (!userId) {
    throw new Error('ユーザーIDが指定されていません');
  }

  try {
    const menusRef = collection(db, `users/${userId}/${MENUS_COLLECTION}`);
    const snapshot = await getDocs(menusRef);

    console.log('1. 削除対象メニュー数:', snapshot.size);

    if (snapshot.empty) {
      console.log('削除対象のメニューが存在しません。処理を終了します。');
      console.log('=== deleteAllMenus 終了 ===');
      return;
    }

    const batch = writeBatch(db);
    snapshot.forEach(menuDoc => {
      console.log('  削除予定メニュー:', menuDoc.id, menuDoc.data()?.name);
      batch.delete(menuDoc.ref);
    });

    await batch.commit();

    console.log('=== deleteAllMenus 終了 ===');
  } catch (error) {
    console.error('全メニュー削除中にエラーが発生しました:', error);
    throw new Error(`全メニューの削除中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const initializeDefaultMenus = async (userId: string): Promise<void> => {
  console.log('=== initializeDefaultMenus 開始 ===');

  if (!userId) {
    throw new Error('ユーザーIDが指定されていません');
  }

  try {
    const existingMenus = await getMenus(userId);
    const existingNames = new Set(existingMenus.map(menu => menu.name));
    const menusToAdd = DEFAULT_MENUS.filter(menu => !existingNames.has(menu.name));

    console.log('1. 既存メニュー数:', existingMenus.length);
    console.log('2. 追加対象メニュー数:', menusToAdd.length);

    if (menusToAdd.length === 0) {
      console.log('追加するデフォルトメニューはありません。処理を終了します。');
      console.log('=== initializeDefaultMenus 終了 ===');
      return;
    }

    const baseOrder = existingMenus.length > 0
      ? Math.max(...existingMenus.map(menu => menu.order ?? 0))
      : -1;

    const batch = writeBatch(db);
    const menusRef = collection(db, `users/${userId}/${MENUS_COLLECTION}`);

    menusToAdd.forEach((menu, index) => {
      const docRef = doc(menusRef);
      const timestamp = Timestamp.now();
      const data = {
        ...menu,
        category: menu.category,
        hasSides: menu.hasSides,
        order: baseOrder + index + 1,
        userId,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      console.log('3. 初期メニューを追加します:', { id: docRef.id, ...data });
      batch.set(docRef, data);
    });

    await batch.commit();

    console.log('=== initializeDefaultMenus 終了 ===');
  } catch (error) {
    console.error('初期メニュー登録中にエラーが発生しました:', error);
    throw new Error(`初期メニューの登録中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const menuService = {
  createMenu,
  getMenus,
  getMenuById,
  updateMenu,
  deleteMenu,
  deleteAllMenus,
  initializeDefaultMenus,
  updateMenusOrder
};
