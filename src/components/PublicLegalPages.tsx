type PublicLegalRoute = '/privacidad' | '/terminos' | '/contacto';

export function PublicFooter() {
  return (
    <footer className="mt-10 rounded-2xl border border-emerald-100 bg-white px-4 py-5 text-center text-sm text-slate-600">
      <p className="font-semibold text-slate-700">AiPetFriendly</p>
      <p className="mt-1">Cuidado inteligente para tu mascota.</p>
      <nav className="mt-3 flex flex-wrap items-center justify-center gap-3 text-emerald-700">
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
            mascotas y datos tecnicos de navegacion para mejorar el servicio.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">2. Uso de cookies y publicidad</h2>
          <p className="mt-1 text-sm text-slate-700">
            Utilizamos cookies propias y de terceros para analitica y monetizacion publicitaria.
            Google y sus socios pueden usar cookies para mostrar anuncios personalizados o no
            personalizados segun tu configuracion y normativa aplicable.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">3. Uso de la informacion</h2>
          <p className="mt-1 text-sm text-slate-700">
            Usamos la informacion para prestar la aplicacion, mejorar funcionalidades, enviar
            recordatorios configurados por el usuario y reforzar la seguridad del servicio.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">4. Contacto por privacidad</h2>
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
            apoyo al cuidado de mascotas.
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
          <h2 className="font-bold text-slate-900">3. Limitacion de responsabilidad</h2>
          <p className="mt-1 text-sm text-slate-700">
            Las guias y sugerencias de la plataforma no constituyen diagnostico veterinario. Ante
            sintomas o urgencias, se debe consultar a un profesional matriculado.
          </p>
        </div>

        <div>
          <h2 className="font-bold text-slate-900">4. Modificaciones</h2>
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

  return null;
}

export function isPublicLegalRoute(route: string): route is PublicLegalRoute {
  return route === '/privacidad' || route === '/terminos' || route === '/contacto';
}
