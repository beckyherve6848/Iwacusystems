import { useEffect, useRef, useState } from 'react';

interface TurnstileOptions {
  sitekey: string;
  language?: string;
  theme?: 'auto' | 'light' | 'dark';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileOptions) => string;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileCaptchaProps {
  siteKey: string;
  language: 'en' | 'fr';
  resetKey: number;
  onToken: (token: string | null) => void;
  onError: () => void;
}

export default function TurnstileCaptcha({
  siteKey,
  language,
  resetKey,
  onToken,
  onError,
}: TurnstileCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  const [loadError, setLoadError] = useState(false);

  onTokenRef.current = onToken;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | null = null;
    let script = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');

    const fail = () => {
      if (cancelled) return;
      setLoadError(true);
      onErrorRef.current();
    };

    const render = () => {
      if (cancelled || !window.turnstile || !containerRef.current || widgetId) return;
      try {
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          language,
          theme: 'auto',
          callback: token => {
            setLoadError(false);
            onTokenRef.current(token);
          },
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': fail,
        });
      } catch {
        fail();
      }
    };

    if (window.turnstile) {
      render();
    } else {
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.turnstileScript = 'true';
        script.addEventListener('load', render);
        script.addEventListener('error', fail);
        document.head.appendChild(script);
      } else {
        script.addEventListener('load', render);
        script.addEventListener('error', fail);
      }
    }

    return () => {
      cancelled = true;
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', fail);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      onTokenRef.current(null);
    };
  }, [language, resetKey, siteKey]);

  return (
    <div className="min-h-[65px]">
      <div ref={containerRef} />
      {loadError && (
        <p className="mt-1 text-xs text-red-200" role="alert">
          {language === 'fr'
            ? 'Le contrôle de sécurité est indisponible. Vérifiez votre connexion et réessayez.'
            : 'The security check is unavailable. Check your connection and try again.'}
        </p>
      )}
    </div>
  );
}
