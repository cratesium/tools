"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Segmented } from "@/components/ui/field";
import { Alert, Stat } from "@/components/ui/feedback";
import { ActionBar, Panel } from "@/components/tools/shared";
import {
  ACTIVITY_LEVELS,
  asianCategory,
  bmi,
  calorieNeeds,
  healthyWeightRange,
  imperialToMetric,
  LB_PER_KG,
  whoCategory,
  type Sex,
} from "@/lib/processors/calculators/health";
import { NumField, SelectField, fmt, num } from "./common";

/** processorOptions.kind: "bmi" | "calorie". */
export default function HealthCalculator({ tool }: ToolComponentProps) {
  return tool.processorOptions?.kind === "calorie" ? <Calorie /> : <Bmi />;
}

type System = "metric" | "imperial";

function useBody() {
  const [system, setSystem] = useState<System>("metric");
  const [cm, setCm] = useState("");
  const [kg, setKg] = useState("");
  const [ft, setFt] = useState("");
  const [inch, setInch] = useState("");
  const [lb, setLb] = useState("");
  const m = system === "metric" ? { heightCm: num(cm), weightKg: num(kg) } : imperialToMetric(num(ft), num(inch), num(lb));
  const valid = m.heightCm >= 50 && m.heightCm <= 272 && m.weightKg >= 2 && m.weightKg <= 650;
  const touched = system === "metric" ? cm !== "" && kg !== "" : (ft !== "" || inch !== "") && lb !== "";
  const reset = () => {
    setSystem("metric");
    setCm("");
    setKg("");
    setFt("");
    setInch("");
    setLb("");
  };
  const fields = (
    <>
      <Segmented
        label="Units"
        value={system}
        onChange={setSystem}
        options={[
          { value: "metric", label: "Metric (cm, kg)" },
          { value: "imperial", label: "Imperial (ft/in, lb)" },
        ]}
      />
      {system === "metric" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label="Height" value={cm} onChange={setCm} suffix="cm" testId="input" />
          <NumField label="Weight" value={kg} onChange={setKg} suffix="kg" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <NumField label="Height (feet)" value={ft} onChange={setFt} suffix="ft" testId="input" />
          <NumField label="Height (inches)" value={inch} onChange={setInch} suffix="in" />
          <NumField label="Weight" value={lb} onChange={setLb} suffix="lb" />
        </div>
      )}
    </>
  );
  return { system, m, valid, touched, reset, fields };
}

function Bmi() {
  const body = useBody();
  const b = body.valid ? bmi(body.m.weightKg, body.m.heightCm) : NaN;
  const who = whoCategory(b);
  const asian = asianCategory(b);
  const [lo, hi] = body.valid ? healthyWeightRange(body.m.heightCm) : [NaN, NaN];
  const w = (kg: number) => (body.system === "metric" ? `${fmt(kg, 1)} kg` : `${fmt(kg * LB_PER_KG, 1)} lb`);
  return (
    <div className="space-y-4">
      <Panel title="Your measurements">
        <div className="space-y-3">{body.fields}</div>
        {body.touched && !body.valid ? <p className="mt-2 text-xs text-danger">Enter a height between 50 and 272 cm and a weight between 2 and 650 kg.</p> : null}
      </Panel>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="output">
        <Stat label="BMI" value={Number.isFinite(b) ? b.toFixed(1) : "—"} sub="kg/m²" />
        <Stat label="WHO category" value={who ? who.label : "—"} sub={who ? `BMI ${who.range}` : undefined} />
        <Stat label="Asian cut-offs" value={asian ? asian.label : "—"} sub={asian ? `BMI ${asian.range}` : undefined} />
        <Stat label="Healthy weight for your height" value={body.valid ? `${w(lo)} – ${w(hi)}` : "—"} sub="BMI 18.5–24.9" />
      </div>
      <Panel title="WHO adult BMI categories">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {[
              ["Below 18.5", "Underweight"],
              ["18.5 – 24.9", "Normal weight"],
              ["25.0 – 29.9", "Overweight (pre-obese)"],
              ["30.0 – 34.9", "Obesity class I"],
              ["35.0 – 39.9", "Obesity class II"],
              ["40 and above", "Obesity class III"],
            ].map(([r, l]) => (
              <tr key={r} className={who && (who.label === l || (l === "Underweight" && who.label.startsWith("Underweight"))) ? "font-medium text-fg" : "text-fg-muted"}>
                <td className="py-1.5 font-mono">{r}</td>
                <td className="py-1.5 text-right">{l}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-fg-subtle">
          For South Asian, East Asian and other Asian populations, health risks such as type 2 diabetes rise at lower BMI. WHO (2004) suggests public-health action points of 23 and 27.5, and Indian guidelines classify 23–24.9 as overweight and 25 or more as obese.
        </p>
      </Panel>
      <Alert tone="info" title="BMI is a screening measure">
        It does not distinguish muscle from fat and is not valid for children and teenagers (use BMI-for-age percentiles), pregnancy, or very muscular people. Talk to a doctor for a health assessment.
      </Alert>
      <ActionBar onReset={body.reset} />
    </div>
  );
}

function Calorie() {
  const body = useBody();
  const [sex, setSex] = useState<Sex>("female");
  const [ageStr, setAge] = useState("");
  const [activity, setActivity] = useState<string>("light");
  const ageN = num(ageStr);
  const ageOk = ageN >= 15 && ageN <= 100;
  const factor = ACTIVITY_LEVELS.find((a) => a.id === activity)?.factor ?? 1.375;
  const r = body.valid && ageOk ? calorieNeeds(sex, body.m.weightKg, body.m.heightCm, ageN, factor) : null;
  const k = (n: number) => `${fmt(Math.round(n), 0)} kcal`;
  return (
    <div className="space-y-4">
      <Panel title="About you">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              label="Sex"
              value={sex}
              onChange={setSex}
              options={[
                { value: "female", label: "Female" },
                { value: "male", label: "Male" },
              ]}
            />
            <NumField label="Age" value={ageStr} onChange={setAge} suffix="years" error={ageStr && !ageOk ? "Use ages 15–100." : null} />
            <SelectField label="Activity level" value={activity} onChange={setActivity} options={ACTIVITY_LEVELS.map((a) => ({ value: a.id, label: `${a.label} ×${a.factor}` }))} />
          </div>
          {body.fields}
          {body.touched && !body.valid ? <p className="text-xs text-danger">Enter a realistic height and weight.</p> : null}
        </div>
      </Panel>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="output">
        <Stat label="BMR (at rest)" value={r ? k(r.bmr) : "—"} sub="Mifflin-St Jeor" />
        <Stat label="Maintenance (TDEE)" value={r ? k(r.tdee) : "—"} sub={`BMR × ${factor}`} />
        <Stat label="Per week to maintain" value={r ? k(r.tdee * 7) : "—"} />
      </div>
      {r ? (
        <Panel title="Daily calories by goal">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {r.goals.map((g) => (
                <tr key={g.id} className={g.id === "maintain" ? "font-medium" : undefined}>
                  <td className="py-1.5 text-fg-muted">{g.label}</td>
                  <td className="py-1.5 text-right font-mono">
                    {k(g.kcal)} {g.belowMinimum ? <span className="ml-1 text-xs text-warning">below {sex === "male" ? "1,500" : "1,200"} kcal</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-fg-subtle">
            Goals use the common approximation that a daily deficit or surplus of about 500 kcal changes body weight by roughly 0.5 kg per week. Real-world results vary; very low intakes should be supervised by a health professional.
          </p>
        </Panel>
      ) : null}
      <Alert tone="info" title="An estimate, not medical advice">
        BMR = 10 × weight (kg) + 6.25 × height (cm) − 5 × age + 5 (male) or − 161 (female). Individual metabolism can differ by 10% or more; adjust based on how your weight actually changes over a few weeks.
      </Alert>
      <ActionBar
        onReset={() => {
          body.reset();
          setSex("female");
          setAge("");
          setActivity("light");
        }}
      />
    </div>
  );
}
