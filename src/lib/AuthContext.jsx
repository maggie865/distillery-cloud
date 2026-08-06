/**
 * src/lib/AuthContext.jsx — Supabase auth replacement
 * Replaces the Base44 auth context. Keeps the same { user, isLoading, logout } interface
 * so no other files need changing.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ? formatUser(session.user) : null);
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? formatUser(session.user) : null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Format Supabase user to match Base44 user shape
// role is stored in user_metadata — set it via Supabase dashboard or SQL
function formatUser(supabaseUser) {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    full_name: supabaseUser.user_metadata?.full_name || supabaseUser.email,
    role: supabaseUser.user_metadata?.role || 'user', // 'admin' | 'user' | 'crew'
  };
}

export function useAuth() {
  return useContext(AuthContext);
}
