import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, getStoredToken, setStoredToken, clearStoredToken } from '../services/api';
import { auth, signInWithGoogle, logOutFirebase } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { firestoreService } from '../services/firestoreService';
import type { User, Subscription, License } from '../types';

interface AuthContextType {
  user: User | null;
  subscription: Subscription | null;
  license: License | null;
  unreadCount: number;
  isLoading: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isPaid: boolean;
  canProcessVideo: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [license, setLicense] = useState<License | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setSubscription(null);
      setLicense(null);
      setIsLoading(false);
      return;
    }

    try {
      const data = await api.getMe();
      setUser(data.user);
      setSubscription(data.subscription);
      setLicense(data.license);
      setUnreadCount(data.unreadNotifications || 0);

      // Keep track of user data in Firestore
      firestoreService.syncUserProfile(data.user).catch((e) => {
        console.warn('Firestore user profile sync error:', e);
      });
    } catch (err: any) {
      console.warn('Failed to restore session via backend JWT:', err);
      // Strictly invalidate session on backend verification rejection
      clearStoredToken();
      logOutFirebase().catch(() => {});
      setUser(null);
      setSubscription(null);
      setLicense(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Initial check with backend session
    refreshUser();

    // Listen to Firebase Auth state for automatic session synchronization
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!isMounted) return;

      if (fbUser && fbUser.email) {
        try {
          const idToken = await fbUser.getIdToken();
          const res = await api.firebaseLogin({
            idToken,
            uid: fbUser.uid,
            email: fbUser.email,
            name: fbUser.displayName || fbUser.email.split('@')[0],
          });

          if (!isMounted) return;
          // Synchronize backend JWT token & user state strictly
          setStoredToken(res.token);
          setUser(res.user);
          setSubscription(res.subscription);
          setLicense(res.license);
          await firestoreService.syncUserProfile(res.user).catch(() => {});
        } catch (err) {
          console.warn('Firebase backend session synchronization error:', err);
          if (!isMounted) return;
          // If backend rejects Firebase token, clear local credentials
          clearStoredToken();
          logOutFirebase().catch(() => {});
          setUser(null);
          setSubscription(null);
          setLicense(null);
        } finally {
          if (isMounted) setIsLoading(false);
        }
      } else {
        // If Firebase is logged out and no stored token exists, ensure clean state
        const token = getStoredToken();
        if (!token && isMounted) {
          setUser(null);
          setSubscription(null);
          setLicense(null);
          setIsLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    setStoredToken(res.token);
    setUser(res.user);
    setSubscription(res.subscription);
    setLicense(res.license);

    // Sync to Firestore
    firestoreService.syncUserProfile(res.user).catch((e) => console.warn(e));
  };

  const signup = async (name: string, email: string, password: string) => {
    const res = await api.signup({ name, email, password });
    setStoredToken(res.token);
    setUser(res.user);
    setSubscription(res.subscription);
    setLicense(res.license);

    // Sync to Firestore
    firestoreService.syncUserProfile(res.user).catch((e) => console.warn(e));
  };

  const loginWithGoogle = async () => {
    // 1. Firebase Google Auth popup
    const fbUser = await signInWithGoogle();
    if (!fbUser.email) {
      throw new Error('Google account has no associated email.');
    }

    // 2. Authenticate with backend and obtain token
    const idToken = await fbUser.getIdToken();
    const res = await api.firebaseLogin({
      idToken,
      uid: fbUser.uid,
      email: fbUser.email,
      name: fbUser.displayName || fbUser.email.split('@')[0],
    });

    setStoredToken(res.token);
    setUser(res.user);
    setSubscription(res.subscription);
    setLicense(res.license);

    // 3. Persist and track user profile in Firestore
    await firestoreService.syncUserProfile(res.user);
  };

  const logout = () => {
    clearStoredToken();
    logOutFirebase().catch((e) => console.warn('Firebase sign out error:', e));
    setUser(null);
    setSubscription(null);
    setLicense(null);
    setUnreadCount(0);
  };

  const isOwner = user?.role === 'OWNER';
  const isAdmin = user?.role === 'ADMIN' || isOwner;

  const now = new Date();
  const isPaid =
    isOwner ||
    (subscription?.status === 'ACTIVE' &&
      subscription.plan !== 'FREE_DEMO' &&
      (subscription.expires_at ? new Date(subscription.expires_at) > now : subscription.plan === 'OWNER_LIFETIME'));

  const credits = isOwner || isPaid ? 9999 : (typeof user?.credits === 'number' ? user.credits : (user?.demo_used ? 0 : 1));
  const canProcessVideo = isOwner || isPaid || (Boolean(user) && !user?.demo_used && credits > 0);

  return (
    <AuthContext.Provider
      value={{
        user,
        subscription,
        license,
        unreadCount,
        isLoading,
        isOwner,
        isAdmin,
        isPaid,
        canProcessVideo,
        login,
        signup,
        loginWithGoogle,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
