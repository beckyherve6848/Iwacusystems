import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, Profile } from '@/lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  tenantRecord: any | null;
  tenantChecked: boolean;
  loading: boolean;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, phone: string, captchaToken?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshTenant: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenantRecord, setTenantRecord] = useState<any | null>(null);
  const [tenantChecked, setTenantChecked] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('Unable to refresh account profile:', error.message);
      return;
    }
    setProfile(data);
    if (data?.role === 'tenant') {
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (tenantError) {
        console.error('Unable to refresh tenant details:', tenantError.message);
        setTenantChecked(true);
        return;
      }
      setTenantRecord(tenant);
    } else {
      setTenantRecord(null);
    }
    setTenantChecked(true);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const refreshTenant = async () => {
    if (!user) return;
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setTenantRecord(tenant);
    setTenantChecked(true);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        (async () => {
          await fetchProfile(session.user.id);
        })();
      } else {
        setProfile(null);
        setTenantRecord(null);
        setTenantChecked(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string, captchaToken?: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (error) return { error: error as Error | null };
    if (data.user) {
      const { data: existingProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();
      if (profileError) {
        console.error('Unable to verify account profile during sign-in:', profileError.message);
        await supabase.auth.signOut();
        return { error: new Error(`Unable to verify your account: ${profileError.message}`) };
      }

      let prof = existingProfile;
      if (!prof) {
        const accountEmail = data.user.email ?? email;
        const metadataName = data.user.user_metadata?.full_name;
        const fullName = typeof metadataName === 'string' && metadataName.trim()
          ? metadataName.trim()
          : accountEmail.split('@')[0] || 'New user';
        const metadataPhone = data.user.user_metadata?.phone;
        const { data: createdProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            full_name: fullName,
            email: accountEmail,
            phone: typeof metadataPhone === 'string' ? metadataPhone : null,
            role: 'tenant',
            is_active: true,
          })
          .select('*')
          .single();
        if (createError) {
          console.error('Unable to create missing account profile during sign-in:', createError.message);
          await supabase.auth.signOut();
          return { error: new Error(`Unable to prepare your account: ${createError.message}`) };
        }
        prof = createdProfile;
      }

      if (!prof.is_active && prof.role !== 'property_manager') {
        await supabase.auth.signOut();
        return { error: new Error('Your account is unavailable. Please contact the administrator.') };
      }
      await fetchProfile(data.user.id);
      setProfile(prof);
    }
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string, phone: string, captchaToken?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone },
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    if (error) return { error: error as Error };
    if (!data.user) return { error: new Error('Supabase signup completed without returning a user.') };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setTenantRecord(null);
    setTenantChecked(false);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, tenantRecord, tenantChecked, loading, signIn, signUp, signOut, refreshProfile, refreshTenant }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
