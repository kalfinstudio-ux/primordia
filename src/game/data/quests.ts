export interface QuestDefinition {
  id: string;
  order: number;
  chapter: 1 | 2 | 3 | 4 | 5;
}

export interface AchievementDef {
  id: string;
  icon: string;
}

export interface JournalEntryDef {
  id: string;
  category: 'biome' | 'mineral' | 'phenomenon';
}

export const CAMPAIGN_QUESTS: QuestDefinition[] = [
  { id: 'q1', order: 1, chapter: 1 },
  { id: 'q2', order: 2, chapter: 1 },
  { id: 'q3', order: 3, chapter: 1 },
  { id: 'q4', order: 4, chapter: 1 },
  { id: 'q5', order: 5, chapter: 1 },
  { id: 'q6', order: 6, chapter: 2 },
  { id: 'q7', order: 7, chapter: 2 },
  { id: 'q8', order: 8, chapter: 2 },
  { id: 'q9', order: 9, chapter: 2 },
  { id: 'q10', order: 10, chapter: 2 },
  { id: 'q11', order: 11, chapter: 3 },
  { id: 'q12', order: 12, chapter: 3 },
  { id: 'q13', order: 13, chapter: 3 },
  { id: 'q14', order: 14, chapter: 3 },
  { id: 'q15', order: 15, chapter: 4 },
  { id: 'q16', order: 16, chapter: 4 },
  { id: 'q17', order: 17, chapter: 4 },
  { id: 'q18', order: 18, chapter: 4 },
  { id: 'q19', order: 19, chapter: 5 },
  { id: 'q20', order: 20, chapter: 5 },
  { id: 'q21', order: 21, chapter: 5 },
  { id: 'q22', order: 22, chapter: 5 },
];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'ach_first_water', icon: 'water' },
  { id: 'ach_first_shelter', icon: 'shelter' },
  { id: 'ach_crystal_finder', icon: 'crystal' },
  { id: 'ach_biome_walker', icon: 'compass' },
  { id: 'ach_metallurgist', icon: 'ingot' },
  { id: 'ach_modular_architect', icon: 'module' },
  { id: 'ach_beacon_network', icon: 'beacon' },
  { id: 'ach_seed_of_life', icon: 'seed' },
];

export const JOURNAL_ENTRIES: JournalEntryDef[] = [
  { id: 'j_basalt', category: 'biome' },
  { id: 'j_ocean', category: 'biome' },
  { id: 'j_volcano', category: 'biome' },
  { id: 'j_sulfur', category: 'biome' },
  { id: 'j_obsidian', category: 'biome' },
  { id: 'j_geyser', category: 'biome' },
  { id: 'j_crater', category: 'biome' },
  { id: 'j_meteor', category: 'biome' },
  { id: 'j_crystal', category: 'mineral' },
  { id: 'j_meteor_iron', category: 'mineral' },
  { id: 'j_thermal_salt', category: 'mineral' },
  { id: 'j_quake', category: 'phenomenon' },
  { id: 'j_ash_storm', category: 'phenomenon' },
  { id: 'j_acid_rain', category: 'phenomenon' },
];
