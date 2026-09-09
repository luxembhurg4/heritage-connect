import { useCallback, useEffect, useMemo, useState } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

type Person = Doc<"people">;
type PersonId = Id<"people">;

interface FamilyTreeProps {
  people: Person[];
  focusId: PersonId;
  onFocusChange?: (id: PersonId) => void;
  zoom?: number;
}

function sortKey(p: Person): number {
  return p.birthYear ?? 9999;
}

const SIBLING_COMPACT = 8;

function isCompact(peopleCount: number): boolean {
  return peopleCount > SIBLING_COMPACT;
}

export function FamilyTree({
  people,
  focusId,
  onFocusChange,
}: FamilyTreeProps) {
  const byId = useMemo(
    () => new Map(people.map((p) => [p._id, p])),
    [people],
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);

  // Auto-expand 1 generation from the focus person (children only).
  // Grandchildren stay folded unless the family is small.
  useEffect(() => {
    const auto = new Set<string>();
    const kids = childrenOf(focusId, byId, people);
    for (const kid of kids) {
      auto.add(kid._id);
    }
    // If sibling set is small, expand grandchildren too
    if (!isCompact(kids.length)) {
      for (const kid of kids) {
        const grandkids = childrenOf(kid._id, byId, people);
        for (const gk of grandkids) {
          auto.add(gk._id);
        }
      }
    }
    setExpanded(auto);
  }, [focusId, byId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const focus = byId.get(focusId);
  if (!focus) return null;

  const focusPartner = partnerOf(focus._id, byId, people);
  const focusParents = parentsOf(focus._id, byId, people);
  const focusChildren = childrenOf(focusId, byId, people);
  const siblingCount = siblingCountOf(focusId, byId, people);

  return (
    <div className="flex flex-col items-center gap-0">
      {/* Ancestor breadcrumb */}
      {focusParents.length > 0 && (
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="label-archival text-[10px] tracking-[0.3em] text-muted-foreground/50">
            PARENTAGE
          </span>
          <div className="flex items-center gap-2">
            {focusParents.map((parent, i) => (
              <div key={parent._id} className="flex items-center gap-2">
                {i > 0 && (
                  <span className="text-muted-foreground/30">·</span>
                )}
                <button
                  type="button"
                  onClick={() => onFocusChange?.(parent._id)}
                  className="group/anc flex items-center gap-1.5 rounded-sm border border-dashed border-border bg-card/50 px-3 py-1.5 text-muted-foreground transition-all hover:border-primary/50 hover:text-primary hover:shadow-sm"
                >
                  <span className="text-[10px]">▲</span>
                  <span className="font-serif text-xs font-semibold">
                    {parent.name}
                  </span>
                  {parent.birthYear && (
                    <span className="text-[10px] italic text-muted-foreground/60">
                      {parent.birthYear}
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sibling count chip */}
      {siblingCount > 0 && (
        <div className="mb-3 flex items-center gap-1.5 rounded-sm border border-dashed border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground/70">
          <span className="label-archival text-[9px]">SIBLINGS</span>
          <span>{siblingCount}</span>
        </div>
      )}

      {/* Focus family hub */}
      <FamilyHub
        person={focus}
        spouse={focusPartner}
        parentIds={focusParents.map((p) => p._id)}
        childrenList={focusChildren}
        expanded={expanded}
        expandAll={expandAll}
        onToggle={toggleExpand}
        onSelect={onFocusChange}
        byId={byId}
        people={people}
        depth={0}
      />
    </div>
  );
}

/* ── FamilyHub ──────────────────────────────────────────────────── */

function FamilyHub({
  person,
  spouse,
  parentIds,
  childrenList,
  expanded,
  expandAll,
  onToggle,
  onSelect,
  byId,
  people,
  depth,
}: {
  person: Person;
  spouse?: Person;
  parentIds: PersonId[];
  childrenList: Person[];
  expanded: Set<string>;
  expandAll: boolean;
  onToggle: (id: string) => void;
  onSelect?: (id: PersonId) => void;
  byId: Map<string, Person>;
  people: Person[];
  depth: number;
}) {
  const bigSiblingSet = isCompact(childrenList.length);

  const isOuter = depth === 0;

  return (
    <div
      className={cn(
        "flex flex-col px-4 py-3 sm:px-5 sm:py-4",
        isOuter
          ? "shadow-none"
          : "rounded-lg shadow-[0_1px_3px_rgba(60,40,20,0.08)]",
        depth === 1 && "rounded-lg bg-card/25",
        depth > 1 && "rounded-lg bg-card/10",
      )}
    >
      {/* Couple row — side-by-side at root, stacked in nested hubs to save horizontal space */}
      {depth === 0 ? (
        <div className="flex items-center justify-center gap-2">
          <PersonCard person={person} onSelect={() => onSelect?.(person._id)} compact={false} />
          {spouse && (
            <>
              <span className="select-none text-sm text-accent/70" title="Joined">
                ❧
              </span>
              <PersonCard person={spouse} onSelect={() => onSelect?.(spouse._id)} compact={false} />
            </>
          )}
        </div>
      ) : spouse ? (
        <div className="flex flex-col items-center gap-1">
          <PersonCard person={person} onSelect={() => onSelect?.(person._id)} compact={true} />
          <span className="select-none text-[10px] text-accent/60">joined with</span>
          <PersonCard person={spouse} onSelect={() => onSelect?.(spouse._id)} compact={true} />
        </div>
      ) : (
        <PersonCard person={person} onSelect={() => onSelect?.(person._id)} compact={true} />
      )}

      {/* Children */}
      {childrenList.length > 0 && (
        <div className="mt-3">
          <div className="mx-auto mb-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-border/50" />
            <span className="label-archival text-[9px] tracking-[0.25em] text-muted-foreground/40">
              ISSUE · {childrenList.length}
            </span>
            <div className="h-px flex-1 bg-border/50" />
          </div>

          {bigSiblingSet ? (
            /* Compact row for large sibling sets — chips only, no nested bubbles unless expanded */
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {childrenList.map((child) => (
                <CompactChildChip
                  key={child._id}
                  child={child}
                  hasKids={hasDescendants(child._id, people)}
                  isExpanded={expandAll || expanded.has(child._id)}
                  onToggle={() => onToggle(child._id)}
                  onSelect={() => onSelect?.(child._id)}
                  compact={depth > 0}
                />
              ))}
            </div>
          ) : (
            /* Horizontal tree: children spread across the row, expanded hubs drop below their column.
                A child's hub renders when expanded OR when they have a partner (partner always visible).
                When the hub is showing, the chip is hidden to avoid redundant names. */
            <div className="flex flex-row flex-wrap items-start justify-center gap-x-3 gap-y-3">
              {childrenList.map((child) => {
                const childHasPartner = !!partnerOf(child._id, byId, people);
                const showHub = (expandAll || expanded.has(child._id)) && (hasDescendants(child._id, people) || childHasPartner);
                return (
                  <div key={child._id} className="flex flex-col items-center">
                    {!showHub && (
                      <ChildChip
                        child={child}
                        hasKids={hasDescendants(child._id, people)}
                        isExpanded={expandAll || expanded.has(child._id)}
                        onToggle={() => onToggle(child._id)}
                        onSelect={() => onSelect?.(child._id)}
                      />
                    )}
                    {showHub && (
                    <div className="mt-2 flex-shrink-0 w-[220px]">
                      <FamilyHub
                        person={child}
                        spouse={partnerOf(child._id, byId, people)}
                        parentIds={[child._id]}
                        childrenList={childrenOf(child._id, byId, people)}
                        expanded={expanded}
                        expandAll={expandAll}
                        onToggle={onToggle}
                        onSelect={onSelect}
                        byId={byId}
                        people={people}
                        depth={depth + 1}
                      />
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── chips ──────────────────────────────────────────────────────── */

function CompactChildChip({
  child,
  hasKids,
  isExpanded,
  onToggle,
  onSelect,
  compact,
}: {
  child: Person;
  hasKids: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  compact: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (hasKids) onToggle();
        onSelect();
      }}
      className={cn(
        "group/chip relative flex items-center gap-1.5 rounded-sm border px-2 py-1 transition-all duration-200",
        hasKids
          ? "cursor-pointer border-dashed border-border bg-card/60 hover:border-primary/50 hover:bg-card hover:shadow-sm"
          : "cursor-pointer border-transparent bg-card/40 hover:border-border hover:bg-card/60",
      )}
      title={child.name}
    >
      {child.imageUrl ? (
        <img src={child.imageUrl} alt="" className="size-4 shrink-0 rounded-full border border-border object-cover" />
      ) : (
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-full border text-[7px] font-bold",
            child.sex === "female"
              ? "border-accent/40 bg-secondary text-accent-foreground"
              : "border-primary/30 bg-secondary text-primary",
          )}
        >
          {child.name.charAt(0)}
        </span>
      )}
      <span className="font-serif text-[10px] font-semibold leading-tight truncate max-w-[88px] sm:max-w-none">
        {child.name}
      </span>
      {child.birthYear && (
        <span className="text-[8px] italic text-muted-foreground/50">
          {child.birthYear}
        </span>
      )}
      {hasKids && (
        <span className="ml-0.5 text-muted-foreground/40 transition-transform group-hover/chip:text-primary/60">
          {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </span>
      )}
    </button>
  );
}

function ChildChip({
  child,
  hasKids,
  isExpanded,
  onToggle,
  onSelect,
}: {
  child: Person;
  hasKids: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (hasKids) onToggle();
        onSelect();
      }}
      className={cn(
        "group/chip relative flex items-center gap-1.5 rounded-sm border px-3 py-1.5 transition-all duration-200",
        hasKids
          ? "cursor-pointer border-dashed border-border bg-card/60 hover:border-primary/50 hover:bg-card hover:shadow-sm"
          : "cursor-pointer border-transparent bg-card/40 hover:border-border hover:bg-card/60",
      )}
      title={child.name}
    >
      {child.imageUrl ? (
        <img src={child.imageUrl} alt="" className="size-5 shrink-0 rounded-full border border-border object-cover" />
      ) : (
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold",
            child.sex === "female"
              ? "border-accent/40 bg-secondary text-accent-foreground"
              : "border-primary/30 bg-secondary text-primary",
          )}
        >
          {child.name.charAt(0)}
        </span>
      )}
      <span className="font-serif text-xs font-semibold leading-tight">
        {child.name.length > 16 ? child.name.slice(0, 14) + "…" : child.name}
      </span>
      {child.birthYear && (
        <span className="text-[10px] italic text-muted-foreground/50">
          {child.birthYear}
        </span>
      )}
      {hasKids && (
        <span className="ml-0.5 text-muted-foreground/40 transition-transform group-hover/chip:text-primary/60">
          {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </span>
      )}
    </button>
  );
}

/* ── PersonCard ────────────────────────────────────────────────── */

function PersonCard({
  person,
  onSelect,
  compact = false,
}: {
  person: Person;
  onSelect: () => void;
  compact?: boolean;
}) {
  let years = "";
  if (person.birthYear && person.deathYear) {
    years = `${person.birthYear} – ${person.deathYear}`;
  } else if (person.birthYear) {
    years = `b. ${person.birthYear}`;
  } else if (person.deathYear) {
    years = `d. ${person.deathYear}`;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      title={person.name}
      className={cn(
        "group/card flex items-center gap-2 rounded-sm border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        compact
          ? "w-auto max-w-[200px] border-border/60 px-2 py-1.5"
          : "w-40 border-border px-2.5 py-2 sm:w-44",
      )}
    >
      {person.imageUrl ? (
        <img
          src={person.imageUrl}
          alt={person.name}
          className={cn("shrink-0 rounded-full border border-border object-cover", compact ? "size-6" : "size-8")}
        />
      ) : (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border font-serif font-bold",
            compact ? "size-6 text-[11px]" : "size-8 text-xs",
            person.sex === "female"
              ? "border-accent bg-secondary text-accent-foreground"
              : "border-primary/50 bg-secondary text-primary",
          )}
        >
          {person.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 text-left">
        <span className={cn("block truncate font-serif font-semibold leading-tight", compact ? "text-[12px]" : "text-[13px]")}>
          {person.name}
        </span>
        {years && (
          <span className={cn("mt-0.5 block w-full truncate italic leading-tight text-muted-foreground", compact ? "text-[10px]" : "text-[11px]")}>
            {years}
          </span>
        )}
      </span>
    </button>
  );
}

/* ── helpers ───────────────────────────────────────────────────── */

function partnerOf(id: PersonId, byId: Map<string, Person>, people: Person[]): Person | undefined {
  const p = byId.get(id);
  if (!p) return undefined;
  if (p.partnerId) {
    const direct = byId.get(p.partnerId);
    if (direct) return direct;
  }
  return people.find((q) => q.partnerId === id);
}

function parentsOf(id: PersonId, byId: Map<string, Person>, people: Person[]): Person[] {
  const p = byId.get(id);
  if (!p) return [];
  const partner = partnerOf(id, byId, people);
  const ids = new Set<string>();
  for (const member of [p, partner]) {
    if (member?.fatherId) ids.add(member.fatherId);
    if (member?.motherId) ids.add(member.motherId);
  }
  return [...ids]
    .map((i) => byId.get(i))
    .filter((x): x is Person => Boolean(x))
    .sort((a, b) => sortKey(a) - sortKey(b));
}

function childrenOf(id: PersonId, byId: Map<string, Person>, people: Person[]): Person[] {
  return people
    .filter((c) => c.fatherId === id || c.motherId === id)
    .sort((a, b) => sortKey(a) - sortKey(b));
}

function siblingCountOf(id: PersonId, byId: Map<string, Person>, people: Person[]): number {
  const p = byId.get(id);
  if (!p) return 0;
  const father = p.fatherId;
  const mother = p.motherId;
  return people.filter(
    (m) => m._id !== id && sameParentSet(m, { fatherId: father, motherId: mother }),
  ).length;
}

function hasDescendants(id: PersonId, people: Person[]): boolean {
  return people.some((c) => c.fatherId === id || c.motherId === id);
}

function sameParentSet(
  a: { fatherId?: Id<"people">; motherId?: Id<"people"> },
  b: { fatherId?: Id<"people">; motherId?: Id<"people"> },
): boolean {
  const aF = a.fatherId;
  const aM = a.motherId;
  const bF = b.fatherId;
  const bM = b.motherId;
  if (aF == null && aM == null) return true;
  if (bF == null && bM == null) return true;
  if (aF != null && bF != null && aM != null && bM != null) return aF === bF && aM === bM;
  if (aF != null && bF != null) return aF === bF;
  if (aM != null && bM != null) return aM === bM;
  return false;
}
