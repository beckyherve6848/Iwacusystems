import React, { useEffect, useState } from 'react';
import { Building2, CalendarDays, Clock3 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface DashboardWelcomeHeroProps {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}

export default function DashboardWelcomeHero({ title, subtitle, action }: DashboardWelcomeHeroProps) {
  const { appName, language, loginFamilyImageUrl } = useTheme();
  const [imageSrc, setImageSrc] = useState(loginFamilyImageUrl || '/Bck.png');
  const [imageVisible, setImageVisible] = useState(true);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setImageSrc(loginFamilyImageUrl || '/Bck.png');
    setImageVisible(true);
  }, [loginFamilyImageUrl]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const locale = language === 'fr' ? 'fr-BI' : 'en-US';
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  return (
    <section className="relative isolate min-h-[190px] overflow-hidden rounded-3xl bg-slate-950 shadow-[0_12px_32px_rgba(15,23,42,0.14)] sm:min-h-[220px]">
      {imageVisible && (
        <img
          src={imageSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-20 h-full w-full object-cover object-[center_38%]"
          onError={() => {
            if (imageSrc !== '/Bck.png') setImageSrc('/Bck.png');
            else setImageVisible(false);
          }}
        />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/85 via-slate-950/60 to-slate-950/20" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950/25 via-transparent to-slate-950/5" />
      <div className="flex min-h-[190px] flex-col justify-between gap-6 p-5 sm:min-h-[220px] sm:flex-row sm:items-end sm:p-8">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-sm">
            <Building2 className="h-3.5 w-3.5" strokeWidth={1.8} />
            <span>{appName}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/75 sm:text-base">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {action}
          <div className="inline-flex w-fit flex-col gap-1.5 rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-xs font-medium text-white/90 shadow-lg backdrop-blur-md sm:mb-1">
            <div className="inline-flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-white/70" strokeWidth={1.7} />
              <span className="capitalize">{date}</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 shrink-0 text-white/70" strokeWidth={1.7} />
              <time className="font-mono tabular-nums" aria-label={language === 'fr' ? `Heure actuelle : ${time}` : `Current time: ${time}`}>
                {time}
              </time>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
