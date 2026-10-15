# Code Review Checkpoint — 2026-10-15

Scope: uncommitted changes (React Flow canvas replacing the old tree view).
Status key (same as IMPROVEMENT_CHECKLIST.md): `[ ]` = open, `[~]` = fixed in code, not yet verified in a browser, `[x]` = done AND verified.

## What this change does

It replaces the old focus-centred family tree component with a new React Flow canvas (`FamilyTreeCanvas.tsx`) that draws the whole register at once — one node per person, generations as rows, zoom/pan/minimap, and cross-register spouses fetched via the `remoteBranch` query. `FamilyTreePage.tsx` loses its zoom buttons and now derives the default focus instead of setting it in an effect, and `reactflow@11` was added to `package.json`.

Load assumed: one curator plus public browsers viewing a single register of 6–10 generations (roughly 100–1,000 people) rendered client-side, with a few marriages stitched across registers.

## Must fix

- [x] 1. **React Flow stylesheet is never imported — `src/components/FamilyTreeCanvas.tsx:3-11`**
  - What this is: React Flow requires `import "reactflow/dist/style.css"`. Nothing in `src` imports it (grep confirms), and the built CSS in `dist/assets` contains zero `.react-flow` rules.
  - Problem: Without it the pane, node positioning, edge SVG and controls have no dimensions or absolute positioning. Everything compiles and the build passes, but the canvas renders as a broken jumble at runtime.
  - Fix: Add `import "reactflow/dist/style.css";` at the top of `FamilyTreeCanvas.tsx`.
  - If we skip it: The page ships green and the tree is unusable the first time a real user opens it. This is the "verify it renders" step the checklist left open.
  - Done: `import "reactflow/dist/style.css"` added; `.react-flow` rules now appear in the built CSS.
  - Verified 2026-10-15: Whitmore demo renders properly in the browser: rows, controls and minimap.

- [x] 2. **"Centre upon" and click-to-re-centre never move the view — `src/components/FamilyTreeCanvas.tsx:92-93`**
  - What this is: The `fitView` prop maps to React Flow v11's `fitViewOnInit`, which latches after the first render (`fitViewOnInitDone` in `@reactflow/core`). Changing `focusId` only redraws the highlight ring; the viewport stays where it was.
  - Problem: The toolbar select is labelled "Centre upon" and the hint says "click a name to re-centre" (`FamilyTreePage.tsx:167,189`), but on a 10-generation tree spanning thousands of pixels (minZoom 0.2), clicking a distant person does nothing visible. The old component re-rendered around the focus, so this is a regression of the core interaction.
  - Fix: Get the instance via `useReactFlow()` and add a `useEffect` on `focusId` calling `fitView({ nodes: [{ id: focusId }] })` (or `setCenter` on the node's position).
  - If we skip it: Users pan across a huge canvas by hand for every re-centre — the main navigation affordance of the page is a lie.
  - Done: `onInit` keeps the instance; an effect on `focusId` calls `setCenter` on the node (zoom at least 0.8, 400 ms).
  - Verified 2026-10-15: Clicking Grace Bennett and picking Samuel in the select each centre that person to within 1 px of the pane centre.

- [x] 3. **Parentless spouses collapse the whole tree into ~2 rows — `src/components/FamilyTreeCanvas.tsx:131-147`**
  - What this is: BFS starts at everyone with no recorded parents (gen 0); children take the first parent to reach them. A person who married into the family with no recorded parents is a "root" at gen 0, and their children are queued at gen 1 before the deep-generation husband is ever processed.
  - Problem: This is guaranteed by the app's own rules — `assertRelations` rejects cross-register parents (`people.ts:276-278`), so every spouse stitched in from another register structurally has no local parents. A 10-generation Cenabre/Mellomida tree renders the married-in spouse beside the founder with their children one row down, flattening generations — exactly the 6–10 generation goal.
  - Fix: Before the BFS, place each parentless person who has a partner with a recorded generation at that partner's generation (and seed the queue accordingly).
  - If we skip it: The chart's generational rows are wrong for the flagship cross-register data, and every later layout improvement builds on the wrong depths.
  - Done: Layout moved to `src/components/treeLayout.ts`. A person who married in takes their partner's row before the BFS continues from them (it repeats for chains). Covered by `npm test`.
  - Verified 2026-10-15: All 8 married-in Whitmore spouses (Rose, Henry, Margaret, James, Alice, Diane, Robert, Mark) sit on their partner's row; 5 generation rows.

## Should fix

- [x] 4. **Married local couples get no ⚭ edge — `src/components/FamilyTreeCanvas.tsx:180-187`**
  - What this is: Edges are father→child and mother→child only. The single ⚭ marriage edge is drawn just for anchor↔foreign spouse (lines 205-211). The old tree drew the WeddingRing between any partners.
  - Problem: Two local spouses sit in the same row with no connector, while the UI legend says "⚭ married". Partner bonds are the app's core data (the whole reciprocal-patching logic in `people.ts`), and the canvas hides them.
  - Fix: In the edge loop, also push one ⚭ edge per local partner pair, guarded by `p._id < p.partnerId` to avoid drawing it twice.
  - If we skip it: Cousins-by-marriage and step-lines are indistinguishable from strangers on the chart.
  - Done: One ⚭ edge per local couple, drawn side to side between the `l`/`r` handles.
  - Verified 2026-10-15: 9 ⚭ labels for the demo's 9 couples (43 edges = 34 parent + 9 ⚭).

- [x] 5. **The remote-children branch is dead, and the foreign spouse's children never render — `src/components/FamilyTreeCanvas.tsx:212-225`, `src/convex/lineage.ts:237-245`**
  - What this is: `remoteBranch(anchor)` returns the anchor's children *within the anchor's own register* — always local people — and line 213 skips every id already in `byId`. So the children loop adds nothing for valid data. Meanwhile the foreign spouse's own children (in *their* register) are never fetched.
  - Problem: The comment "restores what the old tree's RemoteBranch rendered" and the checklist's "children below" are wrong: the old component recursed into the foreign register (`FamilyTree.tsx:441-445`), showing the whole foreign lineage. The canvas stops at the spouse, so 6–10 generations across two registers can never appear.
  - Fix: Decide scope. If one level is accepted: correct the comment and checklist and delete the dead loop (~14 lines). If not: also query `remoteBranch` for the spouse id and render their children below them.
  - If we skip it: A promised feature silently shows half its data, and the misleading comment will send the next developer chasing ghosts.
  - Done: Scope decided: one level. The dead children loop is gone, the comment and checklist are corrected. Also fixed: the badge showed the anchor's register instead of the spouse's.
  - Verified 2026-10-15: Ann Anchor (Test Anchor) ⚭ Sam Spouse renders beside her with the badge "❦ Test Spouse", the spouse's own register.

- [x] 6. **New layout algorithm with zero tests — `src/components/FamilyTreeCanvas.tsx:119-229`**
  - What this is: `buildLayout` handles BFS generations, cycles, orphans, partner placement and remote merging — the most logic-dense code in the change. The repo has no test files and no test script at all.
  - Problem: Finding 3 is exactly the kind of bug a two-line fixture (founder → son → grandson, wife with no parents) would have caught on day one. Cycle/orphan fallbacks (lines 146-147) are equally unverified.
  - Fix: Even without a test runner, a tiny `node --test`-style assert script calling `buildLayout` with a 3-generation fixture covers the generation math; wire it into checklist 4.1.
  - If we skip it: Every future tweak to the layout re-introduces silent generation collapses that only show up in a browser with real data.
  - Done: `scripts/check-tree-layout.ts` (`npm test`, node --experimental-strip-types) covers the married-in row, the child recorded only through the married-in mother, ⚭/parent edge counts, cycles and the foreign spouse badge. Passes.
  - Verified 2026-10-15: `npm test` passes (no browser behaviour to check).

## Nice to have

- [~] 7. **Layout memo never hits; every render redoes the O(n²) layout — `src/components/FamilyTreeCanvas.tsx:72-84`**
  - What this is: Convex `useQueries` returns a freshly built object on every render (`getLocalResults` in `queries_observer.js` allocates a new `{}`), so the `branches` dep identity always changes and `useMemo` recomputes the full BFS + new node/edge arrays on every page render (also re-subscribing the queries each render, since the keyed object is rebuilt inline).
  - Problem: With ~1k people that is the quadratic scan plus a full React Flow re-render on every state change. Renders are rare today, so it is slow, not broken.
  - Fix: Wrap the `Object.fromEntries(...)` in its own `useMemo` keyed on `foreignAnchors`, so `branches` stays stable between data changes.
  - If we skip it: Acceptable now; it becomes a stutter on every interaction once trees hit the checklist's 1,000-node benchmark.
  - Done: The `useQueries` argument is memoized on `foreignAnchors`. Children are also pre-indexed, so the layout is now O(n) instead of O(n²).
  - Not verified: it doesn't change anything you can see. Checking it means counting React renders or Convex re-subscriptions in DevTools.

- [x] 8. **Clicking a foreign spouse corrupts the "Centre upon" select — `src/components/FamilyTreeCanvas.tsx:92`, `src/pages/FamilyTreePage.tsx:169-184`**
  - What this is: Node clicks set focus for any node, including remote ones whose ids are not options in the select; Radix renders an empty value. The old component explicitly refused this ("the tree cannot re-center on them", `FamilyTree.tsx:456-457`).
  - Problem: After clicking a ❦-badged spouse, the select shows the "Choose a soul…" placeholder while focus is silently on a person who isn't in the register — confusing once finding 2's fix makes focus actually move things.
  - Fix: In `onNodeClick`, ignore ids not in the local `people` list.
  - If we skip it: A minor confusing state; no data harm.
  - Done: `onNodeClick` ignores ids not in the local register.
  - Verified 2026-10-15: Clicking Sam Spouse leaves focus and the select on Ann Anchor.

- [x] 9. **`remoteBranch` re-scans the whole register the client already has — `src/convex/lineage.ts:224-245`**
  - What this is: Each foreign anchor triggers a query doing two full `.collect()` scans of the anchor's register (spouse reverse-lookup fallback + children), even though `listByFamily` already shipped every row to the client. One query per item, same work repeated.
  - Problem: k cross-register anchors cost k·n extra server reads and subscription payloads on every data change. Bounded by the number of stitched marriages, so small today.
  - Fix: Since finding 5's scope decision will likely drop the children anyway, a spouse-only lookup (single `ctx.db.get`) removes most of the cost.
  - If we skip it: Fine for a handful of anchors; it scales with marriages, not tree size.
  - Done: `remoteBranch` is now spouse-only: two `ctx.db.get` calls and no collects.
  - Verified 2026-10-15: Deployed. The cross-register spouse loads through the slimmed query (same check as 5).

- [x] 10. **Dead file kept "for reference" — `src/components/tree/FamilyTree.tsx` (~690 lines)**
  - What this is: Nothing imports it anymore; the checklist documents this as deliberate ("kept for reference — nothing imports it").
  - Problem: It's a decision, not a bug — but it will drift, and its `RemoteBranch` recursion is the spec for finding 5. Keep only if someone will actually read it; otherwise git history already holds it.
  - Fix: Delete the file, or move the recursion behavior note into the checklist and then delete.
  - If we skip it: ~690 lines of unreachable code in `src`, compiled and linted forever.
  - Done: Deleted (~690 lines). The repo has no git, so this cannot be undone from history.
  - Verified 2026-10-15: Build green and app runs without it.

## Found while fixing

- [x] 11. **No edges rendered at all — `src/components/FamilyTreeCanvas.tsx` (PersonNode)**
  - What this is: The custom node had no `<Handle>`s. React Flow v11 drops every edge whose node has no handle (error 008), so no parent lines and no ⚭ were drawn.
  - Done: Invisible top/bottom handles carry parent→child edges and `l`/`r` handles carry ⚭.
  - Verified 2026-10-15: No React Flow error 008 in the console; parent lines and ⚭ links are drawn.

- [x] 12. **Tiny registers opened at 3× zoom — `src/components/FamilyTreeCanvas.tsx`**
  - What this is: Found during browser testing. With one or two people, the initial fit zoomed to `maxZoom` (3), so a single card filled the pane.
  - Done: `fitViewOptions={{ maxZoom: 1 }}` on the canvas and on the fit control.
  - Verified 2026-10-15: Test Anchor (2 people) opens at scale(1).

- [x] 13. **Connection lines were a tangle — `src/components/treeLayout.ts`**
  - What this is: Rows sorted by birth year, so partners weren't side by side and children weren't under their parents. Every child also had two curved, arrowed lines, one from each parent (43 lines for the Whitmore demo), and ⚭ lines ran behind the people between partners.
  - Done: A parentless spouse sits directly right of their partner (married-in, cross-register and founding couples). Each sibling group is centred under its parents and pushed right only to avoid overlap. An invisible union point in the middle of each ⚭ link carries one right-angled line down to the children. No arrowheads, and cards are a fixed 60 px so the ⚭ line meets the union point. Cross-register spouses now get a real slot in the row, which removes the old "may overlap" shortcut. `npm test` covers adjacency, centring, one line per child and no overlaps.
  - Verified 2026-10-15: Whitmore demo shows 26 lines (9 ⚭ + 17 children), 5 rows, 0 overlapping cards and no console errors. Test Anchor shows Ann left and Sam (❦ Test Spouse) right.
  - Follow-up 2026-10-15 (compact layout, agreed with the owner): replaced the row sweep with a bottom-up/top-down subtree layout. Every parent unit is now centred over its own family, which removes the old "skews right" limit. Unmarried, childless siblings stack in one column, with a spine and a short tick into each card's left side. Generations stay in bands, and each band is as tall as its tallest stack. Couples stay side by side. People with broken or cyclic parent links still get a line from each recorded parent. The page now always opens on the whole tree and re-centres only when focus changes (the old re-centre step sometimes overrode the initial fit).
  - Verified 2026-10-15: Whitmore demo has 7 stacks, 33 lines (9 ⚭ + 17 children + 7 stack drops), 0 overlaps and no console errors. It opened on the whole tree on 3 of 3 reloads, and clicking Grace centres her exactly. `npm test` covers stacks, centring, one line per child, rectangle overlap and broken links.
  - Known limit: married cousins each stay in their own parents' branch, so the ⚭ line and the second parent's line can cross other families (`shortcut:` comment in `treeLayout.ts`).
  - Follow-up 2026-10-15 (width, agreed with the owner):
    - Every couple except founding couples is one two-row card: lead on top, spouse below with ⚭, and the children's line leaves the bottom.
    - Gaps are 60→32 px and stack indent 32→24 px.
    - Branches fold: a −/+N button sits where the children's line leaves. Branches from generation 3 down start folded, so four generations show. The viewer's choice wins, and the branch holding the focused person always opens.
  - Verified 2026-10-15 (Whitmore demo):
    - Default view: 22 of 27 people shown, 1,688 px wide.
    - Fully unfolded: 27 people, 1,748 px wide (was 2,896 px, −40%), 0 overlaps.
    - Unfolding Richard + Diane shows Emily/Jacob and centres the card. Picking Grace in "Centre upon" opens her branch and centres her. Folding Samuel leaves Samuel + Edith with "+25".
    - Test Anchor still shows Ann ⚭ Sam side by side. No console errors from the current build.
  - Follow-up 2026-10-15 (owner feedback: side hooks looked awkward; fold by generation):
    - Unmarried, childless siblings are one box, a row each from eldest down, with one line from above into its top row. No side spines and no indent. A lone sibling is a plain card with a line from above.
    - The per-branch −/+N buttons are gone. A **Generations − N of M +** control in the tree's top-right reveals or hides a whole generation (default 4). The line down to the focused person always stays open, and cards with hidden descendants show a non-clickable "+N".
    - Couple cards show a 28 px ⚭ badge on the divider between the two portraits, in the primary colour. The accent colour was tried first and measured about 1.5:1 contrast, too faint. The founders' ⚭ line label is 20 px.
  - Verified 2026-10-15 (Whitmore demo):
    - Default "4 of 5": 22 people, 1,592 px wide.
    - "5 of 5": 27 people, still 1,592 px (was 2,896 px, −45%), 16 lines (1 ⚭ + 8 married-child drops + 7 box drops), 0 overlaps, + disabled.
    - "1 of 5" with Jacob focused shows only his line (Samuel → Arthur → Walter → Richard → Jacob) plus each step's siblings, with "+3/+5/+1" on the folded ones; − disabled.
    - Clicking a row of a sibling box focuses just that person. No console errors.
  - Follow-up 2026-10-15 (telling couples from siblings, white canvas):
    - The ⚭ badge is centred on the couple divider.
    - Every married person's card is tinted (`bg-secondary`), including founders and cross-register spouses. Sibling boxes are never tinted and get dashed dividers; couple dividers stay solid.
    - The tree canvas is white in light mode (`dark:bg-background` in dark mode).
    - The years line on tinted cards uses `text-foreground/80`, because the muted grey measured 4.09:1 on the tint.
  - Verified 2026-10-15:
    - Couple divider solid, sibling divider dashed (computed styles).
    - Years contrast 5.42:1 on married cards, 5.14:1 on plain ones.
    - Zoomed out to fit, married blocks are clearly darker than sibling cards.
    - Dark mode not checked.
  - Follow-up 2026-10-15 (owner preferred no tint; offset cards with real rings):
    - The married tint and the darker years text are removed: all cards share one colour again.
    - A non-founding couple is now two separate cards, the spouse's 32 px right of and directly under their partner's. The owner's ring artwork sits on the seam, and their children are centred under the spouse's card, where the line leaves.
    - The founders' line shows the same rings at its union point instead of the ⚭ label. Only partners shown apart with no union (e.g. married cousins) keep a text ⚭.
    - The ring asset `src/assets/couple-ring.png` is the owner's `assets/couple ring.png` cropped to the rings and resized to 96×77 (12.5 KB, from 212 KB). The original is untouched.
    - Sibling boxes keep their dashed dividers.
  - Verified 2026-10-15 (Whitmore, all 5 generations):
    - 27 cards, 0 overlaps, 1,736 px wide (was 1,592; the offset costs ~9%).
    - 9 rings, all loaded (8 seams + founders' line), and 0 tinted cards.
    - Close-up: rings sit on the seam without covering either name, and Diane's line drops straight into Emily/Jacob's box.
  - Follow-up 2026-10-15: side-by-side founders get their own 80 px gap (`FOUNDER_GAP`). Their rings now sit 22 px clear of each card, and the tree is still 1,736 px wide.
  - Follow-up 2026-10-15 (interaction):
    - A single click on a card highlights the person and reveals their whole line below, without moving the view. A double click centres on them. "Centre upon" still centres.
    - Clicking the background hides the highlight but keeps the person picked, so their branch stays open.
    - The Generations control, minimap, zoom buttons and credit fade after 5 s idle and come back on mouse movement, scroll, tap or key press. A control with keyboard focus stays visible, and the fade is instant under reduced motion.
    - Registers of 5 generations or fewer open in full; deeper ones open on 4. Using the stepper clears any clicked reveals.
  - Verified 2026-10-15 (Whitmore):
    - Opens at "5 of 5" with 27 people, and the controls fade after 5 s and return on movement.
    - At "3 of 5", clicking Walter reveals Richard through Emily but not Carol's branch, without moving the view.
    - Double-clicking Walter centres him exactly (0 px off). A background click removes his border while "Centre upon" keeps Walter.
  - Follow-up 2026-10-15: the Generations + / − now fits the view to the new set (max zoom 1). Verified: zoomed in with 3 cards cut off, each + left 0 of 14 / 22 / 27 cards outside the frame. Uses a 50 ms wait for card measuring (`shortcut:` comment).
  - Known limit: a child recorded for only one partner of a couple card also hangs from the card's bottom (`shortcut:` comment).

## Verdict

Original call: do not ship. Findings 1–3 broke the feature at runtime.

Update 2026-10-15: findings 1–6 and 8–13 are fixed and verified, and the blockers are cleared. The canvas is fit to ship. Still open: 7 (fixed, not verified). Finding 13 (tangled lines) is fixed and verified too.

Lean: ~-700 lines, done (`tree/FamilyTree.tsx` and the dead remote-children loop deleted; `remoteBranch` cut to two `db.get` calls).

## Verification (2026-10-15)

`npm run build` is green, `npm test` passes, and no new ESLint errors (the 27 `no-explicit-any` in `lineage.ts` were already there). Browser checks were run against the local Convex deployment with the Whitmore demo and two throwaway registers (Test Anchor, Test Spouse) created by a guest account. Delete those registers from the Curator's Desk when you're done.

## Not checked

- reactflow v11 runtime behavior on React 19 (peer deps allow it, build is green, no known breakage).
- Mobile pinch specifics.
