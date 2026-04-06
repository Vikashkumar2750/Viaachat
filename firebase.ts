import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, getDoc, collection, query, where, or, onSnapshot, addDoc, orderBy, serverTimestamp, updateDoc, deleteDoc, getDocFromServer, getDocs, limit, arrayRemove, arrayUnion } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

console.log('Firebase Config:', { ...firebaseConfig, apiKey: '***' });
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

console.log('Initializing Firestore with databaseId:', firebaseConfig.firestoreDatabaseId);
// Use initializeFirestore with databaseId and auto-detect long polling to avoid internal assertion errors
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  ignoreUndefinedProperties: true,
}, firebaseConfig.firestoreDatabaseId || '(default)');

export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

let hasLoggedQuotaError = false;

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const isQuotaError = errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('resource-exhausted');
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  
  if (isQuotaError) {
    if (!hasLoggedQuotaError) {
      console.error('Firestore Quota Exceeded:', JSON.stringify(errInfo));
      hasLoggedQuotaError = true;
    }
    // We don't throw here to avoid "Uncaught Error" noise for a platform limit
    // App.tsx will handle the state change separately
    return; 
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, '_connection_test_', 'test'));
    console.log("Firestore connection successful.");
    return { success: true, isQuotaError: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isQuotaError = errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('resource-exhausted');
    
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    } else if (isQuotaError) {
      // Don't log as error if it's quota, as it's handled by the App state
      if (!hasLoggedQuotaError) {
        console.warn("Firestore connection test: Quota limit exceeded. This is a known platform limit.");
        hasLoggedQuotaError = true;
      }
      return { success: false, isQuotaError: true };
    } else {
      console.error("Firestore connection test failed:", error);
    }
    return { success: false, isQuotaError: false };
  }
}

export async function updateUserPresence(uid: string) {
  try {
    await updateDoc(doc(db, 'users', uid), {
      lastSeen: serverTimestamp()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isQuotaError = errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('resource-exhausted');
    
    if (isQuotaError) {
      if (!hasLoggedQuotaError) {
        console.warn("Firestore Quota Exceeded during presence update.");
        hasLoggedQuotaError = true;
      }
      return;
    }

    // If it fails because the doc doesn't exist, we don't want to spam errors
    if (!(error instanceof Error && error.message.includes('NOT_FOUND'))) {
      console.error("Error updating presence:", error);
    }
  }
}

export async function syncUser(user: { uid: string; displayName: string; photoURL: string; email: string }) {
  try {
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL,
      email: user.email || null,
      lastSeen: serverTimestamp()
    }, { merge: true });
    console.log("User synced with Firestore");
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function markMessagesAsRead(chatId: string) {
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      unreadCount: 0
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
  }
}

export {
  signInWithPopup,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  or,
  onSnapshot,
  addDoc,
  orderBy,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  getDocFromServer,
  getDocs,
  limit,
  arrayRemove,
  arrayUnion
};
