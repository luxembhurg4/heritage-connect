import type { Edge, Node } from "reactflow";

// Pure layout for FamilyTreeCanvas — kept React-free so
// scripts/check-tree-layout.ts can run it under plain node.

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 60;
const LEVEL_GAP = 90; // between generation bands
const GAP = 32; // between cards and columns in a row
const GROUP_GAP = 60; // extra space between unrelated trees
const OFFSET = 32; // a spouse's card sits this far right of their partner's
// Side-by-side founders: room for the rings and some line either side. Their
// children's row is always wider, so this never widens the tree.
const FOUNDER_GAP = 80;
// Registers this deep or shallower open fully; deeper ones open on this
// many generations until the viewer reveals more.
const SHOW_ALL_UP_TO = 5;
const DEEP_START = 4;

// Subset of Doc<"people"> the canvas needs — structurally compatible with the
// Convex type so the page can pass its query results straight through.
export type Person = {
  _id: string;
  name: string;
  sex?: "male" | "female";
  birthYear?: number;
  deathYear?: number;
  fatherId?: string | null;
  motherId?: string | null;
  partnerId?: string | null;
  imageUrl?: string;
};

export type PersonNodeData = {
  person: Person;
  focused: boolean;
  badge?: string;
  // Sibling boxes are nodes stacked as one box: this is the row's place in
  // it (unset for a card on its own).
  part?: "top" | "middle" | "bottom";
  // Lower card of a couple: shows the rings on the seam with the card above.
  spouse?: boolean;
  // Descendants hidden below the generations shown, on the card their line leaves.
  hidden?: number;
};

export function buildLayout(
  all: Person[],
  focusId: string | null,
  // People from other registers → "❦ Register". A line that continues only
  // among them (a branch recorded elsewhere) stays folded until opened.
  badge: Map<string, string>,
  // Generations shown; unset picks a default from the register's depth.
  generationsShown?: number,
  // People whose whole line below is revealed, whatever the generations shown.
  opened: Set<string> = new Set(),
): { nodes: Node[]; edges: Edge[]; total: number; shown: number } {
  const byId = new Map(all.map((p) => [p._id, p]));
  const kids = new Map<string, Person[]>();
  const partnerOf = new Map<string, string>();
  for (const p of all) {
    for (const parent of [p.fatherId, p.motherId]) {
      if (parent) kids.set(parent, [...(kids.get(parent) ?? []), p]);
    }
    if (p.partnerId && byId.has(p.partnerId)) {
      partnerOf.set(p._id, p.partnerId);
      if (!partnerOf.has(p.partnerId)) partnerOf.set(p.partnerId, p._id);
    }
  }
  // Only parents on this tree count: someone whose parents are recorded in
  // another register starts a line here, like a founder.
  const hasParents = (p: Person) => byId.has(p.fatherId ?? "") || byId.has(p.motherId ?? "");
  const partner = (p: Person) => byId.get(partnerOf.get(p._id) ?? "");
  // Married-in: no recorded parents but a partner who has them. They take
  // the partner's row instead of row 0, so their children don't collapse up.
  const marriedIn = all.filter((p) => {
    const q = partner(p);
    return !hasParents(p) && !!q && hasParents(q);
  });
  const isMarriedIn = new Set(marriedIn.map((p) => p._id));

  // Breadth-first generations from true roots, then from married-in people
  // once their partner's row is known (repeat for chains of them).
  const gen = new Map<string, number>();
  const queue: string[] = [];
  let head = 0;
  const seed = (id: string, g: number) => {
    if (gen.has(id)) return false;
    gen.set(id, g);
    queue.push(id);
    return true;
  };
  const walk = () => {
    while (head < queue.length) {
      const id = queue[head++];
      for (const c of kids.get(id) ?? []) seed(c._id, gen.get(id)! + 1);
    }
  };
  for (const p of all) if (!hasParents(p) && !isMarriedIn.has(p._id)) seed(p._id, 0);
  walk();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const p of marriedIn) {
      const g = gen.get(partnerOf.get(p._id)!);
      if (g !== undefined && seed(p._id, g)) progressed = true;
    }
    walk();
  }
  // People unreachable from a root (broken/cyclic links) stay visible on row 0.
  for (const p of all) if (!gen.has(p._id)) gen.set(p._id, 0);


  const byAge = (a: Person, b: Person) =>
    (a.birthYear ?? 9999) - (b.birthYear ?? 9999) ||
    a.name.localeCompare(b.name) ||
    (a._id < b._id ? -1 : 1);
  // A parentless person rides with their partner in the same row
  // (married-in and cross-register spouses; founding couples, elder first).
  const rides = (p: Person) => {
    const q = partner(p);
    return (
      !!q && !hasParents(p) && gen.get(q._id) === gen.get(p._id) &&
      (hasParents(q) || badge.has(p._id) || (!badge.has(q._id) && byAge(q, p) < 0))
    );
  };
  const riderOf = (lead: Person) => {
    const q = partner(lead);
    return q && rides(q) ? q : undefined;
  };
  // A couple is two cards, the spouse's just below and shifted right, except
  // founding couples, who stay side by side.
  const isCard = (lead: Person) => !!riderOf(lead) && hasParents(lead);
  const unionId = (a: string, b: string) => `u:${[a, b].sort().join(":")}`;

  // Family units: a lead plus their riding partner. Each unit hangs under the
  // parent one generation up (father first), so units form a forest.
  const attach = (p: Person) =>
    [p.fatherId, p.motherId]
      .map((id) => byId.get(id ?? ""))
      .find((q) => q && gen.get(q._id) === gen.get(p._id)! - 1);
  const leadOf = (p: Person) => (rides(p) ? partner(p)! : p);
  // Key for where a child's line starts: the couple's union when both
  // recorded parents are that couple, otherwise the attached parent.
  const sourceOf = (p: Person) => {
    const a = attach(p)!;
    const lead = leadOf(a);
    const r = riderOf(lead);
    const ps = [p.fatherId, p.motherId];
    return r && ps.includes(lead._id) && ps.includes(r._id) ? unionId(lead._id, r._id) : a._id;
  };
  // Unpartnered and childless: share one sibling box instead of a column each.
  const isLeaf = (p: Person) => !partnerOf.has(p._id) && !kids.get(p._id)?.length;

  const roots: Person[] = [];
  const under = new Map<string, Person[]>();
  for (const p of all) {
    if (rides(p)) continue;
    const a = attach(p);
    if (a) under.set(leadOf(a)._id, [...(under.get(leadOf(a)._id) ?? []), p]);
    else roots.push(p);
  }

  // Generations below the ones shown are hidden, except along the way down
  // to the focused person, so picking anyone always puts them on screen.
  const focusPath = new Set<string>();
  for (let p = byId.get(focusId ?? ""); p; ) {
    const a = attach(leadOf(p));
    p = a && leadOf(a);
    if (p) focusPath.add(p._id);
  }
  // The stepper counts this register's generations; other registers' open
  // in full when their branch is opened.
  const total = Math.max(0, ...all.filter((p) => !badge.has(p._id)).map((p) => gen.get(p._id)!)) + 1;
  const generations =
    generationsShown ?? (total <= SHOW_ALL_UP_TO ? total : DEEP_START);
  const hasBranch = (lead: Person) => !!under.get(lead._id)?.length;
  const elsewhere = (lead: Person) => under.get(lead._id)!.every((k) => badge.has(k._id));
  // Revealed if this unit or any unit above it was opened (lead or spouse).
  const revealed = (lead: Person | undefined): boolean => {
    for (let p = lead; p; ) {
      if (opened.has(p._id) || opened.has(riderOf(p)?._id ?? "")) return true;
      const a = attach(p);
      p = a && leadOf(a);
    }
    return false;
  };
  const folded = (lead: Person) =>
    hasBranch(lead) &&
    !focusPath.has(lead._id) &&
    (gen.get(lead._id)! >= generations - 1 || elsewhere(lead)) &&
    !revealed(lead);
  const hidden = (lead: Person): number =>
    (under.get(lead._id) ?? []).reduce((n, k) => n + (riderOf(k) ? 2 : 1) + hidden(k), 0);
  const childrenOf = (lead: Person) => {
    if (folded(lead)) return { branches: [], stacks: [] };
    const ks = (under.get(lead._id) ?? []).sort(byAge);
    const stacks = new Map<string, Person[]>();
    for (const k of ks.filter(isLeaf)) stacks.set(sourceOf(k), [...(stacks.get(sourceOf(k)) ?? []), k]);
    return { branches: ks.filter((k) => !isLeaf(k)), stacks: [...stacks] };
  };

  // Bottom-up widths (growing each generation band to its tallest card or
  // box as we go), then top-down placement. Children — branches side by
  // side, then the sibling box(es) — are centred under the point their line
  // leaves the unit: the union of a side-by-side couple, the bottom card of
  // a couple, or a single card's middle. reach = unit's extent each side of it.
  const reach = (lead: Person): [number, number] =>
    !riderOf(lead) ? [NODE_WIDTH / 2, NODE_WIDTH / 2]
    : isCard(lead) ? [NODE_WIDTH / 2 + OFFSET, NODE_WIDTH / 2]
    : [NODE_WIDTH + FOUNDER_GAP / 2, NODE_WIDTH + FOUNDER_GAP / 2];
  const rowWidth = (ws: number[]) =>
    ws.length ? ws.reduce((s, w) => s + w, 0) + GAP * (ws.length - 1) : 0;
  const width = new Map<string, number>();
  const anchorAt = new Map<string, number>(); // line point, from the block's left
  const bandHeight = new Map<number, number>();
  const grow = (g: number, h: number) => bandHeight.set(g, Math.max(bandHeight.get(g) ?? 0, h));
  const measure = (lead: Person): number => {
    const g = gen.get(lead._id)!;
    grow(g, isCard(lead) ? 2 * NODE_HEIGHT : NODE_HEIGHT);
    const { branches, stacks } = childrenOf(lead);
    for (const [, leaves] of stacks) grow(g + 1, leaves.length * NODE_HEIGHT);
    const half = rowWidth([...branches.map(measure), ...stacks.map(() => NODE_WIDTH)]) / 2;
    const [l, r] = reach(lead);
    anchorAt.set(lead._id, Math.max(l, half));
    width.set(lead._id, Math.max(l, half) + Math.max(r, half));
    return width.get(lead._id)!;
  };
  roots.sort(byAge).forEach(measure);
  const bandTop = new Map<number, number>();
  let top = 0;
  for (const g of [...bandHeight.keys()].sort((a, b) => a - b)) {
    bandTop.set(g, top);
    top += bandHeight.get(g)! + LEVEL_GAP;
  }

  const pos = new Map<string, { x: number; y: number }>();
  // Card members (and their union key) → the bottom card, where lines leave.
  // shortcut: a child recorded for only one partner of a couple card also
  // hangs from the card's bottom — upgrade: a side handle per partner.
  const bottomOf = new Map<string, string>();
  const part = new Map<string, PersonNodeData["part"]>();
  const boxTops: { source: string; top: string }[] = [];
  const place = (lead: Person, left: number) => {
    const { branches, stacks } = childrenOf(lead);
    const g = gen.get(lead._id)!;
    const a = left + anchorAt.get(lead._id)!;
    const y = bandTop.get(g)!;
    const rider = riderOf(lead);
    if (rider && isCard(lead)) {
      pos.set(lead._id, { x: a - NODE_WIDTH / 2 - OFFSET, y });
      pos.set(rider._id, { x: a - NODE_WIDTH / 2, y: y + NODE_HEIGHT });
      for (const id of [lead._id, rider._id, unionId(lead._id, rider._id)]) bottomOf.set(id, rider._id);
    } else if (rider) {
      pos.set(lead._id, { x: a - NODE_WIDTH - FOUNDER_GAP / 2, y });
      pos.set(rider._id, { x: a + FOUNDER_GAP / 2, y });
    } else pos.set(lead._id, { x: a - NODE_WIDTH / 2, y });
    const ws = [...branches.map((b) => width.get(b._id)!), ...stacks.map(() => NODE_WIDTH)];
    let cx = a - rowWidth(ws) / 2;
    for (const b of branches) {
      place(b, cx);
      cx += width.get(b._id)! + GAP;
    }
    for (const [source, leaves] of stacks) {
      boxTops.push({ source, top: leaves[0]._id });
      leaves.forEach((l, i) => {
        pos.set(l._id, { x: cx, y: bandTop.get(g + 1)! + i * NODE_HEIGHT });
        if (leaves.length > 1)
          part.set(l._id, i === 0 ? "top" : i === leaves.length - 1 ? "bottom" : "middle");
      });
      cx += NODE_WIDTH + GAP;
    }
  };
  let cursor = 0;
  for (const r of roots) {
    place(r, cursor);
    cursor += width.get(r._id)! + GAP + GROUP_GAP;
  }

  const shown = all.filter((p) => pos.has(p._id));
  const nodes: Node[] = shown.map((p) => {
    const lead = leadOf(p);
    const card = isCard(lead);
    // "+N" sits where the hidden children's line would leave the unit.
    const host = card ? riderOf(lead)! : lead;
    return {
      id: p._id,
      type: "person",
      position: pos.get(p._id)!,
      // The spouse's card draws over their partner's, so the rings on the seam show.
      zIndex: card && p !== lead ? 1 : 0,
      data: {
        person: p,
        focused: p._id === focusId,
        // Named where the line enters another register, not on every card of
        // it (nor twice on a couple from there).
        badge: badge.get(p._id) === badge.get((rides(p) ? partner(p) : attach(p))?._id ?? "") ? undefined : badge.get(p._id),
        part: part.get(p._id),
        spouse: card && p !== lead,
        hidden: host === p && folded(lead) ? hidden(lead) : 0,
      } satisfies PersonNodeData,
    };
  });
  const point = (id: string, x: number, y: number): Node => ({
    id,
    type: "union",
    position: { x, y },
    data: {},
    selectable: false,
    focusable: false,
  });
  const from = (key: string) => bottomOf.get(key) ?? key;

  // Line between partners shown apart, left to right (a couple's cards show
  // the rings on their seam). Side-by-side couples get a union point at the
  // middle that shows the rings and carries one line down to their children;
  // partners apart without one (e.g. married cousins) get a ⚭ label instead.
  const edges: Edge[] = [];
  for (const [a, b] of partnerOf) {
    if (a > b || !pos.has(a) || !pos.has(b) || (bottomOf.has(a) && from(a) === from(b))) continue;
    const [l, r] = pos.get(a)!.x <= pos.get(b)!.x ? [a, b] : [b, a];
    edges.push({
      id: `m:${l}:${r}`,
      source: l,
      target: r,
      sourceHandle: "r",
      targetHandle: "l",
      type: "straight",
      label: riderOf(byId.get(l)!)?._id === r || riderOf(byId.get(r)!)?._id === l ? undefined : "⚭",
    });
  }
  for (const p of shown) {
    const rider = riderOf(p);
    if (!rider || isCard(p)) continue;
    const { x, y } = pos.get(p._id)!;
    nodes.push(point(unionId(p._id, rider._id), x + NODE_WIDTH + FOUNDER_GAP / 2, y + NODE_HEIGHT / 2));
  }
  // A sibling box gets one line from above, into its top row.
  for (const b of boxTops)
    edges.push({ id: `c:${b.top}`, source: from(b.source), target: b.top, type: "smoothstep" });
  const direct = (id: string, p: Person) =>
    edges.push({ id: `c:${id}:${p._id}`, source: id, target: p._id, type: "smoothstep" });
  for (const p of shown) {
    const a = attach(p);
    const parents = [p.fatherId, p.motherId].filter((id): id is string => !!id && pos.has(id));
    if (!a) {
      // Broken or cyclic links: still show each recorded parent.
      parents.forEach((id) => direct(id, p));
      continue;
    }
    const source = sourceOf(p);
    if (!isLeaf(p))
      edges.push({ id: `c:${p._id}`, source: from(source), target: p._id, type: "smoothstep" });
    // shortcut: a second parent outside the attached couple (e.g. cousins who
    // married) gets a direct line that may cross other families.
    parents.filter((id) => id !== a._id && !source.includes(id)).forEach((id) => direct(id, p));
  }

  return { nodes, edges, total, shown: Math.min(generations, total) };
}
