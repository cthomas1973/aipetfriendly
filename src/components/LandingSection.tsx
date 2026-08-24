import {
  BadgeCheck,
  CalendarDays,
  Gift,
  MapPinned,
  MessageCircle,
  PawPrint,
  ShieldCheck,
} from 'lucide-react';
import { PetGuidesTeaser } from './PetGuidesTeaser';
import { PublicFooter } from './PublicLegalPages';

interface LandingSectionProps {
  onRegister: () => void;
  onLogin: () => void;
  onGuest: () => void;
}

const FEATURES: Array<{
  icon: typeof PawPrint;
  title: string;
  description: string;
  backgroundImage: string;
  imagePanelClass: string;
  textPanelClass: string;
  imageSize?: string;
}> = [
  {
    icon: MessageCircle,
    title: 'Consultorio IA',
    description: 'Resolvé dudas de salud de tu mascota al instante, con orientación y siempre recomendando la consulta veterinaria.',
    backgroundImage: '/landing/consultorio-ia.jpg',
    imagePanelClass: 'w-[50%] md:w-[52%]',
    textPanelClass: 'w-[56%]',
    imageSize: '118% auto',
  },
  {
    icon: CalendarDays,
    title: 'Agenda de cuidados',
    description: 'Vacunas, desparasitaciones y medicación con recordatorios por push, email y WhatsApp.',
    backgroundImage: '/landing/agenda-cuidados.jpg',
    imagePanelClass: 'w-[52%] md:w-[54%]',
    textPanelClass: 'w-[55%]',
    imageSize: '122% auto',
  },
  {
    icon: PawPrint,
    title: 'Historial clínico',
    description: 'Toda la información de salud de tu mascota organizada y exportable en PDF.',
    backgroundImage: '/landing/historial-clinico.jpg',
    imagePanelClass: 'w-[60%] md:w-[62%]',
    textPanelClass: 'w-[46%]',
    imageSize: '120% auto',
  },
  {
    icon: MapPinned,
    title: 'Veterinarias cercanas',
    description: 'Encontrá veterinarias cerca tuyo con un mapa interactivo.',
    backgroundImage: '/landing/veterinarias-cercanas.jpg',
    imagePanelClass: 'w-[52%] md:w-[54%]',
    textPanelClass: 'w-[55%]',
    imageSize: '120% auto',
  },
  {
    icon: Gift,
    title: 'Beneficios y ofertas',
    description: 'Productos y descuentos pensados para el cuidado de tu mascota.',
    backgroundImage: '/landing/beneficios-ofertas.jpg',
    imagePanelClass: 'w-[54%] md:w-[56%]',
    textPanelClass: 'w-[53%]',
    imageSize: '120% auto',
  },
];

export function LandingSection({ onRegister, onLogin, onGuest }: LandingSectionProps) {
  return (
    <section className="space-y-8 pb-6">
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-center text-white shadow-md md:p-10">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
          <PawPrint size={28} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight md:text-4xl">
          Cuidá a tu mascota con inteligencia artificial
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-emerald-50 md:text-base">
          AiPetFriendly te ayuda a organizar la salud de tu mascota: consultas de IA, agenda de
          cuidados, historial clínico y veterinarias cercanas, todo en un solo lugar.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-emerald-700 shadow transition hover:bg-emerald-50 md:text-base"
          >
            Crear cuenta gratis
          </button>
          <button
            type="button"
            onClick={onLogin}
            className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-white/10 md:text-base"
          >
            Ya estoy registrado
          </button>
          <button
            type="button"
            onClick={onGuest}
            className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white/70 px-6 py-3 text-sm font-semibold text-white/95 shadow transition hover:bg-white/10 md:text-base"
          >
            👁️ Seguir como visitante
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => {
          return (
            <div
              key={feature.title}
              className="group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-emerald-100"
            >
              <div className={`absolute inset-y-0 right-0 ${feature.imagePanelClass}`}>
                <div
                  className="h-full w-full bg-contain bg-right-bottom bg-no-repeat transition duration-500 group-hover:scale-[1.03]"
                  style={{
                    backgroundImage: `url(${feature.backgroundImage})`,
                    backgroundSize: feature.imageSize ?? 'contain',
                  }}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-transparent via-white/12 to-white/56" />
              </div>
              <div className={`absolute inset-y-0 left-0 ${feature.textPanelClass} bg-white`} />
              <div className="relative flex min-h-[190px] flex-col justify-start p-5 pt-4 md:min-h-[198px]">
                <div className="max-w-[18.5rem] rounded-2xl bg-white/98 p-3.5 shadow-sm ring-1 ring-emerald-100">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100/95 text-emerald-600 shadow-sm backdrop-blur-sm">
                      <feature.icon size={18} />
                    </span>
                    <h2 className="text-[1.22rem] leading-tight font-extrabold text-slate-900 tracking-[-0.01em] md:text-[1.3rem]">{feature.title}</h2>
                  </div>
                  <p className="mt-2.5 text-[1.01rem] font-semibold leading-relaxed text-slate-700">{feature.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Plan gratis y plan Premium</h2>
            <p className="mt-1 text-sm text-slate-600">
              Empezá gratis con 1 mascota y consultas de IA limitadas por día. Con Premium sumás
              mascotas ilimitadas, consultas sin límite, envío de historial por email y más.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
          <BadgeCheck size={16} />
          Sin tarjeta de crédito para empezar.
        </div>
      </div>

      <PetGuidesTeaser />

      <PublicFooter />
    </section>
  );
}
