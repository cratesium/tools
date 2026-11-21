/**
 * Unit definitions with exact conversion factors to a base unit. Values come from
 * SI definitions and the 1959 international yard and pound agreement (1 in = 25.4 mm,
 * 1 lb = 0.45359237 kg), NIST SP 811 and the US/Imperial volume definitions.
 */

export interface UnitDef {
  id: string;
  label: string;
  symbol: string;
  /** Multiply a value in this unit by `factor` to get the base unit (linear units). */
  factor?: number;
  /** Non-linear (temperature): to and from the base unit. */
  toBase?: (v: number) => number;
  fromBase?: (v: number) => number;
}

export interface UnitCategory {
  id: string;
  label: string;
  base: string;
  units: UnitDef[];
  defaultFrom: string;
  defaultTo: string;
}

const u = (id: string, label: string, symbol: string, factor: number): UnitDef => ({ id, label, symbol, factor });

const INCH = 0.0254;
const FOOT = 0.3048;
const YARD = 0.9144;
const MILE = 1609.344;
const LB = 0.45359237;
const US_GAL = 3.785411784; // litres, 231 in³
const IMP_GAL = 4.54609; // litres

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: "length",
    label: "Length",
    base: "m",
    defaultFrom: "m",
    defaultTo: "ft",
    units: [
      u("nm", "Nanometre", "nm", 1e-9),
      u("um", "Micrometre", "µm", 1e-6),
      u("mm", "Millimetre", "mm", 1e-3),
      u("cm", "Centimetre", "cm", 1e-2),
      u("m", "Metre", "m", 1),
      u("km", "Kilometre", "km", 1e3),
      u("in", "Inch", "in", INCH),
      u("ft", "Foot", "ft", FOOT),
      u("yd", "Yard", "yd", YARD),
      u("mi", "Mile", "mi", MILE),
      u("nmi", "Nautical mile", "nmi", 1852),
      u("mil", "Mil (thou)", "mil", INCH / 1000),
      u("ly", "Light-year", "ly", 9460730472580800),
    ],
  },
  {
    id: "weight",
    label: "Weight / mass",
    base: "kg",
    defaultFrom: "kg",
    defaultTo: "lb",
    units: [
      u("mg", "Milligram", "mg", 1e-6),
      u("g", "Gram", "g", 1e-3),
      u("kg", "Kilogram", "kg", 1),
      u("t", "Tonne (metric)", "t", 1000),
      u("oz", "Ounce (avoirdupois)", "oz", LB / 16),
      u("lb", "Pound", "lb", LB),
      u("st", "Stone", "st", LB * 14),
      u("ust", "US short ton", "ton (US)", LB * 2000),
      u("ukt", "UK long ton", "ton (UK)", LB * 2240),
      u("ct", "Carat", "ct", 0.0002),
      u("ozt", "Troy ounce", "oz t", 0.0311034768),
      u("gr", "Grain", "gr", 0.00006479891),
      u("tola", "Tola", "tola", 0.0116638038),
    ],
  },
  {
    id: "temperature",
    label: "Temperature",
    base: "C",
    defaultFrom: "C",
    defaultTo: "F",
    units: [
      { id: "C", label: "Celsius", symbol: "°C", toBase: (v) => v, fromBase: (v) => v },
      { id: "F", label: "Fahrenheit", symbol: "°F", toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 32 },
      { id: "K", label: "Kelvin", symbol: "K", toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
      { id: "R", label: "Rankine", symbol: "°R", toBase: (v) => ((v - 491.67) * 5) / 9, fromBase: (v) => ((v + 273.15) * 9) / 5 },
    ],
  },
  {
    id: "area",
    label: "Area",
    base: "m2",
    defaultFrom: "m2",
    defaultTo: "ft2",
    units: [
      u("mm2", "Square millimetre", "mm²", 1e-6),
      u("cm2", "Square centimetre", "cm²", 1e-4),
      u("m2", "Square metre", "m²", 1),
      u("are", "Are", "a", 100),
      u("ha", "Hectare", "ha", 1e4),
      u("km2", "Square kilometre", "km²", 1e6),
      u("in2", "Square inch", "in²", INCH * INCH),
      u("ft2", "Square foot", "ft²", FOOT * FOOT),
      u("yd2", "Square yard (gaj)", "yd²", YARD * YARD),
      u("acre", "Acre", "ac", 4046.8564224),
      u("mi2", "Square mile", "mi²", MILE * MILE),
    ],
  },
  {
    id: "volume",
    label: "Volume",
    base: "l",
    defaultFrom: "l",
    defaultTo: "usgal",
    units: [
      u("ml", "Millilitre", "mL", 1e-3),
      u("cl", "Centilitre", "cL", 1e-2),
      u("l", "Litre", "L", 1),
      u("m3", "Cubic metre", "m³", 1000),
      u("cm3", "Cubic centimetre", "cm³", 1e-3),
      u("in3", "Cubic inch", "in³", 0.016387064),
      u("ft3", "Cubic foot", "ft³", 28.316846592),
      u("usgal", "US gallon", "gal (US)", US_GAL),
      u("usqt", "US quart", "qt (US)", US_GAL / 4),
      u("uspt", "US pint", "pt (US)", US_GAL / 8),
      u("uscup", "US cup", "cup (US)", US_GAL / 16),
      u("usfloz", "US fluid ounce", "fl oz (US)", US_GAL / 128),
      u("tbsp", "US tablespoon", "tbsp", US_GAL / 256),
      u("tsp", "US teaspoon", "tsp", US_GAL / 768),
      u("impgal", "Imperial gallon", "gal (UK)", IMP_GAL),
      u("imppt", "Imperial pint", "pt (UK)", IMP_GAL / 8),
      u("impfloz", "Imperial fluid ounce", "fl oz (UK)", IMP_GAL / 160),
      u("bbl", "Oil barrel", "bbl", US_GAL * 42),
    ],
  },
  {
    id: "speed",
    label: "Speed",
    base: "mps",
    defaultFrom: "kmh",
    defaultTo: "mph",
    units: [
      u("mps", "Metre per second", "m/s", 1),
      u("kmh", "Kilometre per hour", "km/h", 1 / 3.6),
      u("mph", "Mile per hour", "mph", MILE / 3600),
      u("kn", "Knot", "kn", 1852 / 3600),
      u("fps", "Foot per second", "ft/s", FOOT),
      u("c", "Speed of light", "c", 299792458),
    ],
  },
  {
    id: "time",
    label: "Time",
    base: "s",
    defaultFrom: "h",
    defaultTo: "min",
    units: [
      u("ns", "Nanosecond", "ns", 1e-9),
      u("us", "Microsecond", "µs", 1e-6),
      u("ms", "Millisecond", "ms", 1e-3),
      u("s", "Second", "s", 1),
      u("min", "Minute", "min", 60),
      u("h", "Hour", "h", 3600),
      u("d", "Day", "d", 86400),
      u("wk", "Week", "wk", 604800),
      u("mo", "Month (average, 30.4375 d)", "mo", 2629800),
      u("yr", "Year (Julian, 365.25 d)", "yr", 31557600),
    ],
  },
  {
    id: "data",
    label: "Digital storage",
    base: "B",
    defaultFrom: "GB",
    defaultTo: "GiB",
    units: [
      u("bit", "Bit", "bit", 0.125),
      u("B", "Byte", "B", 1),
      u("KB", "Kilobyte (1000)", "kB", 1e3),
      u("MB", "Megabyte (1000²)", "MB", 1e6),
      u("GB", "Gigabyte (1000³)", "GB", 1e9),
      u("TB", "Terabyte (1000⁴)", "TB", 1e12),
      u("KiB", "Kibibyte (1024)", "KiB", 1024),
      u("MiB", "Mebibyte (1024²)", "MiB", 1024 ** 2),
      u("GiB", "Gibibyte (1024³)", "GiB", 1024 ** 3),
      u("TiB", "Tebibyte (1024⁴)", "TiB", 1024 ** 4),
    ],
  },
  {
    id: "pressure",
    label: "Pressure",
    base: "Pa",
    defaultFrom: "bar",
    defaultTo: "psi",
    units: [
      u("Pa", "Pascal", "Pa", 1),
      u("kPa", "Kilopascal", "kPa", 1e3),
      u("MPa", "Megapascal", "MPa", 1e6),
      u("bar", "Bar", "bar", 1e5),
      u("mbar", "Millibar", "mbar", 100),
      u("atm", "Standard atmosphere", "atm", 101325),
      u("psi", "Pound per square inch", "psi", (LB * 9.80665) / (INCH * INCH)),
      u("torr", "Torr", "Torr", 101325 / 760),
      u("mmHg", "Millimetre of mercury", "mmHg", 133.322387415),
      u("inHg", "Inch of mercury", "inHg", 3386.389),
    ],
  },
  {
    id: "energy",
    label: "Energy",
    base: "J",
    defaultFrom: "kcal",
    defaultTo: "kJ",
    units: [
      u("J", "Joule", "J", 1),
      u("kJ", "Kilojoule", "kJ", 1e3),
      u("MJ", "Megajoule", "MJ", 1e6),
      u("cal", "Calorie (thermochemical)", "cal", 4.184),
      u("kcal", "Kilocalorie (food Calorie)", "kcal", 4184),
      u("Wh", "Watt-hour", "Wh", 3600),
      u("kWh", "Kilowatt-hour", "kWh", 3.6e6),
      u("BTU", "British thermal unit (IT)", "BTU", 1055.05585262),
      u("eV", "Electronvolt", "eV", 1.602176634e-19),
      u("ftlbf", "Foot-pound force", "ft·lbf", FOOT * LB * 9.80665),
    ],
  },
  {
    id: "power",
    label: "Power",
    base: "W",
    defaultFrom: "hp",
    defaultTo: "kW",
    units: [
      u("W", "Watt", "W", 1),
      u("kW", "Kilowatt", "kW", 1e3),
      u("MW", "Megawatt", "MW", 1e6),
      u("hp", "Horsepower (mechanical)", "hp", 550 * FOOT * LB * 9.80665),
      u("PS", "Metric horsepower", "PS", 735.49875),
      u("BTUh", "BTU per hour", "BTU/h", 1055.05585262 / 3600),
    ],
  },
  {
    id: "angle",
    label: "Angle",
    base: "deg",
    defaultFrom: "deg",
    defaultTo: "rad",
    units: [
      u("deg", "Degree", "°", 1),
      u("rad", "Radian", "rad", 180 / Math.PI),
      u("grad", "Gradian", "gon", 0.9),
      u("arcmin", "Arcminute", "′", 1 / 60),
      u("arcsec", "Arcsecond", "″", 1 / 3600),
      u("turn", "Turn", "turn", 360),
    ],
  },
];

export function getUnitCategory(id: string): UnitCategory | undefined {
  return UNIT_CATEGORIES.find((c) => c.id === id);
}

export function convert(value: number, categoryId: string, from: string, to: string): number {
  const cat = getUnitCategory(categoryId);
  if (!cat || !Number.isFinite(value)) return NaN;
  const a = cat.units.find((x) => x.id === from);
  const b = cat.units.find((x) => x.id === to);
  if (!a || !b) return NaN;
  if (a.id === b.id) return value;
  const base = a.toBase ? a.toBase(value) : value * (a.factor as number);
  return b.fromBase ? b.fromBase(base) : base / (b.factor as number);
}

/** Absolute zero check for temperature input. */
export function belowAbsoluteZero(value: number, unit: string): boolean {
  const k = convert(value, "temperature", unit, "K");
  return Number.isFinite(k) && k < -1e-9;
}

/** Human-friendly number: up to 10 significant digits, exponent notation for extremes. */
export function formatUnitValue(n: number, sig = 10): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1e15 || a < 1e-6) return n.toExponential(Math.min(sig - 1, 8)).replace(/\.?0+e/, "e");
  const s = Number(n.toPrecision(sig));
  return s.toLocaleString("en-US", { maximumFractionDigits: 10 });
}
