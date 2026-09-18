import { useEffect } from 'react';
import { Facebook, Instagram, Youtube } from 'lucide-react';
import type { ComponentType } from 'react';

type PublicLegalRoute = '/privacidad' | '/terminos' | '/contacto' | '/sobre-nosotros';

type IconProps = { size?: number | string; className?: string };

// Mismo patron que BlogSection.tsx/PetGuidesSection.tsx: cada pagina publica
// actualiza su propio title/description para que buscadores y el crawler de
// AdSense vean contenido distinto por URL (no siempre el generico de index.html).
function setPageMeta(title: string, description: string) {
  document.title = title;
  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', description);
  }
}

function TikTokIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function PinterestIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.017 0C5.396 0 0 5.396 0 12.017c0 5.086 3.163 9.421 7.627 11.174-.105-.949-.2-2.405.042-3.441.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.171-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.163 1.777 2.163 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.223.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146 1.123.347 2.312.535 3.55.535 6.624 0 12.017-5.396 12.017-12.017C24.033 5.396 18.637 0 12.017 0z" />
    </svg>
  );
}

const SOCIAL_LINKS: { label: string; href: string; Icon: ComponentType<IconProps> }[] = [
  { label: 'Instagram', href: 'https://www.instagram.com/aipetfriendly/', Icon: Instagram },
  { label: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61592682133532', Icon: Facebook },
  { label: 'TikTok', href: 'https://www.tiktok.com/@aipetfriendly', Icon: TikTokIcon },
  { label: 'Pinterest', href: 'https://ar.pinterest.com/carlostho/', Icon: PinterestIcon },
  { label: 'YouTube', href: 'https://www.youtube.com/@aipetfriendly', Icon: Youtube },
];

export function PublicFooter() {
  return (
    <footer className="mt-10 rounded-2xl border border-emerald-100 bg-white px-4 py-5 text-center text-sm text-slate-600">
      <p className="font-semibold text-slate-700">AiPetFriendly</p>
      <p className="mt-1">Cuidado inteligente para tu mascota.</p>
      <div className="mt-4 flex items-center justify-center gap-4">
        {SOCIAL_LINKS.map(({ label, href, Icon }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="text-slate-400 transition hover:text-emerald-600"
          >
            <Icon size={20} />
          </a>
        ))}
      </div>
      <nav className="mt-3 flex flex-wrap items-center justify-center gap-3 text-emerald-700">
        <a href="/sobre-nosotros" className="font-semibold hover:underline">
          Sobre nosotros
        </a>
        <span className="text-slate-300">|</span>
        <a href="/privacidad" className="font-semibold hover:underline">
          Politica de privacidad
        </a>
        <span className="text-slate-300">|</span>
        <a href="/terminos" className="font-semibold hover:underline">
          Terminos y aviso legal
        </a>
        <span className="text-slate-300">|</span>
        <a href="/contacto" className="font-semibold hover:underline">
          Contacto
        </a>
      </nav>
    </footer>
  );
}

function PrivacyPage() {
  useEffect(() => {
    setPageMeta(
      'Politica de privacidad | AiPetFriendly',
      'Como AiPetFriendly recolecta, usa y protege los datos personales de sus usuarios y de sus mascotas.',
    );
  }, []);

  return (
    <section className="space-y-6 pb-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100">
        <h1 className="text-2xl font-extrabold text-slate-900">Politica de privacidad</h1>
        <p className="mt-2 text-sm text-slate-600">
          En AiPetFriendly respetamos tu privacidad. Esta pagina explica como recolectamos,
          usamos y protegemos tu informacion personal.
        </p>
      </header>

      <article className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100">
        <div>
          <h2 className="font-bold text-slate-900">1. Informacion que recopilamos</h2>
          <p className="mt-1 text-sm text-slate-700">
            Podemos recopilar datos de registro (por ejemplo email), informacion relacionada con tus
            mascotas (nombre, especie, raza, historial clinico y agenda de cuidados que vos cargues) y
            datos tecnicos de navegacion (tipo de dispositivo, paginas visitadas) para mejorar el servicio.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">2. Servicios de terceros que procesan datos</h2>
          <p className="mt-1 text-sm text-slate-700">
            Para operar la app usamos proveedores externos que procesan datos en nuestro nombre:
            Supabase (base de datos y autenticacion), OpenAI (respuestas del consultorio de IA),
            Mercado Pago (pagos de la suscripcion Premium) y Twilio (notificaciones por WhatsApp).
            Cada uno procesa unicamente los datos necesarios para prestar su funcion especifica.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">3. Uso de cookies y publicidad</h2>
          <p className="mt-1 text-sm text-slate-700">
            Utilizamos cookies propias y de terceros para analitica y monetizacion publicitaria.
            Google y sus socios pueden usar cookies para mostrar anuncios personalizados o no
            personalizados segun tu configuracion y normativa aplicable.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">4. Uso de la informacion</h2>
          <p className="mt-1 text-sm text-slate-700">
            Usamos la informacion para prestar la aplicacion, mejorar funcionalidades, enviar
            recordatorios configurados por el usuario y reforzar la seguridad del servicio. No
            vendemos datos personales a terceros.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">5. Conservacion de los datos</h2>
          <p className="mt-1 text-sm text-slate-700">
            Conservamos los datos de tu cuenta mientras la mantengas activa. Si la eliminas desde la
            app o nos lo pedis por email, borramos la informacion asociada salvo que debamos
            conservar algun registro por obligacion legal o contable.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">6. Tus derechos</h2>
          <p className="mt-1 text-sm text-slate-700">
            Podes pedirnos acceso, rectificacion o eliminacion de tus datos personales (derechos ARCO,
            Ley 25.326 de Argentina) escribiendonos por email. La Agencia de Acceso a la Informacion
            Publica es la autoridad de control en materia de proteccion de datos en Argentina.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">7. Contacto por privacidad</h2>
          <p className="mt-1 text-sm text-slate-700">
            Para consultas sobre datos personales, escribinos a{' '}
            <a className="font-semibold text-emerald-700 hover:underline" href="mailto:contacto@aipetfriendly.ar">
              contacto@aipetfriendly.ar
            </a>
            .
          </p>
        </div>
      </article>

      <PublicFooter />
    </section>
  );
}

function TermsPage() {
  useEffect(() => {
    setPageMeta(
      'Terminos y aviso legal | AiPetFriendly',
      'Condiciones de uso de AiPetFriendly: alcance del servicio, suscripcion Premium, responsabilidad y datos del titular del sitio.',
    );
  }, []);

  return (
    <section className="space-y-6 pb-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100">
        <h1 className="text-2xl font-extrabold text-slate-900">Terminos y aviso legal</h1>
        <p className="mt-2 text-sm text-slate-600">
          Al usar AiPetFriendly aceptas estos terminos. El contenido es informativo y no reemplaza
          una consulta veterinaria profesional.
        </p>
      </header>

      <article className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100">
        <div>
          <h2 className="font-bold text-slate-900">1. Titular del sitio</h2>
          <p className="mt-1 text-sm text-slate-700">
            Sitio web operado por el equipo de AiPetFriendly para brindar herramientas digitales de
            apoyo al cuidado de mascotas. Contacto: contacto@aipetfriendly.ar.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">2. Uso permitido</h2>
          <p className="mt-1 text-sm text-slate-700">
            El usuario se compromete a usar la plataforma de forma licita, sin afectar su
            disponibilidad ni intentar acceder a datos de terceros sin autorizacion.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">3. Cuenta gratuita y suscripcion Premium</h2>
          <p className="mt-1 text-sm text-slate-700">
            AiPetFriendly ofrece un plan gratuito con funciones limitadas y un plan Premium pago,
            gestionado a traves de Mercado Pago. La suscripcion se renueva automaticamente segun el
            ciclo contratado y puede cancelarse en cualquier momento desde la seccion de suscripcion;
            la cancelacion aplica al proximo ciclo de facturacion.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">4. Contenido generado con inteligencia artificial</h2>
          <p className="mt-1 text-sm text-slate-700">
            El consultorio de IA y algunos posts del blog se generan con asistencia de inteligencia
            artificial. El blog pasa por revision editorial de un administrador antes de publicarse.
            En ningun caso este contenido reemplaza el diagnostico de un profesional veterinario.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">5. Limitacion de responsabilidad</h2>
          <p className="mt-1 text-sm text-slate-700">
            Las guias y sugerencias de la plataforma no constituyen diagnostico veterinario. Ante
            sintomas o urgencias, se debe consultar a un profesional matriculado.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">6. Baja de cuenta</h2>
          <p className="mt-1 text-sm text-slate-700">
            Podes eliminar tu cuenta y tus datos en cualquier momento escribiendonos a
            contacto@aipetfriendly.ar. La eliminacion de la suscripcion Premium no cancela
            automaticamente el cobro en Mercado Pago; ese paso debe hacerse desde la app o desde
            Mercado Pago.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">7. Ley aplicable</h2>
          <p className="mt-1 text-sm text-slate-700">
            Estos terminos se rigen por las leyes de la Republica Argentina, sin perjuicio de las
            normas de proteccion al consumidor aplicables segun tu jurisdiccion.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">8. Modificaciones</h2>
          <p className="mt-1 text-sm text-slate-700">
            Podemos actualizar estos terminos para reflejar cambios operativos o legales. La version
            vigente se publica siempre en esta pagina.
          </p>
        </div>
      </article>

      <PublicFooter />
    </section>
  );
}

function ContactPage() {
  useEffect(() => {
    setPageMeta(
      'Contacto | AiPetFriendly',
      'Como contactar al equipo de AiPetFriendly por consultas, sugerencias o temas comerciales.',
    );
  }, []);

  return (
    <section className="space-y-6 pb-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100">
        <h1 className="text-2xl font-extrabold text-slate-900">Contacto</h1>
        <p className="mt-2 text-sm text-slate-600">
          Si tenes dudas, sugerencias o consultas comerciales, podes escribirnos por email.
        </p>
      </header>

      <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100">
        <p className="text-sm text-slate-700">
          Email de contacto:{' '}
          <a className="font-semibold text-emerald-700 hover:underline" href="mailto:contacto@aipetfriendly.ar">
            contacto@aipetfriendly.ar
          </a>
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Tiempo de respuesta estimado: entre 24 y 72 horas habiles.
        </p>
      </article>

      <PublicFooter />
    </section>
  );
}

function AboutPage() {
  useEffect(() => {
    setPageMeta(
      'Sobre nosotros | AiPetFriendly',
      'Quienes hacemos AiPetFriendly: una app para el cuidado de perros y gatos con consultorio de IA, agenda de cuidados, historial clinico y guias.',
    );
  }, []);

  return (
    <section className="space-y-6 pb-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100">
        <h1 className="text-2xl font-extrabold text-slate-900">Sobre nosotros</h1>
        <p className="mt-2 text-sm text-slate-600">
          AiPetFriendly es un proyecto argentino para ayudar a que el cuidado de perros y gatos sea
          mas simple, ordenado y accesible.
        </p>
      </header>

      <article className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100">
        <div>
          <h2 className="font-bold text-slate-900">Que es AiPetFriendly</h2>
          <p className="mt-1 text-sm text-slate-700">
            Es una aplicacion web que centraliza el historial clinico de tu mascota, una agenda de
            vacunas y desparasitaciones, un mapa de veterinarias cercanas y un consultorio con
            inteligencia artificial para resolver dudas cotidianas de cuidado. Nace de la necesidad de
            tener toda esa informacion ordenada en un solo lugar, en vez de repartida entre libretas,
            chats y recordatorios sueltos.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">Como hacemos el contenido</h2>
          <p className="mt-1 text-sm text-slate-700">
            Las guias de adiestramiento, ansiedad, conducta y salud son escritas y curadas por el
            equipo de AiPetFriendly. El blog de novedades se arma con asistencia de inteligencia
            artificial a partir de fuentes reales, y cada post pasa por revision de un administrador
            antes de publicarse. Ningun contenido del sitio reemplaza la consulta con un veterinario
            matriculado.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">Nuestro compromiso</h2>
          <p className="mt-1 text-sm text-slate-700">
            Buscamos que la informacion sea clara, practica y util para el dia a dia con tu mascota,
            y seguir sumando funciones (como chapitas con codigo QR y perfiles publicos para mascotas
            perdidas) que resuelvan problemas reales de duenios de perros y gatos.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">Contacto</h2>
          <p className="mt-1 text-sm text-slate-700">
            Para consultas, sugerencias o prensa, escribinos a{' '}
            <a className="font-semibold text-emerald-700 hover:underline" href="mailto:contacto@aipetfriendly.ar">
              contacto@aipetfriendly.ar
            </a>
            .
          </p>
        </div>
      </article>

      <PublicFooter />
    </section>
  );
}

export function PublicLegalPage({ route }: { route: string }) {
  if (route === '/privacidad') {
    return <PrivacyPage />;
  }

  if (route === '/terminos') {
    return <TermsPage />;
  }

  if (route === '/contacto') {
    return <ContactPage />;
  }

  if (route === '/sobre-nosotros') {
    return <AboutPage />;
  }

  return null;
}

export function isPublicLegalRoute(route: string): route is PublicLegalRoute {
  return route === '/privacidad' || route === '/terminos' || route === '/contacto' || route === '/sobre-nosotros';
}
