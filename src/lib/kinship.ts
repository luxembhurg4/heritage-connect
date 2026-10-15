// Pure kinship reckoning for the Kinship tab — React-free so
// scripts/check-kinship.ts can run it under plain node.

export type Kin = {
  _id: string;
  name: string;
  sex?: "male" | "female";
  fatherId?: string | null;
  motherId?: string | null;
  partnerId?: string | null;
};

type Dir = "up" | "down" | "spouse";
// One person on the way, with what they are to the person before them.
export type Link = { person: Kin; word?: string };
type Seg = { kind: "blood" | "spouse"; from: Kin; to: Kin; up: number; down: number };

const g = (p: Kin, male: string, female: string, either: string) =>
  p.sex === "male" ? male : p.sex === "female" ? female : either;
const great = (n: number) => "great-".repeat(Math.max(0, n));
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** What `to` is to `from` along one blood line: `up` generations to the
 *  shared ancestor, then `down` from them. */
function blood(from: Kin, to: Kin, up: number, down: number): string {
  if (down === 0) return `${great(up - 2)}${up > 1 ? "grand" : ""}${g(to, "father", "mother", "parent")}`;
  if (up === 0) return `${great(down - 2)}${down > 1 ? "grand" : ""}${g(to, "son", "daughter", "child")}`;
  if (up === 1 && down === 1) {
    const half =
      !!(from.fatherId && from.motherId && to.fatherId && to.motherId) &&
      (from.fatherId !== to.fatherId || from.motherId !== to.motherId);
    return `${half ? "half-" : ""}${g(to, "brother", "sister", "sibling")}`;
  }
  if (up === 1) return great(down - 2) + g(to, "nephew", "niece", "niece or nephew");
  if (down === 1) return great(up - 2) + g(to, "uncle", "aunt", "aunt or uncle");
  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  return `${ORDINALS[degree - 1] ?? `${degree}th`} cousin${removed ? ` ${times(removed)} removed` : ""}`;
}

const isBlood = (s: Seg | undefined, up: number, down: number) =>
  s?.kind === "blood" && s.up === up && s.down === down;

/** The usual single word for a marriage next to a close blood tie. */
function inLaw(a: Seg, b: Seg | undefined): string | undefined {
  if (!b) return undefined;
  const t = b.to;
  if (a.kind === "spouse" && isBlood(b, 1, 0)) return `${g(t, "father", "mother", "parent")}-in-law`;
  if (a.kind === "spouse" && isBlood(b, 1, 1)) return `${g(t, "brother", "sister", "sibling")}-in-law`;
  if (isBlood(a, 1, 1) && b.kind === "spouse") return `${g(t, "brother", "sister", "sibling")}-in-law`;
  if (isBlood(a, 0, 1) && b.kind === "spouse") return `${g(t, "son", "daughter", "child")}-in-law`;
  if (a.kind === "spouse" && isBlood(b, 0, 1)) return `step${g(t, "son", "daughter", "child")}`;
  if (isBlood(a, 1, 0) && b.kind === "spouse") return `step${g(t, "father", "mother", "parent")}`;
  return undefined;
}

/**
 * How `toId` is related to `fromId`: a phrase that reads after "X is Y's"
 * ("first cousin once removed", "wife's first cousin's husband") and the
 * people on the way. Null when no recorded line joins them.
 */
export function relate(people: Kin[], fromId: string, toId: string): { phrase: string; path: Link[] } | null {
  const byId = new Map(people.map((p) => [p._id, p]));
  if (!byId.has(fromId) || !byId.has(toId)) return null;
  const kids = new Map<string, string[]>();
  const partners = new Map<string, Set<string>>();
  const pair = (a: string, b: string) => partners.set(a, (partners.get(a) ?? new Set()).add(b));
  for (const p of people) {
    for (const id of [p.fatherId, p.motherId]) if (id && byId.has(id)) kids.set(id, [...(kids.get(id) ?? []), p._id]);
    if (p.partnerId && byId.has(p.partnerId)) {
      pair(p._id, p.partnerId);
      pair(p.partnerId, p._id);
    }
  }
  const next = (id: string): [string, Dir][] => {
    const p = byId.get(id)!;
    const up = [p.fatherId, p.motherId].filter((x): x is string => !!x && byId.has(x));
    return [
      ...up.map((x): [string, Dir] => [x, "up"]),
      ...(kids.get(id) ?? []).map((x): [string, Dir] => [x, "down"]),
      ...[...(partners.get(id) ?? [])].map((x): [string, Dir] => [x, "spouse"]),
    ];
  };

  // Cheapest path first: fewest marriages and turns (down to a child, then up
  // to their other parent), then fewest steps. A spouse is always "wife", even
  // when a longer blood line (married cousins) also joins them.
  type State = { id: string; dir?: Dir; cost: number; prev?: State };
  let found: State | undefined = partners.get(fromId)?.has(toId)
    ? { id: toId, dir: "spouse", cost: 0, prev: { id: fromId, cost: 0 } }
    : undefined;
  const best = new Map<string, number>([[`${fromId}:`, 0]]);
  const open: State[] = [{ id: fromId, cost: 0 }];
  // shortcut: picks the cheapest open state by scanning — fine for a few
  // thousand people; use a heap past that.
  while (!found && open.length) {
    let i = 0;
    for (let j = 1; j < open.length; j++) if (open[j].cost < open[i].cost) i = j;
    const s = open.splice(i, 1)[0];
    if (s.cost > (best.get(`${s.id}:${s.dir ?? ""}`) ?? Infinity)) continue;
    if (s.id === toId) found = s;
    else
      for (const [id, dir] of next(s.id)) {
        const turn = dir === "spouse" || (dir === "up" && s.dir === "down");
        const cost = s.cost + (turn ? 1000 : 1);
        const key = `${id}:${dir}`;
        if (cost >= (best.get(key) ?? Infinity)) continue;
        best.set(key, cost);
        open.push({ id, dir, cost, prev: s });
      }
  }
  if (!found) return null;

  const steps: State[] = [];
  for (let s: State | undefined = found; s; s = s.prev) steps.unshift(s);
  const ps = steps.map((s) => byId.get(s.id)!);
  // Split the path into blood lines (up, then down) at each marriage and
  // each turn from a child up to their other parent.
  const segs: Seg[] = [];
  let line: Seg | undefined;
  for (let i = 1; i < steps.length; i++) {
    const dir = steps[i].dir!;
    if (dir === "spouse") {
      segs.push({ kind: "spouse", from: ps[i - 1], to: ps[i], up: 0, down: 0 });
      line = undefined;
      continue;
    }
    if (!line || (dir === "up" && line.down > 0)) {
      line = { kind: "blood", from: ps[i - 1], to: ps[i], up: 0, down: 0 };
      segs.push(line);
    }
    line.to = ps[i];
    if (dir === "up") line.up++;
    else line.down++;
  }
  const words: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    const merged = inLaw(segs[i], segs[i + 1]);
    if (merged) i++;
    const s = segs[i];
    words.push(merged ?? (s.kind === "spouse" ? g(s.to, "husband", "wife", "spouse") : blood(s.from, s.to, s.up, s.down)));
  }
  const stepWord = (dir: Dir, p: Kin) =>
    dir === "up"
      ? g(p, "father", "mother", "parent")
      : dir === "down"
        ? g(p, "son", "daughter", "child")
        : g(p, "husband", "wife", "spouse");
  return {
    phrase: words.join("'s "),
    path: ps.map((person, i) => ({ person, word: i ? stepWord(steps[i].dir!, person) : undefined })),
  };
}
