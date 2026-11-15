export type ItemCategory =
  | 'resource'
  | 'tool'
  | 'consumable'
  | 'structure'
  | 'module'
  | 'suit'
  | 'medical';

export interface ItemDefinition {
  id: string;
  tier: 1 | 2 | 3 | 4 | 5;
  category: ItemCategory;
  stackable: boolean;
  maxStack: number;
  weight: number; // kg per unit
  maxDurability?: number;
  iconType: string;
  color: string;
}

export const ITEMS: Record<string, ItemDefinition> = {
  // === TIER 1: Raw Primordial Resources & Starter Gear ===
  basalt_rock: { id: 'basalt_rock', tier: 1, category: 'resource', stackable: true, maxStack: 50, weight: 0.6, iconType: 'rock', color: '#78716c' },
  sulfur_mineral: { id: 'sulfur_mineral', tier: 1, category: 'resource', stackable: true, maxStack: 50, weight: 0.5, iconType: 'mineral', color: '#eab308' },
  ash_clay: { id: 'ash_clay', tier: 1, category: 'resource', stackable: true, maxStack: 50, weight: 0.4, iconType: 'clay', color: '#a8a29e' },
  silicate_sand: { id: 'silicate_sand', tier: 1, category: 'resource', stackable: true, maxStack: 50, weight: 0.35, iconType: 'sand', color: '#d6b48c' },
  purified_water: { id: 'purified_water', tier: 1, category: 'consumable', stackable: true, maxStack: 10, weight: 0.5, iconType: 'vessel', color: '#38bdf8' },
  stone_axe: { id: 'stone_axe', tier: 1, category: 'tool', stackable: false, maxStack: 1, weight: 1.8, maxDurability: 60, iconType: 'axe', color: '#a8a29e' },
  water_vessel: { id: 'water_vessel', tier: 1, category: 'consumable', stackable: false, maxStack: 1, weight: 1.0, maxDurability: 20, iconType: 'vessel', color: '#38bdf8' },
  campfire_kit: { id: 'campfire_kit', tier: 1, category: 'structure', stackable: true, maxStack: 5, weight: 2.5, iconType: 'fire', color: '#ef4444' },
  basic_shelter: { id: 'basic_shelter', tier: 1, category: 'structure', stackable: true, maxStack: 5, weight: 4.0, iconType: 'shelter', color: '#d6d3d1' },
  ash_cloak: { id: 'ash_cloak', tier: 1, category: 'suit', stackable: false, maxStack: 1, weight: 1.2, iconType: 'suit', color: '#a8a29e' },

  // === TIER 2: Obsidian, Insulation & Stations ===
  obsidian_shard: { id: 'obsidian_shard', tier: 2, category: 'resource', stackable: true, maxStack: 40, weight: 0.45, iconType: 'shard', color: '#312e81' },
  thermal_salt: { id: 'thermal_salt', tier: 2, category: 'resource', stackable: true, maxStack: 40, weight: 0.3, iconType: 'salt', color: '#fde68a' },
  iron_slag: { id: 'iron_slag', tier: 2, category: 'resource', stackable: true, maxStack: 40, weight: 0.7, iconType: 'mineral', color: '#9a3412' },
  heat_shield: { id: 'heat_shield', tier: 2, category: 'tool', stackable: false, maxStack: 1, weight: 2.4, maxDurability: 100, iconType: 'shield', color: '#f97316' },
  obsidian_pick: { id: 'obsidian_pick', tier: 2, category: 'tool', stackable: false, maxStack: 1, weight: 2.1, maxDurability: 110, iconType: 'axe', color: '#6366f1' },
  gas_filter: { id: 'gas_filter', tier: 2, category: 'consumable', stackable: true, maxStack: 6, weight: 0.4, iconType: 'filter', color: '#22c55e' },
  mineral_bandage: { id: 'mineral_bandage', tier: 2, category: 'medical', stackable: true, maxStack: 10, weight: 0.2, iconType: 'med', color: '#f87171' },
  burn_salve: { id: 'burn_salve', tier: 2, category: 'medical', stackable: true, maxStack: 10, weight: 0.2, iconType: 'med', color: '#fb923c' },
  workbench: { id: 'workbench', tier: 2, category: 'structure', stackable: true, maxStack: 3, weight: 5.0, iconType: 'station', color: '#d97706' },
  storage_chest: { id: 'storage_chest', tier: 2, category: 'structure', stackable: true, maxStack: 5, weight: 3.5, iconType: 'chest', color: '#b45309' },

  // === TIER 3: Modular Building, Metallurgy & Thermal Gear ===
  refined_iron: { id: 'refined_iron', tier: 3, category: 'resource', stackable: true, maxStack: 30, weight: 0.8, iconType: 'ingot', color: '#cbd5e1' },
  basalt_brick: { id: 'basalt_brick', tier: 3, category: 'resource', stackable: true, maxStack: 50, weight: 0.65, iconType: 'brick', color: '#57534e' },
  silica_glass: { id: 'silica_glass', tier: 3, category: 'resource', stackable: true, maxStack: 30, weight: 0.35, iconType: 'glass', color: '#bae6fd' },
  smelter_furnace: { id: 'smelter_furnace', tier: 3, category: 'structure', stackable: true, maxStack: 3, weight: 6.0, iconType: 'fire', color: '#f97316' },
  water_collector: { id: 'water_collector', tier: 3, category: 'structure', stackable: true, maxStack: 4, weight: 3.5, iconType: 'vessel', color: '#0ea5e9' },
  garden_plot: { id: 'garden_plot', tier: 3, category: 'structure', stackable: true, maxStack: 4, weight: 4.0, iconType: 'seed', color: '#65a30d' },
  auto_drill: { id: 'auto_drill', tier: 4, category: 'structure', stackable: true, maxStack: 3, weight: 5.0, iconType: 'station', color: '#38bdf8' },
  floor_tile: { id: 'floor_tile', tier: 3, category: 'module', stackable: true, maxStack: 20, weight: 1.5, iconType: 'module', color: '#78716c' },
  wall_panel: { id: 'wall_panel', tier: 3, category: 'module', stackable: true, maxStack: 20, weight: 1.8, iconType: 'module', color: '#57534e' },
  roof_panel: { id: 'roof_panel', tier: 3, category: 'module', stackable: true, maxStack: 20, weight: 1.6, iconType: 'shelter', color: '#a8a29e' },
  door_frame: { id: 'door_frame', tier: 3, category: 'module', stackable: true, maxStack: 10, weight: 1.8, iconType: 'module', color: '#d97706' },
  thermal_cloak: { id: 'thermal_cloak', tier: 3, category: 'suit', stackable: false, maxStack: 1, weight: 1.8, iconType: 'suit', color: '#ea580c' },
  expedition_pack: { id: 'expedition_pack', tier: 3, category: 'suit', stackable: false, maxStack: 1, weight: 0.5, iconType: 'pack', color: '#f59e0b' },

  // === TIER 4: Meteorite Tech, Crystals & Beacons ===
  primordial_crystal: { id: 'primordial_crystal', tier: 4, category: 'resource', stackable: true, maxStack: 25, weight: 0.4, iconType: 'crystal', color: '#fb923c' },
  meteor_iron: { id: 'meteor_iron', tier: 4, category: 'resource', stackable: true, maxStack: 25, weight: 0.9, iconType: 'ingot', color: '#60a5fa' },
  crystal_core: { id: 'crystal_core', tier: 4, category: 'resource', stackable: true, maxStack: 10, weight: 0.6, iconType: 'crystal', color: '#facc15' },
  rad_scrubber: { id: 'rad_scrubber', tier: 4, category: 'medical', stackable: true, maxStack: 8, weight: 0.25, iconType: 'med', color: '#34d399' },
  meteor_drill: { id: 'meteor_drill', tier: 4, category: 'tool', stackable: false, maxStack: 1, weight: 2.6, maxDurability: 220, iconType: 'axe', color: '#38bdf8' },
  research_station: { id: 'research_station', tier: 4, category: 'structure', stackable: true, maxStack: 2, weight: 5.5, iconType: 'station', color: '#38bdf8' },
  terrain_anchor: { id: 'terrain_anchor', tier: 4, category: 'structure', stackable: true, maxStack: 3, weight: 6.0, iconType: 'beacon', color: '#a78bfa' },
  fast_beacon: { id: 'fast_beacon', tier: 4, category: 'structure', stackable: true, maxStack: 6, weight: 3.0, iconType: 'beacon', color: '#facc15' },
  hazmat_lining: { id: 'hazmat_lining', tier: 4, category: 'suit', stackable: false, maxStack: 1, weight: 1.5, iconType: 'suit', color: '#10b981' },

  // === TIER 5: Archean Synthesis & Seed of Life ===
  amino_compound: { id: 'amino_compound', tier: 5, category: 'resource', stackable: true, maxStack: 10, weight: 0.25, iconType: 'flask', color: '#a78bfa' },
  lipid_membrane: { id: 'lipid_membrane', tier: 5, category: 'resource', stackable: true, maxStack: 10, weight: 0.25, iconType: 'flask', color: '#34d399' },
  stabilizer_cell: { id: 'stabilizer_cell', tier: 5, category: 'resource', stackable: true, maxStack: 5, weight: 0.8, iconType: 'crystal', color: '#38bdf8' },
  seed_of_life: { id: 'seed_of_life', tier: 5, category: 'consumable', stackable: false, maxStack: 1, weight: 1.2, iconType: 'seed', color: '#4ade80' },
};
