/**
 * The poster's own REPLAY wordmark, as outlines — ui.md §1.4.
 *
 * Path data lifted verbatim from assets/wordmarks.json, which is where the asset suite
 * cut it from Archivo Black. Using outlines rather than a webfont means the boot handoff
 * cannot depend on a font load: a fallback face would change the glyph shapes and the
 * box match, and the box match is the whole point of the handoff.
 *
 * Metrics: advance 144 + 274.6 = 418.6 over cap height 66,
 * an aspect of 6.342. The bulb wordmark is 175 x 28 lamps = 6.25.
 * They match to 1.5%, which is what the wordmark's 7 columns of tracking were chosen for,
 * and the residual is split evenly by vertical centring.
 */
export const WORDMARK_ADV = 418.6;
export const WORDMARK_CAP = 66;
/** lamp dimensions of the bulb wordmark this must superimpose on */
export const WORDMARK_LAMPS = { w: 175, h: 28 };

export const WORDMARK_PATHS: ReadonlyArray<{ x: number; d: string }> = [
  { x: 0, d: 'M69.8-45.8Q69.8-39.7 66.5-34.8Q63.3-30 57-27.6L71.7 0L47.9 0L36.2-24.1L28.3-24.1L28.3 0L7.1 0L7.1-66L47.5-66Q54.6-66 59.7-63.3Q64.7-60.6 67.2-55.9Q69.8-51.3 69.8-45.8M48.2-44.9Q48.2-47.5 46.5-49.2Q44.7-51 42.2-51L28.3-51L28.3-38.8L42.2-38.8Q44.7-38.8 46.5-40.6Q48.2-42.3 48.2-44.9M81.8 0L81.8-66L138.9-66L138.9-50.2L103-50.2L103-41.1L133.7-41.1L133.7-25.9L103-25.9L103-15.8L139.6-15.8L139.6 0' },
  { x: 144, d: 'M44.2-66Q50.3-66 55.1-63.2Q59.9-60.4 62.6-55.4Q65.3-50.5 65.3-44.4L65.3-43.1Q65.3-37 62.6-32Q59.9-27 55.1-24.1Q50.3-21.3 44.2-21.3L28.3-21.3L28.3 0L7.1 0L7.1-66L44.2-66M28.3-50.4L28.3-36.8L37.1-36.8Q40.4-36.8 42.1-38.5Q43.8-40.2 43.8-43.2L43.8-44Q43.8-47 42.1-48.7Q40.4-50.4 37.1-50.4L28.3-50.4M76.4 0L76.4-66L97.6-66L97.6-16.9L131.5-16.9L131.5 0L76.4 0M207.2 0L184.7 0L181.9-9.3L158.8-9.3L156 0L134.3 0L158.4-66L183.1-66L207.2 0M170.2-47.6L163.2-24.1L177.5-24.1L170.6-47.6L170.2-47.6M248-25.6L248 0L226.8 0L226.8-25.6L200.5-66L224.9-66L237.6-44.1L238-44.1L250.7-66L273.8-66' },
];
