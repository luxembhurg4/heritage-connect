// Self-check for the tree layout. Run: npm test
import assert from "node:assert/strict";
import { buildLayout, NODE_HEIGHT, NODE_WIDTH, type Person } from "../src/components/treeLayout.ts";

const layout = (
  people: Person[],
  { badges = new Map<string, string>(), generations = undefined as number | undefined, focus = null as string | null, opened = new Set<string>() } = {},
) => {
  const out = buildLayout(people, focus, badges, generations, opened);
  const node = (id: string) => out.nodes.find((n) => n.id === id);
  const at = (id: string) => node(id)!.position;
  const cards = out.nodes.filter((n) => n.type === "person");
  for (const a of cards)
    for (const b of cards)
      if (a !== b)
        assert.ok(
          Math.abs(a.position.x - b.position.x) >= NODE_WIDTH ||
            Math.abs(a.position.y - b.position.y) >= NODE_HEIGHT,
          `${a.id} overlaps ${b.id}`,
        );
  // Lines only arrive from above, one per card. A shown child with no line
  // is a lower row of a sibling box: right under a sibling, same parents.
  const lines = out.edges.filter((e) => !e.id.startsWith("m:")); // m: = between partners
  for (const p of people.filter((p) => [p.fatherId, p.motherId].some((id) => id && node(id)) && node(p._id))) {
    const into = lines.filter((e) => e.target === p._id);
    assert.ok(into.length <= 1, `${p._id} has at most one line in`);
    assert.ok(!into.some((e) => e.targetHandle), `${p._id}'s line enters from above`);
    if (!into.length) {
      const above = cards.find((c) => c.position.x === at(p._id).x && c.position.y === at(p._id).y - NODE_HEIGHT);
      const q = above?.data.person as Person | undefined;
      assert.ok(q && q.fatherId === p.fatherId && q.motherId === p.motherId, `${p._id} sits under a sibling`);
    }
  }
  return { ...out, node, at, lines };
};

// Founder → son → grandson; the son's wife married in with no recorded parents.
const people: Person[] = [
  { _id: "founder", name: "Founder", partnerId: null },
  { _id: "son", name: "Son", fatherId: "founder", partnerId: "wife" },
  { _id: "wife", name: "Wife", partnerId: "son" },
  { _id: "grandson", name: "Grandson", fatherId: "son", motherId: "wife" },
  // Child recorded only through the married-in mother still lands below her.
  { _id: "granddaughter", name: "Granddaughter", motherId: "wife" },
];
const { at, node, edges, lines } = layout(people);
assert.equal(at("founder").y, 0);
assert.equal(at("wife").y, at("son").y + NODE_HEIGHT, "non-founding couple: spouse's card just below");
assert.ok(at("wife").x - at("son").x > 0 && at("wife").x - at("son").x < NODE_WIDTH / 2, "...shifted a little right");
assert.equal(node("wife")!.data.spouse, true, "spouse's card carries the rings");
assert.equal(node("son")!.data.part, undefined, "couples are two cards, not a box");
assert.ok(at("grandson").y >= at("wife").y + NODE_HEIGHT, "children start below the couple card");
assert.equal(at("granddaughter").y, at("grandson").y);
assert.equal(edges.filter((e) => e.id.startsWith("m:")).length, 0, "couple's cards show the rings, no line between them");
assert.equal((at("grandson").x + at("granddaughter").x + NODE_WIDTH) / 2, at("wife").x + NODE_WIDTH / 2, "children centred under the spouse's card");
assert.ok(["grandson", "granddaughter"].every((id) => lines.some((e) => e.source === "wife" && e.target === id)), "children's lines leave the bottom of the card");

// Founders stay side by side; unmarried, childless siblings share one box;
// a married one gets a column of their own.
const famPeople: Person[] = [
  { _id: "a", name: "A", partnerId: "b", birthYear: 1900 },
  { _id: "b", name: "B", partnerId: "a", birthYear: 1901 },
  { _id: "m", name: "M", fatherId: "a", motherId: "b", partnerId: "ms", birthYear: 1919 },
  { _id: "ms", name: "MS", partnerId: "m" },
  { _id: "c1", name: "C1", fatherId: "a", motherId: "b", birthYear: 1920 },
  { _id: "c2", name: "C2", fatherId: "a", motherId: "b", birthYear: 1922 },
  { _id: "c3", name: "C3", fatherId: "a", motherId: "b", birthYear: 1925 },
];
const fam = layout(famPeople);
assert.equal(fam.at("b").y, fam.at("a").y, "founders side by side");
assert.ok(fam.at("b").x > fam.at("a").x);
assert.equal(fam.node("b")!.data.spouse, false, "founders are side by side, not offset");
const founderLine = fam.edges.filter((e) => e.id.startsWith("m:"));
assert.equal(founderLine.length, 1, "founders keep their line");
assert.equal(founderLine[0].label, undefined, "the union point on it shows the rings instead of a ⚭ label");
assert.deepEqual(["c1", "c2", "c3"].map((id) => fam.at(id)), [0, 1, 2].map((i) => ({ x: fam.at("c1").x, y: fam.at("m").y + i * NODE_HEIGHT })), "siblings are rows of one box, eldest on top");
assert.deepEqual(["c1", "c2", "c3"].map((id) => fam.node(id)!.data.part), ["top", "middle", "bottom"]);
assert.ok(fam.lines.some((e) => e.target === "c1") && !fam.lines.some((e) => e.target === "c2" || e.target === "c3"), "only the box's top row gets the line");
assert.ok(fam.at("m").x < fam.at("c1").x, "married sibling's column comes before the box");
const unionX = fam.nodes.find((n) => n.id.startsWith("u:a"))!.position.x;
assert.equal(unionX, (fam.at("m").x + fam.at("c1").x + NODE_WIDTH) / 2, "founders centred over their children");

// Generations: one generation shown hides the rest and counts it...
const one = layout(famPeople, { generations: 1 });
assert.deepEqual(one.nodes.filter((n) => n.type === "person").map((n) => n.id).sort(), ["a", "b"]);
assert.equal(one.node("a")!.data.hidden, 5);
assert.equal(one.total, 2);
// ...but the line down to the focused person stays open.
assert.ok(layout(famPeople, { generations: 1, focus: "c2" }).node("c2"), "focused person is shown");

// Default: five generations or fewer show in full; deeper registers open on four.
const chainOf = (n: number): Person[] =>
  Array.from({ length: n }, (_, i) => ({ _id: `g${i}`, name: `G${i}`, fatherId: i ? `g${i - 1}` : null }));
const five = layout(chainOf(5));
assert.ok(five.node("g4") && five.shown === 5, "a five-generation register opens in full");
const chain = chainOf(6);
const deep = layout(chain);
assert.ok(deep.node("g3") && !deep.node("g4"), "a deeper one opens on four generations");
assert.equal(deep.node("g3")!.data.hidden, 2);
assert.deepEqual([deep.total, deep.shown], [6, 4]);
assert.ok(layout(chain, { generations: 5 }).node("g4"), "revealing a generation shows it");
// Clicking a card reveals everything below that person.
const opened = layout(chain, { opened: new Set(["g2"]) });
assert.ok(opened.node("g5"), "whole line below an opened person shows");
assert.ok(opened.node("g4") && opened.shown === 4, "...without changing the generations shown");

// Cycle (a is b's parent and b is a's) stays visible on row 0.
assert.equal(layout([{ _id: "a", name: "A", fatherId: "b" }, { _id: "b", name: "B", fatherId: "a" }]).at("a").y, 0);

// Foreign spouse of a parentless anchor sits beside them, joined by ⚭.
const out = layout(
  [
    { _id: "x", name: "X", partnerId: "remote" },
    { _id: "remote", name: "R", partnerId: "x" },
  ],
  { badges: new Map([["remote", "❦ Mellomida"]]) },
);
assert.equal(out.node("remote")?.data.badge, "❦ Mellomida");
assert.equal(out.at("remote").y, out.at("x").y);
assert.ok(out.at("remote").x > out.at("x").x, "local partner leads");
assert.ok(out.edges.some((e) => e.source === "x" && e.target === "remote"));

// Mellomida's view: Engelberta's parents are recorded in another register,
// so she starts a line here with her husband, children below.
const mell = layout([
  { _id: "eng", name: "Engelberta", fatherId: "pa", motherId: "ma", partnerId: "hus", birthYear: 1920 },
  { _id: "hus", name: "Husband", partnerId: "eng", birthYear: 1918 },
  { _id: "kid", name: "Kid", fatherId: "hus", motherId: "eng" },
]);
assert.deepEqual([mell.at("eng").y, mell.at("hus").y], [0, 0], "parents elsewhere: a founding couple here");
assert.ok(mell.at("kid").y > 0, "...with their children below");

// Main register's view: her own family is recorded in Mellomida.
const away = new Map(["eng", "hus", "kid", "gkid"].map((id) => [id, "❦ Mellomida"]));
const mainPeople: Person[] = [
  { _id: "pa", name: "Pa", partnerId: "ma" },
  { _id: "ma", name: "Ma", partnerId: "pa" },
  { _id: "sib", name: "Sib", fatherId: "pa", motherId: "ma" },
  { _id: "eng", name: "Engelberta", fatherId: "pa", motherId: "ma", partnerId: "hus" },
  { _id: "hus", name: "Husband", partnerId: "eng" },
  { _id: "kid", name: "Kid", fatherId: "hus", motherId: "eng" },
  { _id: "gkid", name: "Grandkid", fatherId: "kid" },
];
const main = layout(mainPeople, { badges: away, generations: 5 });
assert.ok(main.node("eng") && !main.node("kid"), "a branch recorded elsewhere stays folded");
assert.equal(main.node("hus")!.data.hidden, 2, "...saying how many wait there");
assert.equal(main.total, 2, "the stepper counts this register's generations");
assert.equal(main.node("eng")!.data.badge, "❦ Mellomida", "the register is named where the line enters it");
assert.equal(main.node("hus")!.data.badge, undefined, "...once per couple");
const branch = layout(mainPeople, { badges: away, opened: new Set(["eng"]) });
assert.ok(branch.node("gkid"), "clicking her opens the whole branch");
assert.equal(branch.node("kid")!.data.badge, undefined, "...without naming the register on every card");

console.log("tree layout: ok");
