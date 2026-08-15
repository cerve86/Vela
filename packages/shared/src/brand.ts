/**
 * The Vela mark — "Sloop": a mainsail and a jib on a shared mast.
 *
 * Geometry lives here as raw path data rather than as an asset, because the same two
 * shapes have to be drawn by three different renderers: SVG in the portal,
 * react-native-svg in the app, and sharp when rasterising the App Store icon. A checked-in
 * PNG would drift from the components the first time anyone nudged a curve.
 *
 * Both sails are steps of coral rather than coral + plum. The palette already spends its
 * contrast budget on that pair in the charts, and a two-hue logo would compete with the
 * data rather than frame it.
 *
 * Drawn on a 96 box, with the two sails' combined bounding box centred in it — 15..81 on
 * both axes. Centring the artwork rather than each shape is what stops the mark drifting
 * inside a squircle mask. The mast is the 6-unit gap between the sails: negative space,
 * never a stroke, so the mark holds together when it is 20px wide in a nav bar.
 */

export const BRAND_VIEWBOX = 96;

/** Jib: the smaller foresail. Its leech is the vertical edge facing the mast. */
export const SAIL_JIB =
  'M42 30 L42 81 L15 81 Q25 52 42 30 Z';

/** Mainsail: taller, deeper, and always the one that reads first. */
export const SAIL_MAIN =
  'M48 15 L48 81 L81 81 Q73 46 48 15 Z';

/**
 * Fills for the two sails in each context.
 *
 * `onLight` is the mark on cream or white; `onBrand` is the reversed mark on the coral
 * ground, where the jib has to stay clearly lighter than the mainsail or the two shapes
 * merge into one blob at icon sizes.
 */
export const BRAND_FILLS = {
  onLight: { jib: '#FF7B63', main: '#D93A24' },
  onBrand: { jib: '#FFC6B9', main: '#FFF4F1' },
  mono: { jib: '#000000', main: '#000000' },
} as const;

export type BrandFillMode = keyof typeof BRAND_FILLS;

/** The coral ground the reversed mark sits on — app icon, splash, favicon. */
export const BRAND_GROUND = '#D93A24';

/**
 * A complete standalone SVG document for the mark, used by the asset generator and
 * anywhere a string of SVG is easier than a component.
 *
 * `inset` is the share of the canvas left as breathing room. iOS masks the icon into a
 * squircle and clips the corners hard, so the sails are kept well inside that.
 */
export function brandSvg(opts: {
  size: number;
  mode?: BrandFillMode;
  ground?: string | null;
  inset?: number;
}): string {
  const { size, mode = 'onLight', ground = null, inset = 0 } = opts;
  const fills = BRAND_FILLS[mode];
  const scale = 1 - inset * 2;
  const offset = BRAND_VIEWBOX * inset;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${BRAND_VIEWBOX} ${BRAND_VIEWBOX}">`,
    ground ? `<rect width="${BRAND_VIEWBOX}" height="${BRAND_VIEWBOX}" fill="${ground}"/>` : '',
    `<g transform="translate(${offset} ${offset}) scale(${scale})">`,
    `<path d="${SAIL_JIB}" fill="${fills.jib}"/>`,
    `<path d="${SAIL_MAIN}" fill="${fills.main}"/>`,
    `</g>`,
    `</svg>`,
  ].join('');
}
