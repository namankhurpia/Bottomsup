import { LEVEL as canal } from './level.js';
import { PLANK as plank } from './plank.js';
import { RAPIDS as rapids } from './rapids.js';
import { POND as pond } from './pond.js';

export const LEVELS = { pond, canal, plank, rapids };

// Race levels in play order. Finishing one unlocks the next. Add new levels here.
export const RACE_LEVELS = ['canal', 'plank', 'rapids'];

export const nextLevel = (id) => RACE_LEVELS[RACE_LEVELS.indexOf(id) + 1] || null;
