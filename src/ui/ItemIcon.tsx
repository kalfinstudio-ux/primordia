import React from 'react';

export function PrimordiaEmblem({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <polygon points="24,4 44,38 4,38" stroke="#ea580c" strokeWidth="2.5" fill="#1c1512" />
      <polygon points="24,13 33,34 15,34" fill="#ea580c" opacity="0.28" />
      <path d="M19 26 L24 14 L29 26 L24 22 Z" fill="#f97316" />
      <line x1="8" y1="42" x2="40" y2="42" stroke="#f59e0b" strokeWidth="2" />
    </svg>
  );
}

export function ItemIcon({ iconType, color = '#f97316' }: { iconType: string; color?: string }) {
  switch (iconType) {
    case 'rock':
    case 'brick':
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden="true">
          <polygon points="5,18 3,11 9,5 17,6 21,13 18,19" fill={color} stroke="#1c1917" strokeWidth="1.5" />
          <polyline points="9,5 11,12 18,19" stroke="#d6d3d1" strokeWidth="1" opacity="0.5" />
        </svg>
      );
    case 'mineral':
    case 'salt':
    case 'clay':
    case 'sand':
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden="true">
          <polygon points="12,3 20,9 17,20 7,20 4,9" fill="#44403c" stroke="#1c1917" strokeWidth="1.5" />
          <polygon points="12,5 16,10 12,17 8,10" fill={color} />
        </svg>
      );
    case 'crystal':
    case 'shard':
    case 'glass':
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden="true">
          <polygon points="12,2 17,9 15,21 9,21 7,9" fill={color} stroke="#fff7ed" strokeWidth="1.2" />
          <line x1="12" y1="2" x2="12" y2="21" stroke="#fed7aa" strokeWidth="1" opacity="0.7" />
        </svg>
      );
    case 'axe':
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden="true">
          <line x1="6" y1="20" x2="17" y2="6" stroke="#a8a29e" strokeWidth="2.5" strokeLinecap="round" />
          <polygon points="12,5 20,7 18,13 13,10" fill={color} stroke="#1c1917" strokeWidth="1.2" />
        </svg>
      );
    case 'vessel':
    case 'flask':
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden="true">
          <rect x="9" y="3" width="6" height="3" rx="1" fill="#78716c" />
          <path d="M7 8 C5 12 6 20 12 20 C18 20 19 12 17 8 Z" fill={color} stroke="#0c4a6e" strokeWidth="1.4" />
        </svg>
      );
    case 'shield':
    case 'suit':
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden="true">
          <path d="M12 3 L20 6 V12 C20 16.5 16.5 19.8 12 21 C7.5 19.8 4 16.5 4 12 V6 Z" fill={color} stroke="#1c1917" strokeWidth="1.5" />
          <path d="M12 6 L12 18" stroke="#fef3c7" strokeWidth="1.4" opacity="0.7" />
        </svg>
      );
    case 'shelter':
    case 'module':
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden="true">
          <polygon points="12,4 22,13 20,13 20,20 4,20 4,13 2,13" fill="#44403c" stroke={color} strokeWidth="1.5" />
          <rect x="10" y="13" width="4" height="7" fill="#ea580c" />
        </svg>
      );
    case 'station':
    case 'chest':
    case 'pack':
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden="true">
          <rect x="4" y="6" width="16" height="13" rx="2" fill="#292524" stroke={color} strokeWidth="1.6" />
          <line x1="4" y1="11" x2="20" y2="11" stroke={color} strokeWidth="1.4" />
          <rect x="10" y="9" width="4" height="4" fill="#fbbf24" />
        </svg>
      );
    case 'ingot':
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden="true">
          <polygon points="5,16 8,8 19,8 16,16" fill={color} stroke="#1c1917" strokeWidth="1.4" />
          <polygon points="3,18 6,11 17,11 14,18" fill={color} opacity="0.75" />
        </svg>
      );
    case 'filter':
    case 'med':
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="3" fill="#292524" stroke={color} strokeWidth="1.5" />
          <path d="M12 8 V16 M8 12 H16" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'beacon':
    case 'seed':
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="7" stroke={color} strokeWidth="1.6" />
          <circle cx="12" cy="12" r="3" fill={color} />
          <line x1="12" y1="2" x2="12" y2="6" stroke={color} strokeWidth="1.5" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" aria-hidden="true">
          <path d="M12 3 C15 8 18 11 16 17 C14 20 10 20 8 17 C6 12 9 8 12 3 Z" fill={color} />
          <line x1="6" y1="20" x2="18" y2="20" stroke="#78716c" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
  }
}
