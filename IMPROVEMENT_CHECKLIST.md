# Heritage-Connect Family Tree Improvement Checklist

## Overview
This checklist tracks improvements for handling large family trees (4-5+ generations) with efficient zoom/pan capabilities.
Each task must be verified (double-checked) before marking as complete.

## How to Use
- `[ ]` = Not started
- `[~]` = In progress (work begun but not verified)
- `[x]` = Done (task completed AND verified/double-checked)
- Tasks should be verified by: testing functionality, reviewing code, confirming performance improvements

## Phase 1: Foundation & Immediate Wins (Target: 1-2 days)

### 1.1 Integrate React Flow for Zoom/Pan
- [x] Install React Flow and dependencies (done with **npm**, not bun — bun is not installed on this machine)
- [x] Create `src/components/FamilyTreeCanvas.tsx` with basic React Flow implementation
- [x] Update `src/pages/FamilyTreePage.tsx` to use the new canvas (+ give it a definite height)
- [x] Remove the decorative toolbar zoom buttons — React Flow's built-in Controls (+/−/fit) and wheel/pinch zoom do the real work
- [ ] Verify: Basic tree renders with zoom/pan working (mouse wheel, pinch, drag)
- [ ] Double-check: No console errors, responsive to window resize
  - Compile-level verified: `tsc -b` green, `npm run build` green, ESLint clean on touched files. **Runtime still needs the one-time `npx convex dev`** (see Blockers)

### 1.2 Add Position Fields to Database
- [ ] Create migration script to add `positionX` and `positionY` to people table
- [ ] Update Convex schema in `src/convex/schema.ts` with new fields
- [ ] Run migration against development database
- [ ] Verify: New fields exist in database schema and can be written/read
- [ ] Double-check: Existing data migration preserves integrity, new records get default positions

### 1.3 Implement Basic Pagination in Convex
- [ ] Add `getPeopleByFamilyPaginated` function in `src/convex/people.ts`
- [ ] Add `getLineageByFamilyPaginated` function in `src/convex/lineage.ts`
- [ ] Update schema indexes for pagination efficiency
- [ ] Verify: Functions return correct paginated data with cursors
- [ ] Double-check: Edge cases handled (empty results, single page, boundary conditions)

### 1.4 Implement Loading States & Error Handling
- [ ] Add loading spinners/skeletons during data fetch
- [ ] Implement error boundaries for data fetching failures
- [ ] Add retry mechanism for failed requests
- [ ] Verify: Loading states appear/disappear appropriately, errors show user-friendly messages
- [ ] Double-check: Network error simulation works, UI doesn't break on partial failures

## Phase 2: Performance Optimization (Target: 2-3 days)

### 2.1 Implement Cursor-Based Pagination in Frontend
- [ ] Modify `FamilyTreeCanvas.tsx` to use paginated queries
- [ ] Add infinite scroll/zone-based loading when viewport nears edges
- [ ] Implement cancelation of stale requests
- [ ] Verify: New data loads when panning to new areas, no duplicate requests
- [ ] Double-check: Test with artificially delayed responses, verify no memory leaks

### 2.2 Add Database Indexes for Performance
- [ ] Update `src/convex/schema.ts` with indexes:
  - People: `by_family`, `by_generation`, `by_name`, `by_birth_year`
  - Lineage: `by_family`, `by_parent`, `by_child`, `by_parents`
- [ ] Verify indexes are created in Convex dashboard
- [ ] Query performance improved for common operations
- [ ] Double-check: Explain query plans show index usage, no collection scans

### 2.3 Implement Layout Pre-computation
- [ ] Create `src/convex/layout.ts` with tree layout algorithm
- [ ] Add mutation to compute and store positions for existing trees
- [ ] Schedule layout computation on tree creation/update
- [ ] Verify: Positions are calculated and stored correctly
- [ ] Double-check: Layout looks aesthetically pleasing, nodes don't overlap excessively

### 2.4 Optimize React Flow Rendering
- [ ] Ensure React Flow's built-in virtualization is working (check DOM node count)
- [ ] Implement `getBoundingBox` optimization for node/edge rendering
- [ ] Add requestAnimationFrame throttling for rapid updates
- [ ] Verify: Only visible nodes/edges rendered in DOM during pan/zoom
- [ ] Double-check: Performance profiling shows consistent 60fps during interaction

## Phase 3: Advanced Features & UX (Target: 3-5 days)

### 3.1 Implement Web Worker for Heavy Computations
- [ ] Create `src/components/treeLayoutWorker.ts`
- [ ] Create hook `useTreeWorker.ts` for worker communication
- [ ] Offload layout calculations to worker when dataset > 50 nodes
- [ ] Verify: Main thread remains responsive during layout computation
- [ ] Double-check: Worker terminates properly, no transferable object errors

### 3.2 Add Navigation & Interaction Features
- [ ] Implement search/filter functionality (find person by name)
- [ ] Add relationship highlighting (show path between two selected nodes)
- [ ] Implement collapsible subtrees (double-click to collapse/expand)
- [ ] Add notes/media attachment indicators on nodes
- [x] **Regression ported**: cross-register partner branches now render in the canvas (foreign spouse beside the anchor with a ⚭ edge + a badge naming the spouse's register). One level only: the spouse's own children/lineage live in their register. Old `tree/FamilyTree.tsx` deleted (review 2026-10-15 #10)
  - shortcut: remote nodes sit beside/under their anchor, can overlap distant local nodes on huge trees — upgrade: include them in the row-aware layout pass (task 2.3)
- [ ] Verify: Search returns correct results, highlighting works, collapse saves state
- [ ] Double-check: Keyboard accessibility for all controls, screen reader friendly

### 3.3 Enhance User Experience
- [ ] Add mini-map with adjustable size/position
- [ ] Implement custom zoom buttons (+, -, fit, reset)
- [ ] Add coordinate display showing current viewport position
- [ ] Implement undo/redo for node position changes
- [ ] Verify: All controls work intuitively, state persists across sessions
- [ ] Double-check: Touch gestures work on mobile devices, hover states don't interfere

### 3.4 Implement Data Visualization Options
- [ ] Add generation-based color coding
- [ ] Implement different layout algorithms (tidydree, force-directed optional)
- [ ] Add ability to show/hide certain relationship types
- [ ] Implement density-based node sizing (more descendants = larger node)
- [ ] Verify: Visual toggles work immediately, performance stays smooth
- [ ] Double-check: Colorblind-friendly palettes, sufficient contrast ratios

## Phase 4: Testing & Validation (Ongoing)

### 4.1 Performance Benchmarks
- [ ] Create test datasets of various sizes (50, 100, 200, 500, 1000+ nodes)
- [ ] Measure: Initial load time, FPS during pan/zoom, memory usage
- [ ] Target: <2s initial load for 200 nodes, >45fps during interaction
- [ ] Verify: Performance meets targets across device types (desktop/mobile)
- [ ] Double-check: Test on low-end devices, verify graceful degradation

### 4.2 Reliability Testing
- [ ] Test with malformed data (missing relationships, circular references)
- [ ] Verify: Error handling prevents crashes, provides meaningful feedback
- [ ] Test network conditions: offline, slow 3G, intermittent connectivity
- [ ] Verify: App recovers gracefully, caches data appropriately
- [ ] Double-check: Stress test with rapid user interactions, no race conditions

### 4.3 Code Quality Review
- [ ] Run ESLint and Prettier on all new/modified files
- [ ] Verify: No new linting errors, code follows project conventions
- [ ] Check: All new components have proper TypeScript typings
- [ ] Verify: No `any` types, exhaustive switch statements where applicable
- [ ] Double-check: Peer review of complex algorithms (layout, pagination)

## Completion Criteria
All tasks marked `[x]` must have been:
1. Successfully implemented
2. Tested in development environment
3. Verified by manual testing OR automated tests
4. Double-checked by reviewing code/functionality
5. Confirmed not to introduce regressions

## Blockers (updated 2026-10-14)
1. **Runtime needs a Convex deployment** — `src/convex/_generated/` now exists as clearly-marked **placeholder files** (canonical Convex boilerplate; `npx convex dev` overwrites them with authoritative versions). What's still missing: `.env` with `CONVEX_URL`/`VITE_CONVEX_URL`. Fix (user, one-time, in a real terminal): `npx convex dev` → log in → it creates `.env`, regenerates `_generated`, pushes the schema. Attempted here: non-interactive shells and the local Docker backend both require interactive prompts.
   - Until then: compile is green (`tsc -b` ✓, `npm run build` ✓) but the app cannot fetch data at runtime.
2. **Lint baseline**: the `FamilyTreePage.tsx:40` effect error is fixed (auto-focus is now derived state, no setState-in-effect). `npx eslint src` still reports ~60 pre-existing errors in untouched template files (`Dashboard.tsx`, `Auth.tsx`, …) — out of scope for this checklist; worth a separate cleanup pass.

## Notes
- Update this checklist as progress is made
- If a task reveals dependency issues, note them and adjust planning
- Consider creating GitHub issues for any blockers discovered during implementation
- Celebrate when major phases are completed! 🎉

Last updated: $(date)