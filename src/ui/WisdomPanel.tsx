import { useState } from 'react';
import { gameState } from '../game/core/state';
import { eventBus } from '../game/core/eventBus';
import { saveGame } from '../game/systems/saveLoad';
import {
  WISDOM_PERKS, canBuyPerk, getImmortalAge, wisdomPointsEarned, wisdomPointsSpent,
} from '../game/data/eden';

/** Kebijaksanaan dari umur abadi: poin didapat dari umur nyata (7/30/100/365 hari). */
export function WisdomPanel() {
  const [, bump] = useState(0);
  const age = getImmortalAge(gameState.bornAtMs);
  const earned = wisdomPointsEarned(age.totalSeconds);
  const left = earned - wisdomPointsSpent(gameState.wisdomPerks);

  const buy = (id: string) => {
    if (!canBuyPerk(id, gameState.wisdomPerks, age.totalSeconds)) return;
    const perk = WISDOM_PERKS.find((p) => p.id === id)!;
    gameState.wisdomPerks = [...gameState.wisdomPerks, id];
    for (const r of perk.unlockRecipes ?? []) {
      if (!gameState.unlockedRecipes.includes(r)) gameState.unlockedRecipes = [...gameState.unlockedRecipes, r];
    }
    saveGame(true);
    eventBus.emit('toast:show', { text: `Kebijaksanaan terbuka: ${perk.name}`, type: 'success' });
    bump((n) => n + 1);
  };

  return (
    <div className="mt-4 rounded-lg border border-stone-800 bg-stone-950/60 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-amber-300">♾ Kebijaksanaan</span>
        <span className="text-[11px] text-stone-300">Poin: {left} (dari {earned})</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-stone-400">
        Umurmu {age.years} thn {age.days} hr. Poin bertambah di umur 7, 30, 100, dan 365 hari.
      </p>
      <div className="mt-2 flex flex-col gap-1.5">
        {WISDOM_PERKS.map((p) => {
          const owned = gameState.wisdomPerks.includes(p.id);
          const can = canBuyPerk(p.id, gameState.wisdomPerks, age.totalSeconds);
          return (
            <button
              key={p.id}
              type="button"
              disabled={owned || !can}
              onClick={() => buy(p.id)}
              className={`rounded-md border px-2.5 py-1.5 text-left text-[11px] ${
                owned ? 'border-emerald-700 text-emerald-300' : can ? 'border-amber-600 text-stone-100' : 'border-stone-800 text-stone-500'
              }`}
            >
              <span className="font-semibold">{owned ? '✓ ' : ''}{p.name}</span>
              <span className="float-right">{owned ? 'Dimiliki' : `${p.cost} poin`}</span>
              <span className="block text-stone-400">{p.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
