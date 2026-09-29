import Chatbot from '../components/Chatbot';
import SiteNav from '../components/SiteNav';
import NodeMark from '../components/NodeMark';

/* ------------------------------------------------------------------ */
/*  Données                                                           */
/* ------------------------------------------------------------------ */

const SERVICES = [
  {
    title: 'Transition Numérique',
    desc: 'Digitalisation de vos processus métiers : applications et sites web bâtis sur mesure, outils internes qui remplacent les fichiers éparpillés et les doublons de saisie.',
    icon: 'terminal',
  },
  {
    title: 'Ingénierie en IA & Agents Vocaux',
    desc: 'Agents conversationnels en temps réel, capables d’écouter, de comprendre et de répondre à la voix — intégrés à vos sites et vos services (celui en bas à droite en est un).',
    icon: 'mic',
  },
  {
    title: 'Marketing Digital & Communication',
    desc: 'Stratégie de visibilité, gestion de vos réseaux sociaux et création de contenu (visuel, texte, vidéo) pour que votre présence en ligne reflète votre travail.',
    icon: 'megaphone',
  },
  {
    title: 'Audit & Cybersécurité',
    desc: 'Audits de vulnérabilité, mise en place de mesures de protection, support technique et maintenance — pour que votre infrastructure ne soit pas le maillon faible.',
    icon: 'shield',
  },
  {
    title: 'Commerce International & e-Business',
    desc: 'Étude de marché export, stratégie d’internationalisation, sourcing et canaux e-business pour porter vos produits au-delà des frontières.',
    icon: 'globe',
  },
  {
    title: 'Entrepreneuriat & Gestion de Projets',
    desc: 'Élaboration et actualisation de business plans, études de faisabilité, plans de financement et pilotage de projet — de l’idée au lancement.',
    icon: 'chart',
  },
];

const TEAM = [
  {
    nom: 'Jacob De Dieu AGOSSEVI',
    poste: 'Président Directeur Général',
    filiere: 'Finance & Comptabilité · Licence 2',
    tel: '+229 01 95 62 12 20',
    competences: ['Leadership', 'Stratégie', 'Finance'],
  },
  {
    nom: 'Ismaël DJIBRIL FALILATOU',
    poste: 'Directeur Général Adjoint',
    filiere: 'Gestion des Entreprises · Licence 2',
    tel: '+229 01 53 89 05 76',
    competences: ['Pilotage', 'Opérations', 'Réseau'],
  },
  {
    nom: 'Maysia SOSSOU',
    poste: 'Directrice du Pôle Marketing Digital',
    filiere: 'Marketing & Communication Digitale',
    tel: '+229 01 97 31 13 09',
    competences: ['Stratégie de marque', 'Contenu', 'Acquisition'],
  },
  {
    nom: 'Rachid OROU-GUIDOU',
    poste: 'Directeur du Pôle Développement & Sécurité',
    filiere: 'Génie Logiciel & Cybersécurité',
    tel: '+229 01 97 42 07 44',
    competences: ['Développement web', 'Sécurité', 'DevOps'],
  },
  {
    nom: 'Guillaume AGBO',
    poste: 'Directeur Technique & Intelligence Artificielle',
    filiere: 'Génie Logiciel & Intelligence Artificielle',
    tel: '+229 01 68 08 08 09',
    competences: ['IA & LLM', 'Systèmes vocaux', 'Architecture'],
  },
];

const PILIERS = [
  {
    titre: 'Coworking',
    texte: 'Un espace de travail partagé où les idées se croisent — le premier cercle de la synergie LULI-TECH.',
  },
  {
    titre: 'Digital',
    texte: 'Le cœur technique de la maison : développement, IA, cybersécurité et communication digitale.',
  },
  {
    titre: 'Entrepreneuriat',
    texte: 'Accompagnement de projets et de porteurs d’initiatives, du business plan au lancement.',
  },
];

const SOCIALS = [
  { label: 'Facebook', href: 'https://www.facebook.com' },
  { label: 'Instagram', href: 'https://www.instagram.com' },
  { label: 'TikTok', href: 'https://www.tiktok.com' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com' },
];

/* Icônes « ligne » dessinées à la main — pas d’emojis */
function ServiceIcon({ name }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  switch (name) {
    case 'terminal':
      return (
        <svg className="w-7 h-7" viewBox="0 0 24 24" {...common}>
          <path d="M5 7l4 4-4 4" />
          <path d="M11 15h6" />
        </svg>
      );
    case 'mic':
      return (
        <svg className="w-7 h-7" viewBox="0 0 24 24" {...common}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M6 11a6 6 0 0 0 12 0" />
          <path d="M12 17v4M9 21h6" />
        </svg>
      );
    case 'megaphone':
      return (
        <svg className="w-7 h-7" viewBox="0 0 24 24" {...common}>
          <path d="M4 10v4h2l7 4V6l-7 4H4z" />
          <path d="M16 9v6a3 3 0 0 1 3-3v0a3 3 0 0 1-3-3z" />
        </svg>
      );
    case 'shield':
      return (
        <svg className="w-7 h-7" viewBox="0 0 24 24" {...common}>
          <path d="M12 3l7 2.5V11c0 4.6-3 8.2-7 9.5-4-1.3-7-4.9-7-9.5V5.5L12 3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case 'globe':
      return (
        <svg className="w-7 h-7" viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17" />
          <path d="M12 3.5c2.6 2.5 2.6 14.5 0 17M12 3.5c-2.6 2.5-2.6 14.5 0 17" />
        </svg>
      );
    default:
      return (
        <svg className="w-7 h-7" viewBox="0 0 24 24" {...common}>
          <path d="M4 20v-8M10 20V6M16 20v-5M22 20H2" />
        </svg>
      );
  }
}

function SectionLabel({ num, title, note }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-mono text-xs text-cyan-300/80">{num}</span>
      <span className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{title}</span>
      {note && <span className="hidden sm:inline text-xs text-slate-600">— {note}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function Home() {
  return (
    <div id="top" className="relative min-h-screen bg-[#0a0d14] text-slate-100 antialiased">
      {/* Arrière-plan : grille fine + léger halo en haut */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-grid" />
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(34,211,238,0.07),transparent)]" />

      <SiteNav />

      <main>
        {/* HERO — éditorial, aligné à gauche */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-14 sm:pb-20">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/90">
              Agence technique · Calavi, Bénin
            </p>
            <h1 className="mt-5 font-display text-4xl sm:text-6xl leading-[1.05] tracking-tight text-white">
              Du code, de l’IA,
              <br />
              <em className="text-slate-300">et des réponses qui parlent.</em>
            </h1>
            <p className="mt-6 text-slate-400 text-base sm:text-lg leading-relaxed max-w-xl">
              LULI-TECH conçoit des applications métiers, des agents conversationnels vocaux
              et des solutions de cybersécurité — des produits finis, pensés pour vos équipes,
              depuis Calavi jusqu’au reste du monde.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="#contact"
                className="rounded-full bg-white text-[#0a0d14] px-6 py-3 text-sm font-semibold hover:bg-cyan-300 transition-colors"
              >
                Démarrer un projet
              </a>
              <a
                href="#offres"
                className="rounded-full border border-white/15 px-6 py-3 text-sm text-slate-200 hover:border-white/40 hover:text-white transition-colors"
              >
                Voir les offres
              </a>
            </div>
            <p className="mt-8 flex items-center gap-2.5 text-xs text-slate-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              Agent vocal en ligne — testez-le, bouton en bas à droite.
            </p>
          </div>

          {/* Index des offres — ligne éditoriale */}
          <div className="mt-16 border-t border-white/5">
            {SERVICES.map((s, i) => (
              <a
                key={s.title}
                href="#offres"
                className="group flex items-baseline gap-4 sm:gap-6 border-b border-white/5 py-3.5"
              >
                <span className="text-xs font-mono text-slate-600 w-6">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-sm sm:text-base text-slate-300 group-hover:text-white transition-colors">
                  {s.title}
                </span>
                <span className="ml-auto hidden sm:inline text-xs text-slate-600 group-hover:text-cyan-300 transition-colors">
                  →
                </span>
              </a>
            ))}
          </div>
        </section>

        {/* 01 — OFFRES */}
        <section id="offres" className="border-t border-white/5">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
            <SectionLabel num="01" title="Offres" note="six champs d’intervention" />
            <h2 className="mt-4 font-display text-3xl sm:text-4xl tracking-tight text-white">
              Ce que nous livrons
            </h2>
            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden">
              {SERVICES.map((s) => (
                <article key={s.title} className="bg-[#0a0d14] p-6 sm:p-7">
                  <div className="text-cyan-300/90">
                    <ServiceIcon name={s.icon} />
                  </div>
                  <h3 className="mt-5 text-[15px] font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">{s.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 02 — LA MARQUE */}
        <section id="marque" className="border-t border-white/5">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
            <SectionLabel num="02" title="La marque" note="un nœud, trois pôles" />
            <div className="mt-10 grid lg:grid-cols-5 gap-10 items-start">
              <div className="lg:col-span-2">
                <div className="w-28 h-28 rounded-2xl border border-white/10 bg-white/[0.02] flex items-center justify-center">
                  <NodeMark className="w-20 h-20" />
                </div>
                <h2 className="mt-8 font-display text-3xl sm:text-4xl tracking-tight text-white leading-tight">
                  Le Nœud Tripartite,<br />
                  <em className="text-slate-300">symbole officiel.</em>
                </h2>
                <p className="mt-5 text-sm sm:text-base text-slate-400 leading-relaxed max-w-md">
                  Trois pôles reliés, comme les trois ronds du nœud : Coworking, Digital et
                  Entrepreneuriat. C’est le symbole officiel de LULI-TECH — le logo que vous
                  voyez sur nos supports, notre site et nos services.
                </p>
                <p className="mt-6 font-display italic text-lg text-slate-200">
                  « Innovons aujourd’hui avec les solutions de demain. »
                </p>
              </div>

              <div className="lg:col-span-3 space-y-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden">
                {PILIERS.map((p, i) => (
                  <div key={p.titre} className="bg-[#0a0d14] p-6 sm:p-8 grid sm:grid-cols-12 gap-3">
                    <span className="font-mono text-xs text-slate-600 sm:col-span-1">{String(i + 1).padStart(2, '0')}</span>
                    <div className="sm:col-span-11">
                      <h3 className="text-white font-semibold">{p.titre}</h3>
                      <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">{p.texte}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 03 — ÉQUIPE */}
        <section id="equipe" className="border-t border-white/5">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
            <SectionLabel num="03" title="Équipe" note="les cinq pôles" />
            <h2 className="mt-4 font-display text-3xl sm:text-4xl tracking-tight text-white">
              Cinq directions, une seule maison
            </h2>
            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden">
              {TEAM.map((m) => (
                <article key={m.nom} className="bg-[#0a0d14] p-6 sm:p-7 flex flex-col">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-px shrink-0">
                      <div className="w-full h-full rounded-[11px] bg-[#0a0d14] flex items-center justify-center font-display text-base font-semibold text-cyan-300">
                        {m.nom.split(' ').slice(-2).map((n) => n[0]).join('')}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-white leading-snug">{m.nom}</h3>
                      <p className="text-xs text-cyan-300/90 mt-0.5">{m.poste}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-[11px] font-mono uppercase tracking-wider text-slate-500">
                    {m.filiere}
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {m.competences.map((c) => (
                      <li key={c} className="text-[11px] text-slate-400 border border-white/10 rounded-full px-2.5 py-0.5">
                        {c}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={`tel:${m.tel.replace(/\s/g, '')}`}
                    className="mt-5 pt-4 border-t border-white/5 text-xs text-slate-500 hover:text-cyan-300 transition-colors"
                  >
                    {m.tel}
                  </a>
                </article>
              ))}

              {/* Carte « vous » — place à l’équipe qui grandit */}
              <article className="bg-[#0a0d14] p-6 sm:p-7 flex flex-col justify-center border-l-2 border-cyan-400/60">
                <h3 className="font-display text-2xl text-white">Et vous ?</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  Nous recrutons des profils techniques et créatifs. Écrivez-nous pour un stage,
                  une alternance ou une collaboration.
                </p>
                <a
                  href="mailto:LULI-TECH@gmail.com"
                  className="mt-5 text-sm text-cyan-300 hover:text-white transition-colors"
                >
                  Candidature → 
                </a>
              </article>
            </div>
          </div>
        </section>

        {/* 04 — AGENT VOCAL */}
        <section id="agent" className="border-t border-white/5">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
            <SectionLabel num="04" title="Agent vocal" note="un exemple vivant, en bas de page" />
            <div className="mt-10 grid lg:grid-cols-2 gap-10 items-start">
              <div>
                <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-white leading-tight">
                  Posez la question,
                  <br />
                  <em className="text-slate-300">il répond en parlant.</em>
                </h2>
                <p className="mt-5 text-sm sm:text-base text-slate-400 leading-relaxed max-w-md">
                  Un agent conversationnel vocal, embarqué directement dans le site. Il écoute,
                  transcrit votre phrase, compose une réponse et vous la lit — en moins de trois
                  secondes. Une démonstration concrète de notre pôle IA.
                </p>
                <ul className="mt-7 space-y-3 text-sm text-slate-300">
                  <li className="flex items-baseline gap-3">
                    <span className="text-cyan-300/80">›</span>
                    Transcription vocale en direct — Groq Whisper
                  </li>
                  <li className="flex items-baseline gap-3">
                    <span className="text-cyan-300/80">›</span>
                    Réponse en ~2 s — Groq qwen3.8-27b
                  </li>
                  <li className="flex items-baseline gap-3">
                    <span className="text-cyan-300/80">›</span>
                    Lecture vocale — Edge TTS
                  </li>
                  <li className="flex items-baseline gap-3">
                    <span className="text-cyan-300/80">›</span>
                    Bouton en bas à droite, essayez-le
                  </li>
                </ul>
              </div>

              {/* Extrait de session — */}
              <div className="rounded-2xl border border-white/10 bg-[#0b0f18] overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <span className="ml-3 text-[11px] font-mono text-slate-500">session · demo.md</span>
                </div>
                <div className="p-5 sm:p-6 font-mono text-[12.5px] leading-relaxed">
                  <p className="text-slate-500"># posez une question, par le texte ou la voix</p>
                  <p className="mt-3 text-slate-300"><span className="text-cyan-300">vous&nbsp;</span>&gt; Quel est le slogan exact de LULI-TECH ?</p>
                  <p className="mt-2 text-slate-400"><span className="text-emerald-300">agent&nbsp;</span>&gt; « Innovons aujourd’hui avec les solutions de demain. »</p>
                  <p className="mt-4 text-slate-300"><span className="text-cyan-300">vous&nbsp;</span>&gt; (voix) Qui dirige le pôle technique ?</p>
                  <p className="mt-2 text-slate-400"><span className="text-emerald-300">agent&nbsp;</span>&gt; Guillaume AGBO, Directeur Technique & Intelligence Artificielle.</p>
                  <p className="mt-4 text-slate-600"># latence réelle : ~2 s, même en vocal</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 05 — CONTACT */}
        <section id="contact" className="border-t border-white/5">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
            <SectionLabel num="05" title="Contact" note="réponse garantie sous 48 h" />
            <div className="mt-10 grid lg:grid-cols-2 gap-10 items-start">
              <div>
                <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-white leading-tight">
                  Un projet, une idée,
                  <br />
                  <em className="text-slate-300">une question ?</em>
                </h2>
                <a
                  href="mailto:LULI-TECH@gmail.com"
                  className="mt-7 inline-flex items-center gap-2 rounded-full bg-white text-[#0a0d14] px-6 py-3 text-sm font-semibold hover:bg-cyan-300 transition-colors"
                >
                  Écrire à l’équipe
                  <span aria-hidden="true">→</span>
                </a>
                <p className="mt-6 text-sm text-slate-500 max-w-md leading-relaxed">
                  LULI-TECH, Calavi — Bénin. Nous répondons aux emails, aux appels et… à la voix,
                  grâce à l’agent en bas de page.
                </p>
              </div>

              <div className="space-y-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden">
                <a
                  href="mailto:LULI-TECH@gmail.com"
                  className="flex items-baseline gap-4 bg-[#0a0d14] px-5 py-4 hover:bg-white/[0.03] transition-colors"
                >
                  <span className="w-7 text-xs font-mono text-slate-600">@</span>
                  <span className="text-sm text-slate-300">LULI-TECH@gmail.com</span>
                </a>
                <a
                  href="https://luli-tech.netlify.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-baseline gap-4 bg-[#0a0d14] px-5 py-4 hover:bg-white/[0.03] transition-colors"
                >
                  <span className="w-7 text-xs font-mono text-slate-600">↗</span>
                  <span className="text-sm text-slate-300">luli-tech.netlify.app</span>
                </a>
                <div className="flex items-baseline gap-4 bg-[#0a0d14] px-5 py-4">
                  <span className="w-7 text-xs font-mono text-slate-600">◈</span>
                  <span className="text-sm text-slate-300">Calavi, Bénin</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-white/5 bg-[#0b0f18]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 grid gap-10 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <NodeMark className="w-8 h-8" />
              <span className="font-bold tracking-tight text-white">LULI-TECH</span>
            </div>
            <p className="mt-4 text-sm text-slate-500 leading-relaxed max-w-xs">
              Ingénierie logicielle, intelligence artificielle et cybersécurité — depuis Calavi,
              pour le Bénin et au-delà.
            </p>
            <p className="mt-4 font-display italic text-sm text-slate-400">
              « Innovons aujourd’hui avec les solutions de demain. »
            </p>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Navigation</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[
                ['#offres', 'Offres'],
                ['#marque', 'La marque'],
                ['#equipe', 'Équipe'],
                ['#agent', 'Agent vocal'],
                ['#contact', 'Contact'],
              ].map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="text-slate-400 hover:text-white transition-colors">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Réseaux</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {SOCIALS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-5 flex flex-col sm:flex-row gap-2 items-baseline justify-between text-[11px] text-slate-600">
            <p>© 2025 LULI-TECH — Tous droits réservés.</p>
            <p>Conçu et développé par l’équipe LULI-TECH, à la main.</p>
          </div>
        </div>
      </footer>

      <Chatbot />
    </div>
  );
}