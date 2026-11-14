export type StationType = 'workbench' | 'smelter_furnace' | 'research_station';

export interface CraftingRecipe {
  id: string;
  tier: 1 | 2 | 3 | 4 | 5;
  outputId: string;
  outputQty: number;
  stationRequired?: StationType;
  discoveredByDefault?: boolean;
  unlocksOnItem?: string;
  ingredients: Array<{ itemId: string; qty: number }>;
}

export const RECIPES: CraftingRecipe[] = [
  // === TIER 1 (Hand-Craftable Anywhere) ===
  {
    id: 'recipe_stone_axe',
    tier: 1,
    outputId: 'stone_axe',
    outputQty: 1,
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'basalt_rock', qty: 2 },
      { itemId: 'sulfur_mineral', qty: 1 },
    ],
  },
  {
    id: 'recipe_water_vessel',
    tier: 1,
    outputId: 'water_vessel',
    outputQty: 1,
    discoveredByDefault: true,
    ingredients: [{ itemId: 'basalt_rock', qty: 2 }],
  },
  {
    id: 'recipe_campfire_kit',
    tier: 1,
    outputId: 'campfire_kit',
    outputQty: 1,
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'basalt_rock', qty: 2 },
      { itemId: 'sulfur_mineral', qty: 1 },
    ],
  },
  {
    id: 'recipe_basic_shelter',
    tier: 1,
    outputId: 'basic_shelter',
    outputQty: 1,
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'basalt_rock', qty: 4 },
      { itemId: 'sulfur_mineral', qty: 1 },
    ],
  },
  {
    id: 'recipe_workbench',
    tier: 1,
    outputId: 'workbench',
    outputQty: 1,
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'basalt_rock', qty: 5 },
      { itemId: 'ash_clay', qty: 2 },
    ],
  },
  {
    id: 'recipe_purified_water',
    tier: 1,
    outputId: 'purified_water',
    outputQty: 2,
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'ash_clay', qty: 1 },
      { itemId: 'thermal_salt', qty: 1 },
    ],
  },

  // === TIER 2 (Field & Workbench) ===
  {
    id: 'recipe_heat_shield',
    tier: 2,
    outputId: 'heat_shield',
    outputQty: 1,
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'basalt_rock', qty: 2 },
      { itemId: 'sulfur_mineral', qty: 2 },
    ],
  },
  {
    id: 'recipe_obsidian_pick',
    tier: 2,
    outputId: 'obsidian_pick',
    outputQty: 1,
    stationRequired: 'workbench',
    unlocksOnItem: 'obsidian_shard',
    ingredients: [
      { itemId: 'obsidian_shard', qty: 3 },
      { itemId: 'basalt_rock', qty: 2 },
    ],
  },
  {
    id: 'recipe_gas_filter',
    tier: 2,
    outputId: 'gas_filter',
    outputQty: 2,
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'ash_clay', qty: 2 },
      { itemId: 'thermal_salt', qty: 1 },
    ],
  },
  {
    id: 'recipe_mineral_bandage',
    tier: 2,
    outputId: 'mineral_bandage',
    outputQty: 2,
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'ash_clay', qty: 2 },
      { itemId: 'sulfur_mineral', qty: 1 },
    ],
  },
  {
    id: 'recipe_burn_salve',
    tier: 2,
    outputId: 'burn_salve',
    outputQty: 2,
    unlocksOnItem: 'thermal_salt',
    ingredients: [
      { itemId: 'thermal_salt', qty: 2 },
      { itemId: 'ash_clay', qty: 1 },
    ],
  },
  {
    id: 'recipe_storage_chest',
    tier: 2,
    outputId: 'storage_chest',
    outputQty: 1,
    stationRequired: 'workbench',
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'basalt_rock', qty: 4 },
      { itemId: 'iron_slag', qty: 2 },
    ],
  },
  {
    id: 'recipe_smelter_furnace',
    tier: 2,
    outputId: 'smelter_furnace',
    outputQty: 1,
    stationRequired: 'workbench',
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'basalt_rock', qty: 6 },
      { itemId: 'ash_clay', qty: 4 },
      { itemId: 'sulfur_mineral', qty: 2 },
    ],
  },

  // === TIER 3 (Metallurgy & Modular Habitat) ===
  {
    id: 'recipe_refined_iron',
    tier: 3,
    outputId: 'refined_iron',
    outputQty: 2,
    stationRequired: 'smelter_furnace',
    unlocksOnItem: 'iron_slag',
    ingredients: [
      { itemId: 'iron_slag', qty: 3 },
      { itemId: 'sulfur_mineral', qty: 1 },
    ],
  },
  {
    id: 'recipe_basalt_brick',
    tier: 3,
    outputId: 'basalt_brick',
    outputQty: 4,
    stationRequired: 'workbench',
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'basalt_rock', qty: 4 },
      { itemId: 'ash_clay', qty: 2 },
    ],
  },
  {
    id: 'recipe_silica_glass',
    tier: 3,
    outputId: 'silica_glass',
    outputQty: 2,
    stationRequired: 'smelter_furnace',
    unlocksOnItem: 'silicate_sand',
    ingredients: [{ itemId: 'silicate_sand', qty: 3 }],
  },
  {
    id: 'recipe_water_collector',
    tier: 3,
    outputId: 'water_collector',
    outputQty: 1,
    stationRequired: 'workbench',
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'refined_iron', qty: 2 },
      { itemId: 'silica_glass', qty: 2 },
    ],
  },
  {
    id: 'recipe_garden_plot',
    tier: 3,
    outputId: 'garden_plot',
    outputQty: 1,
    stationRequired: 'workbench',
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'ash_clay', qty: 6 },
      { itemId: 'thermal_salt', qty: 2 },
      { itemId: 'silicate_sand', qty: 3 },
    ],
  },
  {
    id: 'recipe_auto_drill',
    tier: 4,
    outputId: 'auto_drill',
    outputQty: 1,
    stationRequired: 'workbench',
    unlocksOnItem: 'refined_iron',
    ingredients: [
      { itemId: 'refined_iron', qty: 3 },
      { itemId: 'obsidian_shard', qty: 2 },
      { itemId: 'silica_glass', qty: 1 },
    ],
  },
  {
    id: 'recipe_floor_tile',
    tier: 3,
    outputId: 'floor_tile',
    outputQty: 2,
    stationRequired: 'workbench',
    discoveredByDefault: true,
    ingredients: [{ itemId: 'basalt_brick', qty: 2 }],
  },
  {
    id: 'recipe_wall_panel',
    tier: 3,
    outputId: 'wall_panel',
    outputQty: 2,
    stationRequired: 'workbench',
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'basalt_brick', qty: 2 },
      { itemId: 'iron_slag', qty: 1 },
    ],
  },
  {
    id: 'recipe_roof_panel',
    tier: 3,
    outputId: 'roof_panel',
    outputQty: 2,
    stationRequired: 'workbench',
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'basalt_brick', qty: 2 },
      { itemId: 'obsidian_shard', qty: 1 },
    ],
  },
  {
    id: 'recipe_door_frame',
    tier: 3,
    outputId: 'door_frame',
    outputQty: 1,
    stationRequired: 'workbench',
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'basalt_brick', qty: 2 },
      { itemId: 'refined_iron', qty: 1 },
    ],
  },
  {
    id: 'recipe_thermal_cloak',
    tier: 3,
    outputId: 'thermal_cloak',
    outputQty: 1,
    stationRequired: 'workbench',
    unlocksOnItem: 'obsidian_shard',
    ingredients: [
      { itemId: 'obsidian_shard', qty: 3 },
      { itemId: 'refined_iron', qty: 2 },
      { itemId: 'ash_clay', qty: 2 },
    ],
  },
  {
    id: 'recipe_expedition_pack',
    tier: 3,
    outputId: 'expedition_pack',
    outputQty: 1,
    stationRequired: 'workbench',
    discoveredByDefault: true,
    ingredients: [
      { itemId: 'refined_iron', qty: 2 },
      { itemId: 'ash_clay', qty: 3 },
    ],
  },

  // === TIER 4 (Meteorite & Crystal Engineering) ===
  {
    id: 'recipe_research_station',
    tier: 4,
    outputId: 'research_station',
    outputQty: 1,
    stationRequired: 'workbench',
    unlocksOnItem: 'primordial_crystal',
    ingredients: [
      { itemId: 'refined_iron', qty: 4 },
      { itemId: 'silica_glass', qty: 3 },
      { itemId: 'primordial_crystal', qty: 2 },
    ],
  },
  {
    id: 'recipe_crystal_core',
    tier: 4,
    outputId: 'crystal_core',
    outputQty: 1,
    stationRequired: 'smelter_furnace',
    unlocksOnItem: 'primordial_crystal',
    ingredients: [
      { itemId: 'primordial_crystal', qty: 2 },
      { itemId: 'refined_iron', qty: 2 },
    ],
  },
  {
    id: 'recipe_meteor_drill',
    tier: 4,
    outputId: 'meteor_drill',
    outputQty: 1,
    stationRequired: 'research_station',
    unlocksOnItem: 'meteor_iron',
    ingredients: [
      { itemId: 'meteor_iron', qty: 3 },
      { itemId: 'crystal_core', qty: 1 },
      { itemId: 'refined_iron', qty: 2 },
    ],
  },
  {
    id: 'recipe_terrain_anchor',
    tier: 4,
    outputId: 'terrain_anchor',
    outputQty: 1,
    stationRequired: 'research_station',
    unlocksOnItem: 'crystal_core',
    ingredients: [
      { itemId: 'crystal_core', qty: 3 },
      { itemId: 'meteor_iron', qty: 4 },
      { itemId: 'basalt_brick', qty: 6 },
    ],
  },
  {
    id: 'recipe_fast_beacon',
    tier: 4,
    outputId: 'fast_beacon',
    outputQty: 1,
    stationRequired: 'research_station',
    unlocksOnItem: 'crystal_core',
    ingredients: [
      { itemId: 'crystal_core', qty: 1 },
      { itemId: 'meteor_iron', qty: 2 },
      { itemId: 'basalt_brick', qty: 2 },
    ],
  },
  {
    id: 'recipe_rad_scrubber',
    tier: 4,
    outputId: 'rad_scrubber',
    outputQty: 2,
    stationRequired: 'research_station',
    unlocksOnItem: 'meteor_iron',
    ingredients: [
      { itemId: 'thermal_salt', qty: 2 },
      { itemId: 'primordial_crystal', qty: 1 },
    ],
  },
  {
    id: 'recipe_hazmat_lining',
    tier: 4,
    outputId: 'hazmat_lining',
    outputQty: 1,
    stationRequired: 'research_station',
    unlocksOnItem: 'meteor_iron',
    ingredients: [
      { itemId: 'meteor_iron', qty: 2 },
      { itemId: 'silica_glass', qty: 2 },
      { itemId: 'thermal_salt', qty: 2 },
    ],
  },

  // === TIER 5 (Archean Synthesis — Seed of Life) ===
  {
    id: 'recipe_amino_compound',
    tier: 5,
    outputId: 'amino_compound',
    outputQty: 1,
    stationRequired: 'research_station',
    unlocksOnItem: 'crystal_core',
    ingredients: [
      { itemId: 'sulfur_mineral', qty: 3 },
      { itemId: 'thermal_salt', qty: 2 },
      { itemId: 'purified_water', qty: 2 },
    ],
  },
  {
    id: 'recipe_lipid_membrane',
    tier: 5,
    outputId: 'lipid_membrane',
    outputQty: 1,
    stationRequired: 'research_station',
    unlocksOnItem: 'amino_compound',
    ingredients: [
      { itemId: 'ash_clay', qty: 3 },
      { itemId: 'primordial_crystal', qty: 1 },
      { itemId: 'purified_water', qty: 1 },
    ],
  },
  {
    id: 'recipe_stabilizer_cell',
    tier: 5,
    outputId: 'stabilizer_cell',
    outputQty: 1,
    stationRequired: 'research_station',
    unlocksOnItem: 'meteor_iron',
    ingredients: [
      { itemId: 'crystal_core', qty: 1 },
      { itemId: 'meteor_iron', qty: 2 },
      { itemId: 'silica_glass', qty: 2 },
    ],
  },
  {
    id: 'recipe_seed_of_life',
    tier: 5,
    outputId: 'seed_of_life',
    outputQty: 1,
    stationRequired: 'research_station',
    unlocksOnItem: 'lipid_membrane',
    ingredients: [
      { itemId: 'amino_compound', qty: 1 },
      { itemId: 'lipid_membrane', qty: 1 },
      { itemId: 'stabilizer_cell', qty: 1 },
    ],
  },
];
