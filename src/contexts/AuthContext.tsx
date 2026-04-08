import React, { createContext, useContext, useEffect, useState } from 'react';
import { localAuth, isLocalMode } from '@/services/localApi';

// Minimal User type matching what the app needs
interface User {
  id: string;
  email?: string | null;
}

interface Session {
  access_token: string;
  user: User;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing local session
    const existingUser = localAuth.getUser();
    if (existingUser) {
      setUser(existingUser);
      setSession({ access_token: existingUser.id, user: existingUser });
    }
    setLoading(false);
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { data, error } = await localAuth.signUp(email, password, fullName);
      if (error) return { error: new Error(error.message || 'Sign up failed') };
      if (data?.user) {
        setUser(data.user);
        setSession(data.session);
      }
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err.message || 'Sign up failed') };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await localAuth.signIn(email, password);
      if (error) return { error: new Error(error.message || 'Sign in failed') };
      if (data?.user) {
        setUser(data.user);
        setSession(data.session);
      }
      return { error: null };
    } catch (err: any) {
      return { error: new Error(err.message || 'Sign in failed') };
    }
  };

  const signOut = async () => {
    await localAuth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
