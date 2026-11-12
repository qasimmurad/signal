/**
 * Every tunable number in one place. Angles are degrees; distances are fractions of palm width
 * (distance between the index and pinky knuckles). Press D in play mode to see live values.
 */
export const T = {
  curl: {
    /** total bend (MCP + PIP + DIP) below this = extended */
    extendedMax: 70,
    /** total bend below this = half, above = curled */
    halfMax: 185,
    /** slack the recognizer allows around each boundary */
    slack: 20,
  },
  thumb: {
    extendedMax: 45,
    halfMax: 95,
    /** minimum position score to accept the spec's thumb position */
    acceptScore: 0.45,
  },
  spread: {
    /** adjacent fingers further apart than this are "spread" */
    apart: 15,
    /** adjacent fingers closer than this are "together" */
    together: 11,
  },
  touch: {
    /** fingertips closer than this (palm widths) are touching */
    max: 0.42,
  },
  palm: {
    /** |normal.z| above this = squarely forward/back */
    frontal: 0.55,
    /** recognizer tolerance: forward accepted when normal.z < -lenient */
    lenient: 0.25,
  },
  direction: {
    /** max angular error (degrees) when checking up/side/down */
    tolerance: 50,
    /** first joint closer to the camera than the knuckle by this many palm widths = pointing forward */
    forwardDepth: 0.25,
  },
  game: {
    /** how long a correct static sign must be held to lock the letter */
    holdMs: 700,
    /** no hand for this long = "show me your hand" */
    staleMs: 300,
    /** window examined for motion letters */
    motionWindowMs: 1600,
    /** seconds between letters that still count toward the combo */
    comboWindowMs: 6000,
    xpPerLetter: 10,
    xpPerWordBonus: 25,
    xpPerLevel: 100,
  },
} as const;
