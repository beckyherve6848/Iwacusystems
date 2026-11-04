import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { ADMIN_OVERVIEW_QUOTE_COLORS } from '@/lib/adminOverviewQuotes';

export interface RoleOverviewItem {
  label: string;
  value: string;
  page: string;
  color: string;
}

interface RoleDashboardOverviewProps {
  items: RoleOverviewItem[];
  onNavigate: (page: string) => void;
  title: string;
  centerLabel: string;
  centerSubLabel: string;
  language: string;
}

function ringSectorPath(index: number, count: number, outerRadius: number, innerRadius: number) {
  const startAngle = (index * 360) / count - 90 - 180 / count;
  const endAngle = startAngle + 360 / count;
  const point = (radius: number, angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return { x: 200 + radius * Math.cos(radians), y: 200 + radius * Math.sin(radians) };
  };
  const outerStart = point(outerRadius, startAngle);
  const outerEnd = point(outerRadius, endAngle);
  const innerEnd = point(innerRadius, endAngle);
  const innerStart = point(innerRadius, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

export default function RoleDashboardOverview({
  items,
  onNavigate,
  title,
  centerLabel,
  centerSubLabel,
  language,
}: RoleDashboardOverviewProps) {
  const { loginFamilyImageUrl, adminOverviewPhotoUrls, adminOverviewPhotoQuotes } = useTheme();
  const ringRef = useRef<SVGGElement | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselTransitionEnabled, setCarouselTransitionEnabled] = useState(true);
  const rotationRef = useRef(0);
  const lastPointerAngleRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const draggedRef = useRef(false);
  const lastCenterTapRef = useRef(0);
  const spinAnimationRef = useRef<Animation | null>(null);
  const defaultPhoto = loginFamilyImageUrl || '/Bck.png';
  const carouselPhotos = adminOverviewPhotoUrls.length > 0
    ? adminOverviewPhotoUrls
    : Array.from({ length: 5 }, () => defaultPhoto);
  const carouselTrackPhotos = [
    carouselPhotos[carouselPhotos.length - 1],
    ...carouselPhotos,
    carouselPhotos[0],
  ];
  const activeCarouselIndex = ((carouselIndex % carouselPhotos.length) + carouselPhotos.length) % carouselPhotos.length;
  const activeQuote = adminOverviewPhotoQuotes[activeCarouselIndex];
  const quoteColor = ADMIN_OVERVIEW_QUOTE_COLORS.find(color => color.value === activeQuote?.color)?.hex ?? '#008000';

  useEffect(() => {
    if (carouselPhotos.length < 2) return;
    const timer = window.setInterval(() => setCarouselIndex(index => index + 1), 2000);
    return () => window.clearInterval(timer);
  }, [carouselPhotos.length]);

  useEffect(() => {
    setCarouselIndex(0);
    setCarouselTransitionEnabled(false);
    const frame = window.requestAnimationFrame(() => setCarouselTransitionEnabled(true));
    return () => window.cancelAnimationFrame(frame);
  }, [carouselPhotos.length]);

  const handleCarouselTransitionEnd = () => {
    if (carouselIndex >= carouselPhotos.length) {
      setCarouselTransitionEnabled(false);
      setCarouselIndex(0);
      window.requestAnimationFrame(() => setCarouselTransitionEnabled(true));
    } else if (carouselIndex < 0) {
      setCarouselTransitionEnabled(false);
      setCarouselIndex(carouselPhotos.length - 1);
      window.requestAnimationFrame(() => setCarouselTransitionEnabled(true));
    }
  };

  const showPhoto = (index: number) => {
    setCarouselTransitionEnabled(false);
    setCarouselIndex(index);
    window.requestAnimationFrame(() => setCarouselTransitionEnabled(true));
  };

  const spinRingOnce = () => {
    if (!ringRef.current || spinAnimationRef.current) return;
    const startRotation = rotationRef.current;
    const endRotation = startRotation + 360;
    const ring = ringRef.current;
    ring.style.transformBox = 'view-box';
    ring.style.transformOrigin = '50% 50%';
    ring.style.transform = `rotate(${startRotation}deg)`;
    const animation = ring.animate(
      [{ transform: `rotate(${startRotation}deg)` }, { transform: `rotate(${endRotation}deg)` }],
      { duration: 900, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
    spinAnimationRef.current = animation;
    animation.onfinish = () => {
      rotationRef.current = endRotation;
      ring.style.transform = `rotate(${endRotation}deg)`;
      spinAnimationRef.current = null;
    };
    animation.oncancel = () => { spinAnimationRef.current = null; };
  };

  const getPointerAngle = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.atan2(
      event.clientY - bounds.top - bounds.height / 2,
      event.clientX - bounds.left - bounds.width / 2,
    ) * (180 / Math.PI);
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    if (event.pointerType === 'touch') {
      if (event.target instanceof Element && event.target.closest('[data-spin-center]')) {
        event.stopPropagation();
        const now = performance.now();
        if (now - lastCenterTapRef.current <= 350) {
          lastCenterTapRef.current = 0;
          spinRingOnce();
        } else {
          lastCenterTapRef.current = now;
        }
      }
      return;
    }
    if (event.target instanceof Element && event.target.closest('[data-spin-center]')) {
      event.preventDefault();
      event.stopPropagation();
      const now = performance.now();
      if (now - lastCenterTapRef.current <= 350) {
        lastCenterTapRef.current = 0;
        spinRingOnce();
      } else {
        lastCenterTapRef.current = now;
      }
      return;
    }
    event.preventDefault();
    draggedRef.current = false;
    draggingRef.current = true;
    lastPointerAngleRef.current = getPointerAngle(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current || lastPointerAngleRef.current === null || spinAnimationRef.current) return;
    const angle = getPointerAngle(event);
    let delta = angle - lastPointerAngleRef.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    if (Math.abs(delta) > 1) draggedRef.current = true;
    rotationRef.current += delta;
    lastPointerAngleRef.current = angle;
    if (ringRef.current) ringRef.current.style.transform = `rotate(${rotationRef.current}deg)`;
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    lastPointerAngleRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section className="phone-overview-card relative isolate overflow-hidden rounded-none border border-green-500 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <img src={loginFamilyImageUrl || '/Bck.png'} alt="" className="phone-overview-background h-full w-full object-cover object-center" />
        <div className="phone-overview-gradient absolute inset-0" />
      </div>
      <div className="phone-overview-copy relative z-10 mb-4">
        <h2 className="phone-overview-heading text-base font-semibold text-white">{title}</h2>
        <p className="phone-overview-description mt-1 text-xs text-slate-100">
          {language === 'fr' ? 'Sélectionnez une section pour ouvrir sa page.' : 'Select a section to open its page.'}
        </p>
      </div>
      <div className="phone-overview-layout relative z-10">
        <aside className="phone-overview-quotes hidden lg:flex" aria-label={language === 'fr' ? 'Citations sur le logement' : 'Property management quotes'}>
          <p className="phone-overview-side-title">{language === 'fr' ? 'Le logement, avec soin' : 'Better homes, better living'}</p>
          {(language === 'fr'
            ? [
              '« Un logement accueillant commence par une gestion attentive. »',
              '« Prendre soin des lieux, c’est prendre soin des personnes. »',
              '« Chaque maison mérite attention, confiance et respect. »',
            ]
            : [
              '“A welcoming home begins with thoughtful management.”',
              '“Caring for a place means caring for the people in it.”',
              '“Every home deserves attention, trust, and respect.”',
            ]).map(quote => (
            <blockquote key={quote} className="phone-overview-quote">{quote}</blockquote>
          ))}
        </aside>
        <div className="mx-auto w-full max-w-[320px]">
          <svg
            viewBox="0 0 400 400"
            role="group"
            aria-label={title}
            className="h-auto w-full cursor-grab overflow-visible active:cursor-grabbing"
            style={{ touchAction: 'pan-y' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <g ref={ringRef} className="phone-overview-ring">
              {items.map((item, index) => {
                const middleAngle = (index * 360) / items.length - 90;
                const radians = (middleAngle * Math.PI) / 180;
                const x = 200 + 122 * Math.cos(radians);
                const y = 200 + 122 * Math.sin(radians);
                return (
                  <g
                    key={item.page}
                    role="button"
                    tabIndex={0}
                    aria-label={`${item.label}: ${item.value}`}
                    className="cursor-pointer outline-none"
                    onClick={event => {
                      if (draggedRef.current) {
                        draggedRef.current = false;
                        event.preventDefault();
                        return;
                      }
                      onNavigate(item.page);
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onNavigate(item.page);
                      }
                    }}
                  >
                    <path
                      d={ringSectorPath(index, items.length, 168, 78)}
                      fill={item.color}
                      stroke="white"
                      strokeWidth="3"
                      className="phone-overview-segment transition-[filter,transform,opacity] duration-200 hover:opacity-90 focus:opacity-90"
                    />
                    <text x={x} y={y - 3} textAnchor="middle" className="pointer-events-none fill-white text-[9px] font-semibold">
                      <tspan x={x}>{item.label}</tspan>
                      <tspan x={x} dy="12" className="text-[8px] font-medium opacity-85">{item.value}</tspan>
                    </text>
                  </g>
                );
              })}
            </g>
            <g
              data-spin-center
              role="button"
              tabIndex={0}
              aria-label={language === 'fr' ? 'Appuyez deux fois ou appuyez sur Entrée pour faire tourner la roue' : 'Double-tap or press Enter to spin the wheel once'}
              className="cursor-pointer"
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  spinRingOnce();
                }
              }}
            >
              <circle cx="200" cy="200" r="74" fill="#111827" />
              <text x="200" y="195" textAnchor="middle" className="pointer-events-none fill-white text-xs font-bold">{centerLabel}</text>
              <text x="200" y="216" textAnchor="middle" className="pointer-events-none fill-slate-300 text-xs">{centerSubLabel}</text>
            </g>
          </svg>
        </div>
        <aside className="phone-overview-carousel" aria-label={language === 'fr' ? 'Photos de la propriété' : 'Property photo carousel'}>
          <div className="phone-overview-carousel-heading">
            <h3>{language === 'fr' ? 'Nos espaces' : 'Our spaces'}</h3>
            <p>{language === 'fr' ? 'Des lieux où il fait bon vivre' : 'Places made for living well'}</p>
          </div>
          <div className="phone-overview-photo-frame">
            <div
              className={`phone-overview-photo-track ${carouselTransitionEnabled ? 'is-animated' : ''}`}
              style={{
                width: `${carouselTrackPhotos.length * 100}%`,
                transform: `translateX(-${(carouselIndex + 1) * (100 / carouselTrackPhotos.length)}%)`,
              }}
              onTransitionEnd={handleCarouselTransitionEnd}
            >
              {carouselTrackPhotos.map((photo, index) => (
                <div key={`${photo}-${index}`} className="phone-overview-photo-slide" style={{ width: `${100 / carouselTrackPhotos.length}%` }}>
                  <img
                    src={photo}
                    alt={language === 'fr' ? 'Photo de la propriété' : 'Property'}
                    draggable={false}
                    onContextMenu={event => event.preventDefault()}
                  />
                </div>
              ))}
            </div>
            {carouselPhotos.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label={language === 'fr' ? 'Photo précédente' : 'Previous photo'}
                  onClick={() => setCarouselIndex(index => index - 1)}
                  className="phone-overview-carousel-arrow left-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={language === 'fr' ? 'Photo suivante' : 'Next photo'}
                  onClick={() => setCarouselIndex(index => index + 1)}
                  className="phone-overview-carousel-arrow right-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {activeQuote?.text.trim() && (
            <p className="phone-overview-photo-quote" style={{ color: quoteColor }} aria-live="polite">“{activeQuote.text}”</p>
          )}
          {carouselPhotos.length > 1 && (
            <div className="phone-overview-carousel-dots" aria-label={`${carouselPhotos.length} photos`}>
              {carouselPhotos.map((photo, index) => (
                <button
                  key={`${photo}-${index}`}
                  type="button"
                  aria-label={`${language === 'fr' ? 'Afficher la photo' : 'Show photo'} ${index + 1}`}
                  aria-current={index === activeCarouselIndex}
                  onClick={() => showPhoto(index)}
                  className={`phone-overview-carousel-dot ${index === activeCarouselIndex ? 'is-active' : ''}`}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
