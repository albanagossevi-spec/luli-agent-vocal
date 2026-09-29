'use client';

import { useState } from 'react';
import NodeMark from './NodeMark';

const LINKS = [
  { href: '#offres', label: 'Offres' },
  { href: '#marque', label: 'La marque' },
  { href: '#equipe', label: 'Équipe' },
  { href: '#agent', label: 'Agent vocal' },
  { href: '#contact', label: 'Contact' },
];

export default function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0a0d14]/85 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <NodeMark className="w-8 h-8" />
          <span className="leading-none">
            <span className="block text-[15px] font-bold tracking-tight text-white">LULI-TECH</span>
            <span className="block text-[10px] uppercase tracking-[0.22em] text-slate-500 mt-0.5">
              Ingénierie & IA
            </span>
          </span>
        </a>

        <nav className="hidden md:flex items-center gap-7 text-[13px] text-slate-400">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-white transition-colors">
              {l.label}
            </a>
          ))}
          <a
            href="mailto:LULI-TECH@gmail.com"
            className="ml-2 rounded-full border border-white/10 px-4 py-1.5 text-slate-200 hover:border-cyan-400/50 hover:text-white transition-colors"
          >
            Écrire
          </a>
        </nav>

        <button
          type="button"
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="md:hidden flex flex-col justify-center items-center gap-[5px] w-9 h-9 rounded-lg border border-white/10"
        >
          <span
            className={`block h-px w-4 bg-slate-300 transition-transform ${
              open ? 'rotate-45 translate-y-[3px]' : ''
            }`}
          />
          <span className={`block h-px w-4 bg-slate-300 transition-opacity ${open ? 'opacity-0' : ''}`} />
          <span
            className={`block h-px w-4 bg-slate-300 transition-transform ${
              open ? '-rotate-45 -translate-y-[3px]' : ''
            }`}
          />
        </button>
      </div>

      {open && (
        <nav className="md:hidden border-t border-white/5 px-5 py-4 flex flex-col bg-[#0a0d14]/95">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="py-2.5 text-sm text-slate-300 hover:text-white border-b border-white/5 last:border-0"
            >
              {l.label}
            </a>
          ))}
          <a href="mailto:LULI-TECH@gmail.com" onClick={() => setOpen(false)} className="mt-3 text-sm text-cyan-300">
            Écrire à l'équipe →
          </a>
        </nav>
      )}
    </header>
  );
}