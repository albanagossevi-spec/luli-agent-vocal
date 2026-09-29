// Logo LULI-TECH — le nœud tripartite (coworking · digital · entrepreneuriat)
export default function NodeMark({ className = 'w-10 h-10' }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path d="M30 35 L70 35" stroke="#64748b" strokeWidth="4" strokeDasharray="2 3" opacity="0.7" />
      <path d="M30 35 L50 75" stroke="#22d3ee" strokeWidth="5" />
      <path d="M70 35 L50 75" stroke="#818cf8" strokeWidth="5" />
      <path d="M50 50 L50 75" stroke="#a855f7" strokeWidth="4" />
      <circle cx="30" cy="35" r="9" fill="#22d3ee" />
      <circle cx="70" cy="35" r="9" fill="#818cf8" />
      <circle cx="50" cy="75" r="10" fill="#c084fc" />
      <circle cx="30" cy="35" r="4" fill="#0a0d14" />
      <circle cx="70" cy="35" r="4" fill="#0a0d14" />
      <circle cx="50" cy="75" r="5" fill="#0a0d14" />
    </svg>
  );
}