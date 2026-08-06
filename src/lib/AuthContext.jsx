/**
 * src/lib/AuthContext.jsx — Supabase auth replacement
 * Replaces the Base44 auth context. Keeps the same { user, isLoading, logout } interface
 * so no other files need changing.
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, ALLOWED_GOOGLE_DOMAIN } from '@/api/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);

  const applySession = useCallback((session) => {
    if (session?.user) {
      const domain = session.user.email?.split('@')[1]?.toLowerCase();
      if (domain !== ALLOWED_GOOGLE_DOMAIN) {
        setUser(null);
        setAuthError({
          type: 'domain_not_allowed',
          message: `Only @${ALLOWED_GOOGLE_DOMAIN} Google accounts can sign in.`,
        });
        setIsLoadingAuth(false);
        setAuthChecked(true);
        supabase.auth.signOut();
        return;
      }
      setUser(formatUser(session.user));
      setAuthError(null);
    } else {
      setUser(null);
    }
    setIsLoadingAuth(false);
    setAuthChecked(true);
  }, []);

  const checkUserAuth = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    applySession(session);
  }, [applySession]);

  useEffect(() => {
    checkUserAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => subscription.unsubscribe();
  }, [checkUserAuth, applySession]);

  const logout = () => supabase.auth.signOut();

  const deleteAccount = () => {
    throw new Error('Account deletion is not available yet. Contact an administrator.');
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading: isLoadingAuth,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authChecked,
      authError,
      isAuthenticated: !!user,
      checkUserAuth,
      logout,
      deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// Format Supabase user to match Base44 user shape.
// role lives in app_metadata (not user_metadata) - app_metadata can only be
// changed by a privileged server-side function (see
// 20260806030000_roles_and_permissions.sql), unlike user_metadata, which a
// signed-in user can edit on themselves via supabase.auth.updateUser().
// Using user_metadata for authorization would let anyone grant themselves
// admin.
function formatUser(supabaseUser) {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    full_name: supabaseUser.user_metadata?.full_name || supabaseUser.email,
    role: supabaseUser.app_metadata?.role || 'user', // 'super_admin' | 'admin' | 'user'
  };
}

export function useAuth() {
  return useContext(AuthContext);
}
