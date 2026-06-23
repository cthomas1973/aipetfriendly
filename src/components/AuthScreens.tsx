import { FormEvent, useState } from 'react';
import { PawPrint, X } from 'lucide-react';
import { useUser } from '../hooks/useUser';

const inputCls = 'mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200';
const labelCls = 'block text-sm font-medium text-slate-700';

export function AuthScreens() {
  const { setMockUser } = useUser();
  const [email, setEmail] = useState('');
  const [showNewsletterModal, setShowNewsletterModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [tempEmail, setTempEmail] = useState('');

  const onSubmitEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) return;
    setTempEmail(email.trim().toLowerCase());
    setShowNewsletterModal(true);
  };

  const handleNewsletterYes = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fullName.trim()) return;
    setMockUser(tempEmail, fullName.trim(), true);
    // Reset form
    setEmail('');
    setFullName('');
    setShowNewsletterModal(false);
    setTempEmail('');
  };

  const handleNewsletterNo = () => {
    setMockUser(tempEmail, undefined, false);
    // Reset form
    setEmail('');
    setFullName('');
    setShowNewsletterModal(false);
    setTempEmail('');
  };

  const handleCloseModal = () => {
    setShowNewsletterModal(false);
    setEmail('');
    setFullName('');
    setTempEmail('');
  };

  return (
    <section className="pb-4">
      <div className="mb-6 text-center">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
          <PawPrint size={26} />
        </span>
        <h2 className="mt-3 text-2xl font-extrabold text-slate-900">Bienvenido a AiPetFriendly</h2>
        <p className="mt-1 text-sm text-slate-500">Ingresa tu email para comenzar.</p>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <form onSubmit={onSubmitEmail} className="space-y-4">
          <label className={labelCls}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className={inputCls}
              required
            />
          </label>
          <button type="submit"
            className="w-full rounded-full bg-emerald-500 py-3.5 font-bold text-white transition active:bg-emerald-600">
            Continuar
          </button>
        </form>
      </div>

      {/* Newsletter Modal */}
      {showNewsletterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-lg">
            {/* Close button */}
            <div className="mb-4 flex justify-end">
              <button
                onClick={handleCloseModal}
                className="text-slate-400 transition hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <h3 className="mb-2 text-xl font-bold text-slate-900">Mantente informado</h3>
            <p className="mb-6 text-sm text-slate-600">
              ¿Te gustaría recibir información sobre nuevas funcionalidades y tips para cuidar a tu mascota?
            </p>

            {/* Two buttons for newsletter choice */}
            <div className="mb-6 flex gap-3">
              <button
                onClick={handleNewsletterNo}
                className="flex-1 rounded-full border-2 border-slate-200 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                No, gracias
              </button>
              <button
                onClick={() => {
                  // Show name input when they click "Sí"
                  // We'll just show the form below
                  document.getElementById('nameForm')?.focus();
                }}
                className="flex-1 rounded-full bg-emerald-500 py-3 font-semibold text-white transition active:bg-emerald-600"
              >
                Sí, claro
              </button>
            </div>

            {/* Name form - appears when they want newsletter */}
            <form onSubmit={handleNewsletterYes} className="space-y-3">
              <label className={labelCls}>
                ¿Cuál es tu nombre?
                <input
                  id="nameForm"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  className={inputCls}
                  required
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-full bg-emerald-500 py-3 font-semibold text-white transition active:bg-emerald-600"
              >
                Continuar
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
