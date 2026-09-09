import { useEffect, useRef, useState } from 'react';

type DogPhase = 'hidden' | 'running' | 'sniffing' | 'leaving';

// Parametros del "rastro": pasos cortos/medianos (no saltos de punta a punta
// del mapa) para que el recorrido se vea como un rastro y no un teleport.
const MIN_STEP_PERCENT = 18;
const MAX_STEP_PERCENT = 45;
const RUN_SPEED_PERCENT_PER_SEC = 55;
const SNIFF_CHANCE = 0.55;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function nextCoord(current: number, min: number, max: number) {
  const step = MIN_STEP_PERCENT + Math.random() * (MAX_STEP_PERCENT - MIN_STEP_PERCENT);
  const direction = Math.random() < 0.5 ? -1 : 1;
  return clamp(current + step * direction, min, max);
}

/**
 * Perrito que recorre el mapa como siguiendo un rastro mientras `active` es
 * true: corre de punto en punto y cada tanto se detiene a olfatear. Al
 * terminar la carga (active pasa a false) sale corriendo fuera del cuadro.
 * Se usa como overlay sobre un contenedor con `position: relative`.
 */
export function DogLoadingOverlay({ active }: { active: boolean }) {
  const [phase, setPhase] = useState<DogPhase>('hidden');
  const [pos, setPos] = useState({ x: 15, y: 50 });
  const [facingLeft, setFacingLeft] = useState(false);
  const [durationMs, setDurationMs] = useState(900);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const posRef = useRef(pos);
  const wasActiveRef = useRef(false);

  posRef.current = pos;

  useEffect(() => {
    if (!active) {
      if (wasActiveRef.current) {
        wasActiveRef.current = false;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setDurationMs(600);
        setFacingLeft(false);
        setPhase('leaving');
        setPos({ x: 130, y: posRef.current.y });
        timeoutRef.current = setTimeout(() => setPhase('hidden'), 650);
      }
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }

    wasActiveRef.current = true;
    setPhase('running');
    setPos({ x: 10 + Math.random() * 15, y: 25 + Math.random() * 50 });

    const runToNextSpot = () => {
      const current = posRef.current;
      const next = { x: nextCoord(current.x, 6, 94), y: nextCoord(current.y, 12, 88) };
      const distance = Math.hypot(next.x - current.x, next.y - current.y);
      const duration = clamp((distance / RUN_SPEED_PERCENT_PER_SEC) * 1000, 500, 1400);

      setFacingLeft(next.x < current.x);
      setDurationMs(duration);
      setPhase('running');
      setPos(next);

      timeoutRef.current = setTimeout(() => {
        if (Math.random() < SNIFF_CHANCE) {
          setPhase('sniffing');
          timeoutRef.current = setTimeout(runToNextSpot, 900 + Math.random() * 700);
        } else {
          runToNextSpot();
        }
      }, duration);
    };

    timeoutRef.current = setTimeout(runToNextSpot, 300);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (phase === 'hidden') return null;

  // El cartel acompaña al perrito mientras busca (running/sniffing) y se
  // retira apenas termina la carga y sale corriendo (leaving).
  const showBanner = phase === 'running' || phase === 'sniffing';

  return (
    <div className="pointer-events-none absolute inset-0 z-[1000] overflow-hidden">
      <div
        className="absolute text-2xl"
        style={{
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          transform: `translate(-50%, -50%) scaleX(${facingLeft ? -1 : 1})`,
          transition: `left ${durationMs}ms linear, top ${durationMs}ms linear`,
        }}
      >
        <span className={phase === 'sniffing' ? 'inline-block animate-dog-sniff' : 'inline-block animate-dog-run'}>🐶</span>
      </div>
      <div
        className={`absolute inset-x-0 bottom-2 flex justify-center px-2 transition-opacity duration-300 ${
          showBanner ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="animate-dog-banner-pulse rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 px-4 py-1.5 text-center text-xs font-extrabold uppercase tracking-wide text-white ring-2 ring-white/80">
          🐾 El rastreador está buscando lugares...
        </span>
      </div>
    </div>
  );
}
