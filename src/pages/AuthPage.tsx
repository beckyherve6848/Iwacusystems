import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import { ArrowLeft, Mail, Lock, Eye, EyeOff, User, Phone, Globe, Home, Users, TrendingUp, ChevronDown, LockKeyhole } from 'lucide-react';
import { createPortal } from 'react-dom';
import 'flag-icons/css/flag-icons.min.css';
import type { CountryCode } from 'libphonenumber-js';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import Input from '@/components/ui/Input';
import TurnstileCaptcha from '@/components/auth/TurnstileCaptcha';
import { getPhoneCountryOptions, getPhoneNumberPlaceholder, normalizePhoneNumberForCountry } from '@/lib/phone';
import { getThemeModeForCurrentDevice } from '@/lib/phoneThemeMode';

const authInputStyle: React.CSSProperties = {
  background: '#ffffff',
  borderColor: '#cbd5e1',
  color: '#111827',
};

interface AuthPageProps {
  onSuccess: () => void;
}

export default function AuthPage({ onSuccess }: AuthPageProps) {
  const { signIn, signUp } = useAuth();
  const { language, setLanguage, t, appName, appLogoUrl, loginBackgroundUrl, loginFamilyImageUrl } = useTheme();
  const captchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? '';
  const captchaRequired = import.meta.env.PROD || Boolean(captchaSiteKey);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [bgFailed, setBgFailed] = useState(false);
  const [familyImageFailed, setFamilyImageFailed] = useState(false);
  const [remember, setRemember] = useState(false);
  const [emailInputEnabled, setEmailInputEnabled] = useState(false);
  const [passwordInputEnabled, setPasswordInputEnabled] = useState(false);
  const [confirmPasswordInputEnabled, setConfirmPasswordInputEnabled] = useState(false);
  const [captchaVisible, setCaptchaVisible] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [callingCode, setCallingCode] = useState('+257');
  const [selectedCountryCode, setSelectedCountryCode] = useState<CountryCode>('BI');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [countryCodeOpen, setCountryCodeOpen] = useState(false);
  const [countryCodeSearch, setCountryCodeSearch] = useState('');
  const [countryMenuPosition, setCountryMenuPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 256 });
  const [isPhoneViewport, setIsPhoneViewport] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const callingCodePickerRef = useRef<HTMLDivElement>(null);
  const countryMenuRef = useRef<HTMLDivElement>(null);
  const phoneCountryOptions = useMemo(() => getPhoneCountryOptions(language), [language]);
  const selectedPhoneCountry = phoneCountryOptions.find(option => option.countryCode === selectedCountryCode);
  const filteredPhoneCountryOptions = useMemo(() => {
    const query = countryCodeSearch.replace(/\D/g, '');
    return query
      ? phoneCountryOptions.filter(option => option.code.startsWith(query))
      : phoneCountryOptions;
  }, [countryCodeSearch, phoneCountryOptions]);

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '',
  });
  const phoneNumberPlaceholder = getPhoneNumberPlaceholder(selectedCountryCode);
  const normalizedPhone = normalizePhoneNumberForCountry(form.phone.trim(), selectedCountryCode);
  const phoneInvalid = (phoneTouched || form.phone.length > 0) && !normalizedPhone;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  useLayoutEffect(() => {
    const root = document.documentElement;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    root.classList.add('auth-screen');
    document.body.style.backgroundColor = '#000000';
    if (isPhoneViewport) themeColor?.setAttribute('content', '#000000');
    return () => {
      root.classList.remove('auth-screen');
      document.body.style.backgroundColor = '';
      themeColor?.setAttribute(
        'content',
        getThemeModeForCurrentDevice() === 'dark' ? '#242526' : '#e2e8f0',
      );
    };
  }, [isPhoneViewport]);

  const updateCountryMenuPosition = useCallback(() => {
    const trigger = callingCodePickerRef.current?.querySelector('button');
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportTop = window.visualViewport?.offsetTop ?? 0;
    const maxHeight = Math.max(120, Math.min(256, viewportHeight - 24));
    const below = viewportTop + viewportHeight - rect.bottom - 8;
    const above = rect.top - viewportTop - 8;
    const openAbove = below < Math.min(200, maxHeight) && above > below;
    const availableHeight = Math.max(120, Math.min(maxHeight, openAbove ? above : below));
    const width = Math.min(Math.max(rect.width, 280), viewportWidth - 24);
    const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
    setCountryMenuPosition({
      top: openAbove ? Math.max(viewportTop + 8, rect.top - availableHeight - 8) : rect.bottom + 8,
      left,
      width,
      maxHeight: availableHeight,
    });
  }, []);

  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 767px)');
    const updateViewport = () => setIsPhoneViewport(viewport.matches);
    viewport.addEventListener('change', updateViewport);
    return () => viewport.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    if (!countryCodeOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!callingCodePickerRef.current?.contains(target) && !countryMenuRef.current?.contains(target)) {
        setCountryCodeOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCountryCodeOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updateCountryMenuPosition);
    window.addEventListener('scroll', updateCountryMenuPosition, true);
    window.visualViewport?.addEventListener('resize', updateCountryMenuPosition);
    window.visualViewport?.addEventListener('scroll', updateCountryMenuPosition);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updateCountryMenuPosition);
      window.removeEventListener('scroll', updateCountryMenuPosition, true);
      window.visualViewport?.removeEventListener('resize', updateCountryMenuPosition);
      window.visualViewport?.removeEventListener('scroll', updateCountryMenuPosition);
    };
  }, [countryCodeOpen, updateCountryMenuPosition]);

  const getAuthErrorMessage = (message: string) => {
    const normalized = message.toLowerCase();
    if (
      normalized.includes('failed to fetch') ||
      normalized.includes('network request failed') ||
      normalized.includes('networkerror') ||
      normalized.includes('fetch failed') ||
      normalized.includes('err_internet_disconnected')
    ) {
      return t('authNetworkError');
    }
    return message;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRegistrationMessage('');
    if (mode === 'register') {
      setPhoneTouched(true);
      if (!normalizedPhone) {
        setError(language === 'fr'
          ? 'Saisissez un numéro complet et valide pour le pays sélectionné.'
          : 'Enter a complete, valid phone number for the selected country.');
        return;
      }
    }
    if (
      !form.email.trim() ||
      !form.password ||
      (mode === 'register' && (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim() || !form.confirmPassword))
    ) {
      setError(language === 'fr' ? 'Veuillez remplir tous les champs obligatoires.' : 'Please fill in all required fields.');
      return;
    }
    if (import.meta.env.PROD && !captchaSiteKey) {
      setError(language === 'fr'
        ? 'La protection anti-robot n’est pas configurée. Veuillez contacter l’administrateur.'
        : 'Bot protection is not configured. Please contact the administrator.');
      return;
    }
    if (captchaRequired && !captchaToken) {
      setCaptchaVisible(true);
      setError(language === 'fr'
        ? 'Veuillez terminer le contrôle de sécurité.'
        : 'Please complete the security check.');
      return;
    }
    setLoading(true);
    if (mode === 'login') {
      try {
        const { error } = await signIn(form.email, form.password, captchaToken ?? undefined);
        if (error) {
          const unavailableMessage = 'Your account is unavailable. Please contact the administrator.';
          const message = error.message === unavailableMessage
            ? language === 'fr'
              ? 'Votre compte est indisponible. Veuillez contacter l’administrateur.'
              : unavailableMessage
            : error.message === 'Invalid login credentials'
              ? language === 'fr'
                ? 'Email ou mot de passe invalide.'
                : 'Invalid email or password.'
              : getAuthErrorMessage(error.message);
          setError(message);
        } else {
          onSuccess();
        }
      } catch (caught) {
        setError(getAuthErrorMessage(caught instanceof Error ? caught.message : String(caught)));
      }
    } else {
      if (form.password !== form.confirmPassword) {
        setError(language === 'fr' ? 'Les mots de passe ne correspondent pas.' : 'Passwords do not match.');
        setLoading(false); return;
      }
      if (form.password.length < 8) {
        setError(language === 'fr' ? 'Le mot de passe doit comporter au moins 8 caractères.' : 'Password must be at least 8 characters.');
        setLoading(false); return;
      }
      try {
        const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
        if (!normalizedPhone) {
          setPhoneTouched(true);
          setError(language === 'fr'
            ? 'Saisissez un numéro complet et valide pour le pays sélectionné.'
            : 'Enter a complete, valid phone number for the selected country.');
          setLoading(false);
          return;
        }
        const { error } = await signUp(form.email, form.password, fullName, normalizedPhone, captchaToken ?? undefined);
        if (error) setError(getAuthErrorMessage(error.message) || (language === 'fr' ? "Échec de l'inscription." : 'Registration failed.'));
        else {
          setMode('login');
          setError('');
          setRegistrationMessage(language === 'fr'
            ? "Inscription réussie. Veuillez attendre la configuration de votre profil."
            : 'Registration successful. Please wait for your profile to be set up.');
          setForm(f => ({ ...f, password: '', confirmPassword: '' }));
        }
      } catch (caught) {
        setError(getAuthErrorMessage(caught instanceof Error ? caught.message : String(caught)));
      }
    }
    setCaptchaToken(null);
    setCaptchaResetKey(key => key + 1);
    setLoading(false);
  };

  const stats = [
    { icon: Home, label: language === 'fr' ? 'Gestion des maisons' : 'House Managing', value: '100K+' },
    { icon: Users, label: language === 'fr' ? 'Locataires actifs' : 'Active Tenants', value: '500K+' },
    { icon: TrendingUp, label: language === 'fr' ? 'Paiements suivis' : 'Payments Tracked', value: '1B+' },
  ];

  if (forgotPasswordOpen) {
    return (
      <main className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-[#08090c] px-4 py-8 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <img src={appLogoUrl} alt="" className="h-11 w-11 object-contain" />
            <div>
              <p className="font-bold tracking-tight">{appName}</p>
              <p className="text-xs text-white/50">{t('propertyPlatform')}</p>
            </div>
          </div>
          <div className="mb-5 flex h-12 w-12 items-center justify-center text-red-500">
            <LockKeyhole className="h-8 w-8" strokeWidth={2.2} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {language === 'fr' ? 'Aide pour le mot de passe' : 'Password help'}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70" role="status">
            {language === 'fr'
              ? 'Pour récupérer ou réinitialiser votre mot de passe, veuillez contacter l’administrateur de votre propriété. Il pourra vérifier votre compte et vous aider.'
              : 'To retrieve or reset your password, please contact your property administrator. They can verify your account and help you regain access.'}
          </p>
          {form.email.trim() && (
            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <p className="text-xs text-white/45">{language === 'fr' ? 'E-mail du compte' : 'Account email'}</p>
              <p className="mt-1 break-all text-sm font-medium text-white/90">{form.email.trim()}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setForgotPasswordOpen(false);
              setError('');
            }}
            className="mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600 active:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {language === 'fr' ? 'Retour à la connexion' : 'Back to sign in'}
          </button>
        </section>
      </main>
    );
  }

  return (
    <>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes glassShimmer {
          0% { transform: translateX(-100%) rotate(25deg); }
          100% { transform: translateX(200%) rotate(25deg); }
        }
        .auth-form-card { animation: fadeSlideUp 0.6s ease forwards; }
        .auth-brand-copy { position: relative; top: 64px; }
        .auth-brand-heading {
          font-family: 'Kaushan Script', cursive;
          font-weight: 400;
          letter-spacing: normal;
          line-height: 1.2;
        }
        @media (min-width: 1024px) {
          .auth-layout {
            height: 100vh;
            height: 100dvh;
            min-height: 0;
            overflow: hidden;
          }
          .auth-brand-panel,
          .auth-form-panel {
            height: calc(100vh - 80px);
            height: min(calc(100dvh - 80px), 820px);
          }
          .auth-form-panel {
            min-height: min(560px, calc(100vh - 32px));
            max-height: calc(100dvh - 32px);
            overflow-y: auto;
            overscroll-behavior-y: contain;
            scroll-behavior: smooth;
            scrollbar-width: thin;
            scrollbar-color: rgba(255,255,255,0.2) transparent;
          }
          .auth-form-panel::-webkit-scrollbar { width: 6px; }
          .auth-form-panel::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.2);
            border-radius: 4px;
          }
        }
        @media (min-width: 1024px) and (max-height: 700px) {
          .auth-brand-content { padding: 24px 28px 0; }
          .auth-brand-logo { margin-bottom: 24px; }
          .auth-brand-copy { top: 32px; }
          .auth-brand-heading { font-size: 36px; line-height: 1; }
          .auth-brand-description { font-size: 14px; line-height: 1.4; }
          .auth-brand-stats { padding: 0 28px 24px; }
          .auth-brand-stat { padding: 10px; }
          .auth-brand-stat-icon { margin-bottom: 8px; }
          .auth-brand-stat-value { font-size: 20px; }
          .auth-brand-stat-label { font-size: 10px; }
        }
        .liquid-btn { position: relative; overflow: hidden; transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .liquid-btn::before {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 100%;
          background: linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.12), transparent 65%);
          transform: translateX(-100%);
          transition: transform 0.6s ease;
        }
        .liquid-btn:hover::before { transform: translateX(100%); }
        .liquid-btn:hover { transform: translateY(-1px); box-shadow: 0 12px 32px rgba(0,0,0,0.4); }
        .input-glow:focus-within {
          box-shadow: 0 0 0 1px rgba(255,255,255,0.3), 0 8px 24px rgba(0,0,0,0.2);
        }
        .glass-reflection {
          position: absolute;
          top: 0; left: -50%;
          width: 60%; height: 100%;
          background: linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.03) 50%, transparent 60%);
          pointer-events: none;
        }
      `}</style>

      {/* Full-screen background */}
      <div className="min-h-screen min-h-[100dvh] relative overflow-x-clip lg:overflow-hidden" style={{ background: '#000000' }}>
        {!isPhoneViewport && loginBackgroundUrl && !bgFailed && (
          <img
            src={loginBackgroundUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'grayscale(1) blur(8px)', opacity: bgLoaded ? 0.25 : 0, transition: 'opacity 1s ease' }}
            onLoad={() => setBgLoaded(true)}
            onError={() => setBgFailed(true)}
          />
        )}
        {/* Dark overlay */}
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.78)' }} />

        {/* Subtle dot grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        {/* Two-panel layout */}
        <div className="auth-layout relative z-10 min-h-screen min-h-[100dvh] flex flex-col lg:flex-row items-center justify-center gap-4 p-2 min-[400px]:gap-6 min-[400px]:p-3 sm:p-4 lg:p-10">

          {/* ─── LEFT PANEL: Branding (55%) ─── */}
          <div
            className="auth-brand-panel hidden lg:flex lg:w-[55%] xl:w-[52%] flex-col justify-between relative overflow-hidden"
            style={{
              borderRadius: '32px',
              background: 'rgba(11,11,11,0.5)',
              backdropFilter: 'blur(36px)',
              WebkitBackdropFilter: 'blur(36px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 30px 100px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {!isPhoneViewport && (
              <img
                src={loginFamilyImageUrl && !familyImageFailed ? loginFamilyImageUrl : '/Bck.png'}
                alt="Happy family under a home roof"
                className="absolute inset-0 w-full h-full object-contain object-bottom opacity-70"
                onError={() => setFamilyImageFailed(true)}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/75 to-[#0b0b0b]/35" />
            <div className="glass-reflection" />

            {/* Top: Logo + label */}
            <div className="auth-brand-content relative z-10 p-10 xl:p-14">
              <div className="auth-brand-logo flex items-center gap-3.5 mb-12" style={{ animation: 'fadeSlideUp 0.5s ease forwards' }}>
                <img src={appLogoUrl} alt={`${appName} logo`} className="h-12 w-12 object-contain" />
                <div>
                  <p className="text-white font-bold text-xl tracking-tight">{appName}</p>
                  <p className="text-white/40 text-[10px] tracking-[0.2em] uppercase font-semibold">{t('propertyPlatform')}</p>
                </div>
              </div>

              <div className="auth-brand-copy" style={{ animation: 'fadeSlideUp 0.6s ease 0.1s both' }}>
                <p className="text-white/40 text-xs tracking-[0.2em] uppercase font-bold mb-4">
                  {language === 'fr' ? 'Plateforme de Gestion' : 'Property Platform'}
                </p>
                <h1 className="auth-brand-heading text-5xl xl:text-6xl font-black text-white leading-[1.05] mb-4 tracking-tight">
                  {language === 'fr' ? <>Gérez vos<br />Propriétés<br /><span className="text-white/50">en toute confiance</span></> : <>Manage<br />Properties<br /><span className="text-white/50">with Confidence</span></>}
                </h1>
                <p className="auth-brand-description border-l-2 border-red-600 pl-3 text-white/50 text-base italic leading-relaxed" style={{ maxWidth: 380 }}>
                  {language === 'fr'
                    ? "Une solution complète pour les propriétaires, gardiens et locataires, tout en un seul endroit."
                    : 'A complete solution for landlords, gatekeepers, and tenants, all in one place.'}
                </p>
              </div>
            </div>

            {/* Bottom: Stats cards */}
            <div className="auth-brand-stats relative z-10 p-10 xl:p-14 pt-0">
              <div className="grid grid-cols-3 gap-3 relative z-10">
                {stats.map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <div key={stat.label}
                      className="auth-brand-stat rounded-2xl p-4 relative overflow-hidden"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        animation: `fadeSlideUp 0.6s ease ${0.15 * i + 0.3}s both`,
                      }}>
                      <Icon className="auth-brand-stat-icon w-4 h-4 text-white/40 mb-3" strokeWidth={1.5} />
                      <p className="auth-brand-stat-value text-2xl font-black text-white tracking-tight">{stat.value}</p>
                      <p className="auth-brand-stat-label text-white/40 text-[11px] mt-0.5 font-medium">{stat.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ─── RIGHT PANEL: Authentication (45%) ─── */}
          <div
            className="auth-form-panel w-full max-w-[460px] lg:w-[42%] xl:w-[48%] xl:max-w-[700px] flex flex-col relative overflow-x-clip"
            style={{
              borderRadius: '32px',
              background: 'rgba(22,22,22,0.55)',
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 30px 100px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <div className="glass-reflection" />

            {/* Language selector (top-right) */}
            <div className="absolute top-5 right-5 z-20">
              <div className="relative">
                <button
                  onClick={() => setLangOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white/50 hover:text-white transition-all text-xs font-bold tracking-widest"
                  style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span className="uppercase">{language}</span>
                </button>
                {langOpen && (
                  <div className="absolute right-0 top-full mt-2 rounded-xl overflow-hidden z-50 min-w-[130px]"
                    style={{ background: '#0B0B0B', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
                    {(['en', 'fr'] as const).map(lang => (
                      <button
                        key={lang}
                        onClick={() => { setLanguage(lang); setLangOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium transition-colors ${
                          language === lang ? 'text-white' : 'text-white/40 hover:text-white hover:bg-white/[0.04]'
                        }`}
                        style={language === lang ? { background: 'rgba(255,255,255,0.06)' } : {}}
                      >
                        <span>{lang === 'en' ? '🇬🇧' : '🇫🇷'}</span>
                        {lang === 'en' ? 'English' : 'Français'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="auth-form-card relative z-10 flex-1 flex flex-col p-3 min-[400px]:p-5 sm:p-6 xl:p-10 pt-5 min-[400px]:pt-6 sm:pt-9 lg:pt-16">

              {/* Mobile logo */}
              <div className="flex items-center gap-3 mb-4 lg:hidden">
                <img src={appLogoUrl} alt={`${appName} logo`} className="h-10 w-10 object-contain" />
                <div>
                  <p className="text-white font-bold text-lg">{appName}</p>
                  <p className="text-white/40 text-[9px] tracking-[0.2em] uppercase font-semibold">{t('propertyPlatform')}</p>
                </div>
              </div>

              {/* Header */}
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-white/50" strokeWidth={1.5} />
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/50">
                  {mode === 'login' ? (language === 'fr' ? 'Accès Sécurisé' : 'Secure Access') : (language === 'fr' ? 'Nouveau Compte' : 'New Account')}
                </span>
              </div>
              <div>
                <h2 className="text-3xl font-normal text-white mb-1.5 tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {mode === 'login' ? t('welcomeBack') : t('createAccount')}
                </h2>
                <p className="text-white/40 text-sm mb-5 sm:mb-7">
                  {mode === 'login' ? t('signInSubtitle') : t('registerSubtitle')}
                </p>
              </div>

              {/* Segmented control */}
              <div className="flex rounded-xl p-1 mb-4 sm:mb-6 relative"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {(['login', 'register'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setError('');
                      setRegistrationMessage('');
                      setEmailInputEnabled(false);
                      setPasswordInputEnabled(false);
                      setConfirmPasswordInputEnabled(false);
                      setCaptchaToken(null);
                      setCaptchaResetKey(key => key + 1);
                    }}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors duration-100 ${
                      mode === m ? 'text-black' : 'text-white/40 hover:text-white/70'
                    }`}
                    style={mode === m ? {
                      background: '#ffffff',
                      boxShadow: '0 4px 16px rgba(255,255,255,0.08)',
                    } : {}}
                  >
                    {m === 'login' ? t('signIn') : t('register')}
                  </button>
                ))}
              </div>

              {/* Form */}
              <form
                onSubmit={handleSubmit}
                autoComplete="off"
                className="flex flex-col gap-3.5 max-[639px]:gap-3"
              >
                {mode === 'register' && (
                    <div>
                      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
                        <Input
                          label={language === 'fr' ? 'Prénom' : 'First name'}
                          labelClassName="text-white/90 font-semibold"
                          placeholder={language === 'fr' ? 'Votre prénom' : 'First name'}
                          value={form.firstName}
                          onChange={set('firstName')}
                          icon={<User className="w-4 h-4" />}
                          autoComplete="given-name"
                          maxLength={60}
                          required
                          style={authInputStyle}
                          wrapperClassName="input-glow rounded-xl transition-all"
                        />
                        <Input
                          label={language === 'fr' ? 'Nom' : 'Last name'}
                          labelClassName="text-white/90 font-semibold"
                          placeholder={language === 'fr' ? 'Votre nom' : 'Last name'}
                          value={form.lastName}
                          onChange={set('lastName')}
                          autoComplete="family-name"
                          maxLength={60}
                          required
                          style={authInputStyle}
                          wrapperClassName="input-glow rounded-xl transition-all"
                        />
                      </div>
                    </div>
                  )}
                <div>
                  <Input label={t('email')} labelClassName="text-white/90 font-semibold" type="email" placeholder={language === 'fr' ? 'Entrez votre e-mail' : 'Enter email'} value={form.email} onChange={set('email')} icon={<Mail className="w-4 h-4" />} autoComplete="off" readOnly={!emailInputEnabled} onFocus={() => { setEmailInputEnabled(true); setCaptchaVisible(true); }} required style={authInputStyle} wrapperClassName="input-glow rounded-xl transition-all" />
                </div>
                {mode === 'register' && (
                    <div>
                      <div className="space-y-1.5">
                        <label htmlFor="registration-phone" className="block text-sm font-semibold text-white/90">
                          {t('phone')}
                        </label>
                        <div className="flex min-w-0 items-center gap-2">
                          <div ref={callingCodePickerRef} className="relative w-[6.75rem] shrink-0">
                            <button
                              type="button"
                              aria-label={language === 'fr' ? 'Choisir un pays et son indicatif' : 'Choose country and calling code'}
                              aria-expanded={countryCodeOpen}
                              aria-haspopup="listbox"
                              onClick={() => {
                                if (countryCodeOpen) {
                                  setCountryCodeOpen(false);
                                } else {
                                  setCountryCodeSearch('');
                                  updateCountryMenuPosition();
                                  setCountryCodeOpen(true);
                                }
                              }}
                              className="flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 text-left text-sm font-semibold text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-green-600 sm:px-3"
                            >
                              {selectedPhoneCountry
                                ? <span aria-hidden="true" className={`fi fi-${selectedPhoneCountry.countryCode.toLowerCase()} shrink-0`} />
                                : <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />}
                              <span className="shrink-0 tabular-nums text-slate-700">{callingCode}</span>
                              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                            </button>
                            {countryCodeOpen && createPortal(
                              <div
                                ref={countryMenuRef}
                                style={{
                                  position: 'fixed',
                                  top: countryMenuPosition.top,
                                  left: countryMenuPosition.left,
                                  width: countryMenuPosition.width,
                                  maxHeight: countryMenuPosition.maxHeight,
                                  zIndex: 10000,
                                }}
                                className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#171717] text-white shadow-xl"
                              >
                                <div className="shrink-0 p-2">
                                  <input
                                    type="tel"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    value={countryCodeSearch}
                                    onChange={event => setCountryCodeSearch(event.target.value.replace(/[^\d+]/g, ''))}
                                    placeholder="+1"
                                    aria-label={language === 'fr' ? 'Rechercher par indicatif téléphonique' : 'Search by calling code'}
                                    className="h-9 w-full rounded-lg border border-white/10 bg-[#242424] px-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                                  />
                                </div>
                                <div role="listbox" aria-label={language === 'fr' ? 'Pays et indicatifs' : 'Countries and calling codes'} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
                                  {filteredPhoneCountryOptions.map(option => (
                                    <button
                                      key={`${option.countryCode}-${option.code}`}
                                      type="button"
                                      role="option"
                                      aria-selected={selectedCountryCode === option.countryCode}
                                      onClick={() => {
                                        setCallingCode(`+${option.code}`);
                                        setSelectedCountryCode(option.countryCode);
                                        setCountryCodeOpen(false);
                                        setCountryCodeSearch('');
                                      }}
                                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                                    >
                                      <span className="flex w-6 shrink-0 justify-center" aria-hidden="true">
                                        <span className={`fi fi-${option.countryCode.toLowerCase()}`} />
                                      </span>
                                      <span className="min-w-0 flex-1 truncate">{option.name}</span>
                                      <span className="font-medium tabular-nums text-white/55">+{option.code}</span>
                                    </button>
                                  ))}
                                  {filteredPhoneCountryOptions.length === 0 && (
                                    <p className="px-3 py-4 text-center text-sm text-white/55">
                                      {language === 'fr' ? 'Aucun indicatif correspondant.' : 'No matching calling code.'}
                                    </p>
                                  )}
                                </div>
                              </div>,
                              document.body,
                            )}
                          </div>
                          <div className={`flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-white px-2.5 focus-within:ring-2 sm:gap-3 sm:px-3 ${
                            phoneInvalid
                              ? 'border-red-500 focus-within:border-red-600 focus-within:ring-red-600/20'
                              : 'border-slate-300 focus-within:border-green-600 focus-within:ring-green-600/20'
                          }`}>
                            <label htmlFor="registration-phone" className="sr-only">
                              {language === 'fr' ? 'Numéro de téléphone' : 'Phone number'}
                            </label>
                            <Phone className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                            <input
                              id="registration-phone"
                              type="tel"
                              inputMode="tel"
                              autoComplete="tel-national"
                              placeholder={phoneNumberPlaceholder}
                              value={form.phone}
                              onChange={event => {
                                setForm(current => ({ ...current, phone: event.target.value }));
                                if (event.target.value) setPhoneTouched(true);
                              }}
                              onBlur={() => setPhoneTouched(true)}
                              maxLength={24}
                              aria-invalid={phoneInvalid}
                              aria-describedby={phoneInvalid ? 'registration-phone-error' : undefined}
                              required
                              className={`h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none ${phoneInvalid ? 'text-red-700' : ''}`}
                            />
                          </div>
                        </div>
                        {phoneInvalid && (
                          <p id="registration-phone-error" role="alert" className="text-xs font-medium text-red-400">
                            {language === 'fr'
                              ? 'Entrez un numéro complet et valide pour le pays sélectionné.'
                              : 'Enter a complete, valid number for the selected country.'}
                          </p>
                        )}
                        <p className="text-xs text-white/70">
                          {language === 'fr'
                            ? 'Sélectionnez votre pays pour ajouter automatiquement son indicatif.'
                            : 'Select your country to add its calling code automatically.'}
                        </p>
                      </div>
                    </div>
                  )}
                <div className="relative">
                  <Input label={t('password')} labelClassName="text-white/90 font-semibold" type={showPass ? 'text' : 'password'} placeholder={language === 'fr' ? 'Votre mot de passe' : 'Enter your password'} value={form.password} onChange={set('password')} icon={<Lock className="w-4 h-4" />} autoComplete="off" readOnly={!passwordInputEnabled} onFocus={() => { setPasswordInputEnabled(true); setCaptchaVisible(true); }} minLength={mode === 'register' ? 8 : undefined} required className="pr-12" style={authInputStyle} wrapperClassName="input-glow rounded-xl transition-all" />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    aria-label={showPass
                      ? language === 'fr' ? 'Masquer le mot de passe' : 'Hide password'
                      : language === 'fr' ? 'Afficher le mot de passe' : 'Show password'}
                    aria-pressed={showPass}
                    className="absolute right-1 bottom-0.5 z-10 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-slate-800 shadow-sm transition-colors hover:bg-slate-200 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700"
                  >
                    {showPass ? <EyeOff className="h-5 w-5" strokeWidth={2.5} /> : <Eye className="h-5 w-5" strokeWidth={2.5} />}
                  </button>
                </div>
                {mode === 'register' && (
                    <div className="relative">
                    <Input label={t('confirmPassword')} labelClassName="text-white/90 font-semibold" type={showPass ? 'text' : 'password'} placeholder={language === 'fr' ? 'Confirmez votre mot de passe' : 'Confirm your password'} value={form.confirmPassword} onChange={set('confirmPassword')} icon={<Lock className="w-4 h-4" />} autoComplete="off" readOnly={!confirmPasswordInputEnabled} onFocus={() => setConfirmPasswordInputEnabled(true)} required className="pr-12" style={authInputStyle} wrapperClassName="input-glow rounded-xl transition-all" />
                    <button
                      type="button"
                      onClick={() => setShowPass(s => !s)}
                      aria-label={showPass
                        ? language === 'fr' ? 'Masquer le mot de passe' : 'Hide password'
                        : language === 'fr' ? 'Afficher le mot de passe' : 'Show password'}
                      aria-pressed={showPass}
                      className="absolute right-1 bottom-0.5 z-10 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-slate-800 shadow-sm transition-colors hover:bg-slate-200 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700"
                    >
                      {showPass ? <EyeOff className="h-5 w-5" strokeWidth={2.5} /> : <Eye className="h-5 w-5" strokeWidth={2.5} />}
                    </button>
                    </div>
                  )}

                {error && (
                  <div className="mt-1 text-sm text-red-400" role="alert">
                    {error}
                  </div>
                )}
                {registrationMessage && (
                  <div className="rounded-xl px-4 py-3 text-sm text-emerald-200"
                    style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}
                    role="status"
                  >
                    {registrationMessage}
                  </div>
                )}

                {/* Remember me + Forgot password */}
                {mode === 'login' && (
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={e => setRemember(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-4 h-4 rounded-[5px] border border-white/20 transition-all peer-checked:bg-white peer-checked:border-white flex items-center justify-center">
                          {remember && (
                            <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors">
                        {language === 'fr' ? 'Se souvenir de moi' : 'Remember me'}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setForgotPasswordOpen(true);
                      }}
                      className="text-xs text-white/40 hover:text-red-500 active:text-red-500 focus-visible:text-red-500 transition-colors font-medium"
                    >
                      {language === 'fr' ? 'Mot de passe oublié ?' : 'Forgot password?'}
                    </button>
                  </div>
                )}

                {captchaSiteKey && captchaVisible ? (
                  <TurnstileCaptcha
                    key={captchaResetKey}
                    siteKey={captchaSiteKey}
                    language={language}
                    resetKey={captchaResetKey}
                    onToken={setCaptchaToken}
                    onError={() => setCaptchaToken(null)}
                  />
                ) : import.meta.env.PROD ? (
                  <p className="text-xs text-amber-200" role="alert">
                    {language === 'fr'
                      ? 'La protection anti-robot doit être configurée avant la mise en production.'
                      : 'Bot protection must be configured before production deployment.'}
                  </p>
                ) : null}

                <p className="text-xs text-white/30">
                  {mode === 'login' ? t('adminNote') : t('registerNote')}
                </p>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="liquid-btn mx-auto mt-1 block w-3/4 max-w-sm py-3.5 rounded-md text-sm font-bold tracking-wide text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#16a34a', boxShadow: '0 6px 20px rgba(22,163,74,0.24)' }}
                >
                  {loading
                    ? <span className="flex items-center justify-center gap-2">
                        <span className="flex items-center gap-1" aria-hidden="true">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" />
                        </span>
                        {language === 'fr' ? 'Chargement...' : 'Loading...'}
                      </span>
                    : (mode === 'login' ? t('signIn') : t('createAccount'))
                  }
                </button>
              </form>

              {/* Footer */}
              <div className="mt-auto pt-6">
                <p className="text-center text-white/25 text-[11px]">
                  &copy; {new Date().getFullYear()} {appName} &mdash; {language === 'fr' ? 'Tous droits réservés' : 'All rights reserved'}
                </p>
              </div>
            </div>
          </div>
          <a
            href="https://devburundi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 left-1/2 z-20 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 text-center text-[11px] text-white/40 transition-colors hover:text-red-500 active:text-red-500 focus-visible:text-red-500 lg:left-[27.5%]"
          >
            Powered by Devburundi Digital and Marketing Agency
          </a>
        </div>
      </div>
    </>
  );
}
