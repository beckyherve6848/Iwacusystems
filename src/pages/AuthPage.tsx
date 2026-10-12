import React, { useState, useRef } from 'react';
import { Mail, Lock, Eye, EyeOff, User, Phone, Globe, ShieldCheck, Home, Users, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import Input from '@/components/ui/Input';
import TurnstileCaptcha from '@/components/auth/TurnstileCaptcha';

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
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [bgFailed, setBgFailed] = useState(false);
  const [familyImageFailed, setFamilyImageFailed] = useState(false);
  const [remember, setRemember] = useState(false);
  const [emailInputEnabled, setEmailInputEnabled] = useState(false);
  const [passwordInputEnabled, setPasswordInputEnabled] = useState(false);
  const [confirmPasswordInputEnabled, setConfirmPasswordInputEnabled] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const formRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', password: '', confirmPassword: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRegistrationMessage('');
    if (
      !form.email.trim() ||
      !form.password ||
      (mode === 'register' && (!form.fullName.trim() || !form.phone.trim() || !form.confirmPassword))
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
      setError(language === 'fr'
        ? 'Veuillez terminer le contrôle de sécurité.'
        : 'Please complete the security check.');
      return;
    }
    setLoading(true);
    if (mode === 'login') {
      const { error } = await signIn(form.email, form.password, captchaToken ?? undefined);
      if (error) {
        const unavailableMessage = 'Your account is unavailable. Please contact the administrator.';
        setError(error.message === unavailableMessage
          ? language === 'fr'
            ? 'Votre compte est indisponible. Veuillez contacter l’administrateur.'
            : unavailableMessage
          : error.message === 'Invalid login credentials'
            ? language === 'fr'
              ? 'Email ou mot de passe invalide.'
              : 'Invalid email or password.'
            : error.message);
      }
      else onSuccess();
    } else {
      if (form.password !== form.confirmPassword) {
        setError(language === 'fr' ? 'Les mots de passe ne correspondent pas.' : 'Passwords do not match.');
        setLoading(false); return;
      }
      if (form.password.length < 8) {
        setError(language === 'fr' ? 'Le mot de passe doit comporter au moins 8 caractères.' : 'Password must be at least 8 characters.');
        setLoading(false); return;
      }
      const { error } = await signUp(form.email, form.password, form.fullName, form.phone, captchaToken ?? undefined);
      if (error) setError(error.message || (language === 'fr' ? "Échec de l'inscription." : 'Registration failed.'));
      else {
        setMode('login');
        setError('');
        setRegistrationMessage(language === 'fr'
          ? "Inscription réussie. Veuillez attendre la configuration de votre profil."
          : 'Registration successful. Please wait for your profile to be set up.');
        setForm(f => ({ ...f, password: '', confirmPassword: '' }));
      }
    }
    setCaptchaToken(null);
    setCaptchaResetKey(key => key + 1);
    setLoading(false);
  };

  const stats = [
    { icon: Home, label: language === 'fr' ? 'Maisons gérées' : 'Houses Managed', value: '100+' },
    { icon: Users, label: language === 'fr' ? 'Locataires actifs' : 'Active Tenants', value: '500+' },
    { icon: TrendingUp, label: language === 'fr' ? 'Paiements suivis' : 'Payments Tracked', value: '10K+' },
  ];

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
        .auth-brand-copy { position: relative; top: 16px; }
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
            min-height: min(560px, calc(100dvh - 32px));
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
          top: -50%; left: -50%;
          width: 60%; height: 200%;
          background: linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.03) 50%, transparent 60%);
          pointer-events: none;
        }
      `}</style>

      {/* Full-screen background */}
      <div className="min-h-screen relative overflow-x-clip lg:overflow-hidden" style={{ background: '#000000' }}>
        {loginBackgroundUrl && !bgFailed && (
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
        <div className="auth-layout relative z-10 min-h-screen flex flex-col lg:flex-row items-center justify-center gap-6 p-6 lg:p-10">

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
            <img
              src={loginFamilyImageUrl && !familyImageFailed ? loginFamilyImageUrl : '/Bck.png'}
              alt="Happy family under a home roof"
              className="absolute inset-0 w-full h-full object-contain object-bottom opacity-70"
              onError={() => setFamilyImageFailed(true)}
            />
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
                <p className="auth-brand-description text-white/50 text-base leading-relaxed" style={{ maxWidth: 380 }}>
                  {language === 'fr'
                    ? "Une solution complète pour les propriétaires, gardiens et locataires — tout en un seul endroit."
                    : 'A complete solution for landlords, gatekeepers, and tenants — all in one place.'}
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
              minHeight: 'min(560px, calc(100vh - 32px))',
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

            <div ref={formRef} className="auth-form-card relative z-10 flex-1 flex flex-col p-8 xl:p-10 pt-16">

              {/* Mobile logo */}
              <div className="flex items-center gap-3 mb-8 lg:hidden">
                <img src={appLogoUrl} alt={`${appName} logo`} className="h-10 w-10 object-contain" />
                <div>
                  <p className="text-white font-bold text-lg">{appName}</p>
                  <p className="text-white/40 text-[9px] tracking-[0.2em] uppercase font-semibold">{t('propertyPlatform')}</p>
                </div>
              </div>

              {/* Header */}
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-4 h-4 text-white/50" strokeWidth={1.5} />
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/50">
                  {mode === 'login' ? (language === 'fr' ? 'Accès Sécurisé' : 'Secure Access') : (language === 'fr' ? 'Nouveau Compte' : 'New Account')}
                </span>
              </div>
              <h2 className="text-3xl font-black text-white mb-1.5 tracking-tight">
                {mode === 'login' ? t('welcomeBack') : t('createAccount')}
              </h2>
              <p className="text-white/40 text-sm mb-7">
                {mode === 'login' ? t('signInSubtitle') : t('registerSubtitle')}
              </p>

              {/* Segmented control */}
              <div className="flex rounded-xl p-1 mb-6 relative"
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
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${
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
              <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-3.5">
                {mode === 'register' && (
                  <div className="input-glow rounded-xl transition-all">
                    <Input label={t('fullName')} placeholder={language === 'fr' ? 'Votre nom complet' : 'Enter your full name'} value={form.fullName} onChange={set('fullName')} icon={<User className="w-4 h-4" />} autoComplete="off" maxLength={120} required />
                  </div>
                )}
                <div className="input-glow rounded-xl transition-all">
                  <Input label={t('email')} type="email" placeholder={language === 'fr' ? 'Entrez votre e-mail' : 'Enter email'} value={form.email} onChange={set('email')} icon={<Mail className="w-4 h-4" />} autoComplete="off" readOnly={!emailInputEnabled} onFocus={() => setEmailInputEnabled(true)} required />
                </div>
                {mode === 'register' && (
                  <div className="input-glow rounded-xl transition-all">
                    <Input label={t('phone')} type="tel" placeholder="+257 68 000 000" value={form.phone} onChange={set('phone')} icon={<Phone className="w-4 h-4" />} autoComplete="tel" maxLength={40} required />
                  </div>
                )}
                <div className="relative input-glow rounded-xl transition-all">
                  <Input label={t('password')} type={showPass ? 'text' : 'password'} placeholder={language === 'fr' ? 'Votre mot de passe' : 'Enter your password'} value={form.password} onChange={set('password')} icon={<Lock className="w-4 h-4" />} autoComplete="off" readOnly={!passwordInputEnabled} onFocus={() => setPasswordInputEnabled(true)} minLength={mode === 'register' ? 8 : undefined} required />
                  <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-3 bottom-3 text-white/40 hover:text-white/80 transition-colors z-10">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === 'register' && (
                  <div className="relative input-glow rounded-xl transition-all">
                    <Input label={t('confirmPassword')} type={showPass ? 'text' : 'password'} placeholder={language === 'fr' ? 'Confirmez votre mot de passe' : 'Confirm your password'} value={form.confirmPassword} onChange={set('confirmPassword')} icon={<Lock className="w-4 h-4" />} autoComplete="off" readOnly={!confirmPasswordInputEnabled} onFocus={() => setConfirmPasswordInputEnabled(true)} required />
                    <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-3 bottom-3 text-white/40 hover:text-white/80 transition-colors z-10">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                )}

                {error && (
                  <div className="rounded-xl px-4 py-3 text-sm text-white/70"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
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
                    <button type="button" className="text-xs text-white/40 hover:text-white/70 transition-colors font-medium">
                      {language === 'fr' ? 'Mot de passe oublié ?' : 'Forgot password?'}
                    </button>
                  </div>
                )}

                {captchaSiteKey ? (
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
                  disabled={loading || (captchaRequired && !captchaToken)}
                  className="liquid-btn w-full mt-1 py-3.5 rounded-xl text-sm font-bold tracking-wide text-black disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#ffffff', boxShadow: '0 6px 20px rgba(255,255,255,0.06)' }}
                >
                  {loading
                    ? <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
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
            className="absolute bottom-3 left-6 lg:left-10 z-20 text-[11px] text-white/40 transition-colors hover:text-white/80"
          >
            Powered by Devburundi Digital and Marketing Agency
          </a>
        </div>
      </div>
    </>
  );
}
