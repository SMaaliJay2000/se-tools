// Tunables for the heuristic rules, in one place.
export const THRESHOLDS = {
  inList: 100, // IN (...) items before large-in-list fires
  deepOffset: 1000, // OFFSET rows before deep-offset fires
  joins: 5, // JOINs in one SELECT before many-joins fires
  wideTable: 20, // columns before select-star-wide fires (schema rule)
};
