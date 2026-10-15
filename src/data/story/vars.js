/**
 * Story variables of the scenario package (docs/story/05_implementation_notes.md). Names are the
 * package's own. They live in `state.vars`; set with { setVar: [name, value] } / { addVar: [name, delta, min, max] },
 * read with { var: [name, op, value] } / { v: name } / { nv: name }. Unset = false / 0 / ''.
 * tools/story/check.mjs rejects scenes that use a name that is not declared here.
 */
export const VARS = {
  // chapters 0-4
  MARTA_BAGS: 'bool', // carried the two bags for Marta (A00)
  MARTA_FLOUR: 'bool', // answered A00.1 with the flour remark (Marta remembers it in C12)
  ROXY_TRUST: [-3, 6], // trust of Roxy, clamped
  ROXY_PROMISE: 'bool', // promised no explosions in the ruins (A22)
  ROXY_START: ['argument'], // how the promise was given (A22.2)
  ROXY_EXPLOSION: 'bool', // exploded before the ritual (the measuring stand fell)
  ROXY_REPAIR: 'bool', // helped to put the stand back (A24)
  ROXY_ACCOUNTABILITY: 'bool', // admitted the mistake (A24 options 1 and 3)
  BERNARD_PROMISE: 'bool', // promised Bernard to keep the notes secret (A12.1)
  BERNARD_SHARE: ['agreed', 'undecided'],
  BERNARD_BROKEN: 'bool', // told Lina after promising (A13)
  MIA_KIND: 'bool', // refused Mia's savings (B02c)
  MIA_SUPPORT: 'bool',
  EDMUND_FIELD_NOTE: 'bool', // drew the stump (A16.2)
  // chapters 5-10
  PUBLIC_REPORT: 'bool',
  C07_PLAN: ['dan', 'osa', 'guard'], // how the workers were got out (C07.1)
  C08_CHOICE: ['copies', 'council', 'orin'], // what was done with the documents (C08.1)
  KHARZ_ROUTE: ['treaty', 'battle'],
  WATER_FIRST: ['residents', 'repair'],
  VEYR_HELP: 'bool',
  ENDING: ['closure', 'rebuild'],
  // side stories (set when the order is handed in; they change support and epilogues only)
  ROXY_WATER: 'bool',
  MARTA_BRIDGE: 'bool',
  GARRET_RECORD: 'bool',
  FENRIK_NAMES: 'bool',
  BORIS_GATE: 'bool',
  RANN_NESTS: 'bool',
  EDMUND_TEAM: 'bool',
  CLARA_RECORD: 'bool',
  TOBIAS_ROAD: 'bool',
  AXEL_SHELTER: 'bool',
  IVO_HELP: 'bool',
  BORIS_NIGHT: 'bool',
};
