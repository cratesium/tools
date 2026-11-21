/**
 * BMI (WHO adult categories + Asian cut-offs) and calorie needs (Mifflin-St Jeor).
 * Estimates only; not medical advice.
 */

export const LB_PER_KG = 1 / 0.45359237;
export const CM_PER_IN = 2.54;

export function bmi(weightKg: number, heightCm: number): number {
  if (!(weightKg > 0) || !(heightCm > 0)) return NaN;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function imperialToMetric(feet: number, inches: number, pounds: number): { heightCm: number; weightKg: number } {
  return { heightCm: ((feet || 0) * 12 + (inches || 0)) * CM_PER_IN, weightKg: (pounds || 0) * 0.45359237 };
}

export interface BmiCategory {
  label: string;
  range: string;
}

/** WHO classification for adults (20+). */
export function whoCategory(b: number): BmiCategory | null {
  if (!Number.isFinite(b)) return null;
  if (b < 16) return { label: "Underweight (severe thinness)", range: "< 16.0" };
  if (b < 17) return { label: "Underweight (moderate thinness)", range: "16.0–16.9" };
  if (b < 18.5) return { label: "Underweight (mild thinness)", range: "17.0–18.4" };
  if (b < 25) return { label: "Normal weight", range: "18.5–24.9" };
  if (b < 30) return { label: "Overweight (pre-obese)", range: "25.0–29.9" };
  if (b < 35) return { label: "Obesity class I", range: "30.0–34.9" };
  if (b < 40) return { label: "Obesity class II", range: "35.0–39.9" };
  return { label: "Obesity class III", range: "≥ 40.0" };
}

/**
 * Asian cut-offs (WHO expert consultation 2004; adopted by Indian consensus guidelines):
 * risk rises at lower BMI, so 23 marks overweight and 25 (India) or 27.5 (WHO "high risk") obesity.
 */
export function asianCategory(b: number): BmiCategory | null {
  if (!Number.isFinite(b)) return null;
  if (b < 18.5) return { label: "Underweight", range: "< 18.5" };
  if (b < 23) return { label: "Normal weight", range: "18.5–22.9" };
  if (b < 25) return { label: "Overweight (increased risk)", range: "23.0–24.9" };
  return { label: "Obese (high risk)", range: "≥ 25.0" };
}

/** Weight range (kg) giving BMI between lo and hi for a height. */
export function healthyWeightRange(heightCm: number, lo = 18.5, hi = 24.9): [number, number] {
  const m = heightCm / 100;
  return [lo * m * m, hi * m * m];
}

export type Sex = "male" | "female";

/** Mifflin-St Jeor (1990) resting energy expenditure, kcal/day. */
export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, ageYears: number): number {
  if (!(weightKg > 0) || !(heightCm > 0) || !(ageYears > 0)) return NaN;
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === "male" ? 5 : -161);
}

export const ACTIVITY_LEVELS = [
  { id: "sedentary", label: "Sedentary (little or no exercise)", factor: 1.2 },
  { id: "light", label: "Lightly active (1–3 days/week)", factor: 1.375 },
  { id: "moderate", label: "Moderately active (3–5 days/week)", factor: 1.55 },
  { id: "very", label: "Very active (6–7 days/week)", factor: 1.725 },
  { id: "extra", label: "Extra active (physical job or 2× training)", factor: 1.9 },
] as const;

export const GOALS = [
  { id: "lose1", label: "Lose ~1 kg/week", delta: -1000 },
  { id: "lose05", label: "Lose ~0.5 kg/week", delta: -500 },
  { id: "lose025", label: "Lose ~0.25 kg/week", delta: -250 },
  { id: "maintain", label: "Maintain weight", delta: 0 },
  { id: "gain025", label: "Gain ~0.25 kg/week", delta: 250 },
  { id: "gain05", label: "Gain ~0.5 kg/week", delta: 500 },
] as const;

/** Commonly cited minimum daily intake without medical supervision. */
export function minimumIntake(sex: Sex): number {
  return sex === "male" ? 1500 : 1200;
}

export function calorieNeeds(sex: Sex, weightKg: number, heightCm: number, ageYears: number, activityFactor: number) {
  const bmr = bmrMifflin(sex, weightKg, heightCm, ageYears);
  const tdee = bmr * activityFactor;
  return {
    bmr,
    tdee,
    goals: GOALS.map((g) => {
      const kcal = tdee + g.delta;
      return { ...g, kcal, belowMinimum: kcal < minimumIntake(sex) };
    }),
  };
}
