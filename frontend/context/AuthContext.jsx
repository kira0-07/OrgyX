'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import useAuthStore from '@/store/authStore';

const AuthContext = createContext();

const PUBLIC_ROUTES = ['/', '/login', '/forgot-password', '/reset-password'];

const ROUTE_PERMISSIONS = {
  '/dashboard/admin': (user) => user?.isAdmin,
  '/admin': (user) => user?.isAdmin,
  '/audit': (user) => user?.isAdmin,
  '/recommendations': (user) => user?.roleLevel <= 5 || user?.isAdmin,
};

export function AuthProvider({ children }) {
  const { user, isAuthenticated, isLoading, refreshUser } = useAuthStore();
  const [initialized, setInitialized] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // On every app mount — always validate token from backend
  // This prevents CEO seeing QA dashboard on refresh
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('accessToken');

      if (!token) {
        // No token — clear any stale state and redirect if on protected route
        useAuthStore.getState().logout();
        setInitialized(true);
        if (!PUBLIC_ROUTES.some(r => r === '/' ? pathname === '/' : pathname?.startsWith(r))) {
          router.replace('/login');
        }
        return;
      }

      // Always re-fetch from backend — never trust localStorage user data alone
      // This is the core fix: even if Zustand persist has stale user,
      // we validate against the real token
      const freshUser = await refreshUser();

      if (!freshUser) {
        // Token invalid or expired
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        setInitialized(true);
        if (!PUBLIC_ROUTES.some(r => r === '/' ? pathname === '/' : pathname?.startsWith(r))) {
          router.replace('/login');
        }
        return;
      }

      setInitialized(true);
    };

    initAuth();
  }, []); // Only on mount — not on every render

  // Route permission check on navigation
  useEffect(() => {
    if (!initialized || isLoading) return;
    if (!user) return;

    for (const [route, check] of Object.entries(ROUTE_PERMISSIONS)) {
      if (pathname?.startsWith(route) && !check(user)) {
        router.replace('/dashboard');
        return;
      }
    }
  }, [pathname, user, initialized, isLoading]);

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading: isLoading || !initialized,
    isSuperior: ['CEO','CTO','VP Engineering','Director of Engineering','Engineering Manager','Tech Lead'].includes(user?.role) || user?.isAdmin,
    isSubordinate: user?.roleLevel >= 7,
    isAdmin: user?.isAdmin,
    initialized,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export default AuthContext;