import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCAIixnGVjp7D3ZBOcutxYQxup5lppYS08',
  authDomain: 'durratalhijarh.firebaseapp.com',
  projectId: 'durratalhijarh',
  storageBucket: 'durratalhijarh.firebasestorage.app',
  messagingSenderId: '641813414689',
  appId: '1:641813414689:web:e8c379a64764e292acb460',
  measurementId: 'G-Y4YS1H769X',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
