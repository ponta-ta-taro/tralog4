import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface ShareRecord {
  shareId: string;
  userId: string;
  password: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
  updatedAt?: Date;
}

const SHARES_COLLECTION = 'shares';
const SHARE_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const generateShareId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 14);
};

const generatePassword = (): string => {
  const value = Math.floor(1000 + Math.random() * 9000);
  return String(value);
};

const convertShareDoc = (data: any): ShareRecord | null => {
  if (!data) {
    return null;
  }
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt);
  const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toDate() : new Date(data.expiresAt);
  const updatedAt = data.updatedAt
    ? data.updatedAt instanceof Timestamp
      ? data.updatedAt.toDate()
      : new Date(data.updatedAt)
    : undefined;

  return {
    shareId: data.shareId,
    userId: data.userId,
    password: data.password,
    createdAt,
    expiresAt,
    isActive: Boolean(data.isActive),
    updatedAt
  };
};

export const createShare = async (userId: string): Promise<ShareRecord> => {
  if (!userId) {
    throw new Error('ユーザーIDが必要です');
  }

  const shareId = generateShareId();
  const password = generatePassword();
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(Date.now() + SHARE_DURATION_MS);

  const shareData = {
    shareId,
    userId,
    password,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    isActive: true
  };

  await setDoc(doc(db, SHARES_COLLECTION, shareId), shareData);

  return {
    shareId,
    userId,
    password,
    createdAt: now.toDate(),
    updatedAt: now.toDate(),
    expiresAt: expiresAt.toDate(),
    isActive: true
  };
};

export const getShare = async (shareId: string): Promise<ShareRecord | null> => {
  if (!shareId) {
    return null;
  }
  const snapshot = await getDoc(doc(db, SHARES_COLLECTION, shareId));
  if (!snapshot.exists()) {
    return null;
  }
  return convertShareDoc(snapshot.data());
};

export const verifyShare = async (shareId: string, password: string): Promise<ShareRecord | null> => {
  const share = await getShare(shareId);
  if (!share) {
    return null;
  }
  const now = new Date();
  if (!share.isActive || share.password !== password || share.expiresAt < now) {
    return null;
  }
  return share;
};

export const deactivateShare = async (shareId: string): Promise<void> => {
  if (!shareId) {
    throw new Error('共有IDが必要です');
  }
  const ref = doc(db, SHARES_COLLECTION, shareId);
  await updateDoc(ref, {
    isActive: false,
    updatedAt: Timestamp.now()
  });
};

export const getUserShares = async (userId: string): Promise<ShareRecord[]> => {
  if (!userId) {
    return [];
  }
  const sharesRef = collection(db, SHARES_COLLECTION);
  const q = query(sharesRef, where('userId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(docSnap => convertShareDoc(docSnap.data()))
    .filter((share): share is ShareRecord => Boolean(share));
};
