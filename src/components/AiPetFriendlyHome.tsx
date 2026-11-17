import { useState } from 'react';
import {
  ArrowRight, CalendarDays, ChevronDown, Menu, MessageCircle,
  PawPrint, MapPin, ShoppingBag, QrCode, X, Sparkles,
  BookOpen, UserRound, Heart, CheckCircle2
} from 'lucide-react';
import './AiPetFriendlyHome.css';

type Destination =
  | 'pets' | 'agenda' | 'assistant' | 'veterinaries'
  | 'pet-friendly' | 'store' | 'qr' | 'blog' | 'guides'
  | 'how-it-works' | 'about' | 'contact';

interface AiPetFriendlyHomeProps {
  onRegister: () => void;
  onLogin: () => void;
  onGuest: () => void;
  /** The integrating app maps these stable keys to its real routes/tabs. */
  onNavigate?: (destination: Destination) => void;
}

const features: Array<{
  key: Destination;
  title: string;
  image: string;
  icon: typeof PawPrint;
  alt: string;
}> = [
  { key: 'pets', title: 'Mis mascotas', image: '/landing/home/pets.webp', icon: PawPrint, alt: 'Perros y gatos' },
  { key: 'agenda', title: 'Agenda e historial', image: '/landing/home/agenda.webp', icon: CalendarDays, alt: 'Calendario para organizar cuidados' },
  { key: 'assistant', title: 'Consultorio IA', image: '/landing/home/assistant.webp', icon: MessageCircle, alt: 'Asistente digital' },
  { key: 'veterinaries', title: 'Veterinarias y Pet Friendly', image: '/landing/home/places.webp', icon: MapPin, alt: 'Persona con su perro frente a un establecimiento' },
  { key: 'store', title: 'Tienda', image: '/landing/home/store.webp', icon: ShoppingBag, alt: 'Productos para mascotas' },
  { key: 'qr', title: 'Identificación QR', image: '/landing/home/qr.webp', icon: QrCode, alt: 'Chapita QR para mascotas' },
];

const faqs = [
  ['¿Qué es AiPetFriendly?', 'Es un espacio con herramientas para organizar el cuidado de tus mascotas y acceder a recursos útiles desde un mismo lugar.'],
  ['¿Es gratis?', 'Podés comenzar gratis y conocer las herramientas disponibles. Algunas funciones y límites dependen del plan.'],
  ['¿Cómo agrego una mascota?', 'Creá una cuenta, ingresá a Mis mascotas y completá los datos de tu compañero.'],
  ['¿Qué hace el Consultorio IA?', 'Ayuda a encontrar información orientativa y contextualizada. No diagnostica ni reemplaza la consulta veterinaria.'],
  ['¿Cómo funciona la identificación QR?', 'La chapita permite abrir un perfil público de la mascota para facilitar el contacto con quien la encuentre, sin exponer tus datos privados.'],
];

export function AiPetFriendlyHome({
  onRegister, onLogin, onGuest, onNavigate,
}: AiPetFriendlyHomeProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const go = (destination: Destination) => {
    setMenuOpen(false);
    onNavigate?.(destination);
  };

  return (
    <main className="apf-home">
      <header className="apf-header">
        <a className="apf-brand" href="/" aria-label="AiPetFriendly, inicio">
          <img src="/logo-aipetfriendly.png" alt="" />
          <span>AiPetFriendly</span>
        </a>
        <button className="apf-menu-toggle" type="button" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setMenuOpen(v => !v)}>
          {menuOpen ? <X /> : <Menu />}
        </button>
        <nav className={`apf-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Navegación principal">
          <button className="is-active" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Inicio</button>
          <button onClick={() => go('pets')}><PawPrint /> Mascotas</button>
          <button onClick={() => go('agenda')}><CalendarDays /> Agenda</button>
          <button onClick={() => go('assistant')}><MessageCircle /> Consultorio IA</button>
          <button onClick={() => go('veterinaries')}><MapPin /> Lugares</button>
          <button onClick={() => go('store')}><ShoppingBag /> Tienda</button>
          <button onClick={() => go('blog')}><BookOpen /> Blog</button>
        </nav>
        <div className="apf-auth">
          <button className="apf-btn apf-btn-outline" onClick={onLogin}>Ingresar</button>
          <button className="apf-btn apf-btn-primary" onClick={onRegister}>Crear cuenta gratis</button>
        </div>
      </header>

      <section className="apf-hero">
        <div className="apf-hero-copy">
          <span className="apf-eyebrow"><Heart size={15} fill="currentColor" /> Todo el cuidado, en un solo lugar</span>
          <h1>Todo para cuidar mejor a quienes más querés<span>.</span></h1>
          <div className="apf-yellow-stroke" />
          <p>Organizá sus cuidados, encontrá recursos y disfrutá más tiempo juntos.</p>
          <div className="apf-hero-actions">
            <button className="apf-btn apf-btn-primary apf-btn-large" onClick={onGuest}><PawPrint /> Explorar herramientas</button>
            <button className="apf-btn apf-btn-outline apf-btn-large" onClick={onRegister}><UserRound /> Crear cuenta gratis</button>
          </div>
          <button className="apf-login-link" onClick={onLogin}>Ya tengo cuenta</button>
        </div>
        <div className="apf-hero-visual">
          <img src="/landing/home/hero-dog-cat.webp" alt="Un perro Golden Retriever y un gato descansando juntos" />
          <div className="apf-floating-tags">
            <span><CalendarDays /> Agenda al día <CheckCircle2 /></span>
            <span><PawPrint /> Perfil de tu mascota <CheckCircle2 /></span>
            <span><QrCode /> Identificación QR <CheckCircle2 /></span>
          </div>
        </div>
      </section>

      <section className="apf-features" id="herramientas">
        <div className="apf-section-heading">
          <div><span className="apf-kicker">DESCUBRÍ TODO LO QUE PODÉS HACER</span><h2>Todo lo que necesitás, en un solo lugar <b>✦</b></h2></div>
          <button className="apf-text-link" onClick={() => go('how-it-works')}>Conocé cómo funciona <ArrowRight /></button>
        </div>
        <div className="apf-feature-grid">
          {features.map(({ key, title, image, icon: Icon, alt }) => (
            <button className="apf-feature-card" key={key} onClick={() => go(key)}>
              <img className="apf-feature-image" src={image} alt={alt} />
              <span className="apf-feature-label">
                <span className="apf-feature-icon"><Icon /></span>
                <strong>{title}</strong>
                <span className="apf-card-arrow"><ArrowRight /></span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="apf-steps">
        <div className="apf-steps-title"><span className="apf-kicker">EMPEZÁ FÁCIL</span><h2>Empezá en 3 pasos</h2></div>
        <div className="apf-step"><span className="apf-step-icon"><UserRound /></span><strong>Creá tu cuenta</strong></div>
        <ArrowRight className="apf-step-arrow" />
        <div className="apf-step"><span className="apf-step-icon"><PawPrint /></span><strong>Agregá tu mascota</strong></div>
        <ArrowRight className="apf-step-arrow" />
        <div className="apf-step"><span className="apf-step-icon"><Sparkles /></span><strong>Explorá las herramientas</strong></div>
      </section>

      <section className="apf-discover">
        <div className="apf-ideas">
          <div className="apf-section-heading"><div><span className="apf-kicker">CONTENIDO PARA VOS</span><h2>Ideas para cuidar mejor</h2></div></div>
          <div className="apf-content-cards">
            <button className="apf-content-card" onClick={() => go('guides')}>
              <img src="/landing/home/assistant.webp" alt="Recursos y consejos para mascotas" />
              <span><strong>Guías prácticas</strong><ArrowRight /></span>
            </button>
            <button className="apf-content-card" onClick={() => go('blog')}>
              <img src="/landing/home/pets.webp" alt="Perro y gato" />
              <span><strong>Notas y novedades</strong><ArrowRight /></span>
            </button>
          </div>
        </div>
        <div className="apf-faq">
          <span className="apf-kicker">TE AYUDAMOS A EMPEZAR</span>
          <h2>Preguntas frecuentes</h2>
          {faqs.map(([question, answer], index) => (
            <div className={`apf-faq-item ${openFaq === index ? 'is-open' : ''}`} key={question}>
              <button onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index}>
                {question}<ChevronDown />
              </button>
              {openFaq === index && <p>{answer}</p>}
            </div>
          ))}
        </div>
      </section>

      <footer className="apf-footer">
        <a className="apf-footer-brand" href="/"><img src="/logo-aipetfriendly.png" alt="" /><strong>AiPetFriendly</strong></a>
        <span>Todo para el bienestar de tus mascotas.</span>
        <nav><button onClick={() => go('about')}>Quiénes somos</button><button onClick={() => go('contact')}>Contacto</button><button onClick={() => go('guides')}>Guías</button></nav>
        <small>© {new Date().getFullYear()} AiPetFriendly</small>
      </footer>
    </main>
  );
}
