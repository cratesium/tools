/** Deterministic Lorem Ipsum generator (seeded PRNG). */
import { mulberry32 } from "./lines";

export const LOREM_START = "Lorem ipsum dolor sit amet, consectetur adipiscing elit";

/** Vocabulary drawn from Cicero's "De finibus bonorum et malorum" (the source of Lorem Ipsum). */
export const LOREM_WORDS = (
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna " +
  "aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute " +
  "irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non " +
  "proident sunt culpa qui officia deserunt mollit anim id est laborum perspiciatis unde omnis iste natus error " +
  "voluptatem accusantium doloremque laudantium totam rem aperiam eaque ipsa quae ab illo inventore veritatis quasi " +
  "architecto beatae vitae dicta explicabo nemo ipsam quia voluptas aspernatur aut odit fugit consequuntur magni " +
  "dolores eos ratione sequi nesciunt neque porro quisquam dolorem adipisci numquam eius modi tempora incidunt magnam " +
  "quaerat minima nostrum exercitationem ullam corporis suscipit laboriosam aliquid commodi consequatur autem vel eum " +
  "iure quam nihil molestiae illum quo at vero accusamus iusto odio dignissimos ducimus blanditiis praesentium " +
  "voluptatum deleniti atque corrupti quos quas molestias excepturi occaecati cupiditate provident similique mollitia " +
  "animi dolorum fuga harum quidem rerum facilis expedita distinctio nam libero tempore cum soluta nobis eligendi optio " +
  "cumque impedit minus quod maxime placeat facere possimus assumenda repellendus temporibus quibusdam officiis " +
  "debitis necessitatibus saepe eveniet voluptates repudiandae recusandae itaque earum hic tenetur sapiente delectus " +
  "reiciendis voluptatibus maiores alias perferendis doloribus asperiores repellat"
).split(" ");

export type LoremUnit = "paragraphs" | "sentences" | "words" | "list";
export type LoremFormat = "text" | "html" | "markdown";

export interface LoremOptions {
  unit: LoremUnit;
  count: number;
  startWithLorem: boolean;
  format: LoremFormat;
  seed: number;
  /** Sentence length range in words. */
  minWords?: number;
  maxWords?: number;
  /** Sentences per paragraph range. */
  minSentences?: number;
  maxSentences?: number;
}

export const LOREM_LIMITS = { paragraphs: 200, sentences: 2000, words: 20000, list: 500 } as const;

class Gen {
  private rnd: () => number;
  private started = false;
  constructor(seed: number, private o: LoremOptions) {
    this.rnd = mulberry32(seed);
  }
  int(min: number, max: number) {
    return min + Math.floor(this.rnd() * (max - min + 1));
  }
  word(prev?: string) {
    let w = LOREM_WORDS[this.int(0, LOREM_WORDS.length - 1)];
    if (w === prev) w = LOREM_WORDS[(LOREM_WORDS.indexOf(w) + 1) % LOREM_WORDS.length];
    return w;
  }
  words(n: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(this.word(out[i - 1]));
    return out;
  }
  sentence(): string {
    const n = this.int(this.o.minWords ?? 6, this.o.maxWords ?? 14);
    let ws: string[];
    if (this.o.startWithLorem && !this.started) {
      this.started = true;
      const start = LOREM_START.toLowerCase().replace(",", "").split(" ");
      ws = [...start, ...this.words(Math.max(0, n - start.length))];
      ws[4] = ws[4] + ",";
    } else {
      ws = this.words(n);
      if (n > 8 && this.rnd() < 0.5) {
        const at = this.int(2, n - 4);
        ws[at] = ws[at] + ",";
      }
    }
    const s = ws.join(" ");
    return s[0].toUpperCase() + s.slice(1) + (this.rnd() < 0.08 ? "?" : ".");
  }
  paragraph(): string {
    const n = this.int(this.o.minSentences ?? 4, this.o.maxSentences ?? 7);
    return Array.from({ length: n }, () => this.sentence()).join(" ");
  }
}

/** Same options and seed always produce the same output. */
export function generateLorem(o: LoremOptions): string {
  const count = Math.max(1, Math.min(Math.floor(o.count) || 1, LOREM_LIMITS[o.unit]));
  const g = new Gen(o.seed, o);
  switch (o.unit) {
    case "words": {
      let ws: string[];
      if (o.startWithLorem) {
        const start = ["lorem", "ipsum", "dolor", "sit", "amet"];
        ws = [...start.slice(0, count), ...g.words(Math.max(0, count - start.length))];
      } else ws = g.words(count);
      const s = ws.join(" ");
      const text = s[0].toUpperCase() + s.slice(1);
      return o.format === "html" ? `<p>${text}</p>` : text;
    }
    case "sentences": {
      const text = Array.from({ length: count }, () => g.sentence()).join(" ");
      return o.format === "html" ? `<p>${text}</p>` : text;
    }
    case "paragraphs": {
      const ps = Array.from({ length: count }, () => g.paragraph());
      return o.format === "html" ? ps.map((p) => `<p>${p}</p>`).join("\n") : ps.join("\n\n");
    }
    case "list": {
      const items = Array.from({ length: count }, () => {
        const s = g.sentence();
        return s.slice(0, -1);
      });
      if (o.format === "html") return `<ul>\n${items.map((i) => `  <li>${i}</li>`).join("\n")}\n</ul>`;
      if (o.format === "markdown") return items.map((i) => `- ${i}`).join("\n");
      return items.join("\n");
    }
  }
}
