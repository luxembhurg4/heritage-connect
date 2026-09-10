import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from "lucide-react";

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
            PARENTS
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
          <span className="label-archival text-[9px]">SIBLINGS · {siblingCount}</span>
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
          <PersonCard person={person} onSelect={() => onSelect?.(person._id)} />
          {spouse && (
            <>
              <WeddingRing />
              <PersonCard person={spouse} onSelect={() => onSelect?.(spouse._id)} />
            </>
          )}
        </div>
      ) : spouse ? (
        <div className="flex flex-col items-center gap-1">
          <PersonCard person={person} onSelect={() => onSelect?.(person._id)} />
          <WeddingRing />
          <PersonCard person={spouse} onSelect={() => onSelect?.(spouse._id)} />
        </div>
      ) : (
        <PersonCard person={person} onSelect={() => onSelect?.(person._id)} />
      )}

      {/* Children */}
      {childrenList.length > 0 && (
        <div className="mt-3">
          <div className="mx-auto mb-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-border/50" />
            <span className="label-archival text-[9px] tracking-[0.25em] text-muted-foreground/40">
              CHILDREN · {childrenList.length}
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
              />
              ))}
            </div>
          ) : (
            /* Horizontal tree: children spread across the row, expanded hubs drop below their column.
                A child's hub renders when expanded OR when they have a partner (partner always visible).
                When the hub is showing, the chip is hidden to avoid redundant names.
                If the child's partner lives in ANOTHER register, render a RemoteBranch instead —
                it fetches that register's lineage on demand and embeds it here. */
            <div className="flex flex-row flex-wrap items-start justify-center gap-x-3 gap-y-3">
              {childrenList.map((child) => {
                const localPartner = partnerOf(child._id, byId, people);
                const partnerIsForeign =
                  !localPartner &&
                  !!child.partnerId &&
                  !byId.has(child.partnerId);
                const childHasKids = hasDescendants(child._id, people);
                const showHub =
                  (expandAll || expanded.has(child._id)) &&
                  (childHasKids || !!localPartner || partnerIsForeign);
                return (
                  <div key={child._id} className="flex flex-col items-center">
                    {!showHub && (
                      <PersonCard
                        person={child}
                        onSelect={() => onSelect?.(child._id)}
                        onToggle={
                          childHasKids || !!localPartner || partnerIsForeign
                            ? () => onToggle(child._id)
                            : undefined
                        }
                      />
                    )}
                    {showHub &&
                      (partnerIsForeign ? (
                        <div className="mt-2 flex-shrink-0 w-[240px]">
                          <RemoteBranch personId={child._id} depth={depth + 1} />
                        </div>
                      ) : (
                        <div className="mt-2 flex-shrink-0 w-[220px]">
                          <FamilyHub
                            person={child}
                            spouse={localPartner}
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
                      ))}
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

/* ── RemoteBranch ────────────────────────────────────────────── */

/** A person whose family lineage lives in another register. Fetches the
 *  branch on demand and embeds it here — the "dynamically expanding canvas".
 *  Children fetched this way can expand further, recursively. */
function RemoteBranch({
  personId,
  depth,
}: {
  personId: PersonId;
  depth: number;
}) {
  const branch = useQuery(api.lineage.remoteBranch, { personId });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (branch === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/40 px-4 py-6 text-xs italic text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Unrolling the branch…
      </div>
    );
  }
  if (branch === null) return null;

  const { person, spouse, children, familyName, familySlug } = branch;

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-accent/25 bg-card/25 px-3 py-3",
        "shadow-[0_1px_3px_rgba(60,40,20,0.08)]",
      )}
    >
      {/* Branch badge — names the register this lineage belongs to */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="label-archival text-[8px] tracking-[0.25em] text-accent/70">
          ❦ {familyName || "branch"}
        </span>
        {familySlug && (
          <Link
            to={`/families/${familySlug}`}
            title={`Open the ${familyName} register`}
            className="shrink-0 text-muted-foreground/60 transition-colors hover:text-primary"
          >
            <ExternalLink className="size-3" />
          </Link>
        )}
      </div>

      {/* Couple */}
      {spouse ? (
        <div className="flex flex-col items-center gap-1">
          <RemotePersonCard person={person as any} />
          <WeddingRing />
          <RemotePersonCard person={spouse as any} />
        </div>
      ) : (
        <RemotePersonCard person={person as any} />
      )}

      {/* Children — recursively expandable */}
      {children.length > 0 && (
        <div className="mt-3">
          <div className="mx-auto mb-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-border/50" />
            <span className="label-archival text-[9px] tracking-[0.25em] text-muted-foreground/40">
              CHILDREN · {children.length}
            </span>
            <div className="h-px flex-1 bg-border/50" />
          </div>
          <div className="flex flex-col gap-2">
            {children.map((child) => {
              const isOpen = expanded.has(child._id);
              return (
                <div key={child._id} className="flex flex-col items-center">
                  <RemotePersonCard
                    person={child as any}
                    onToggle={
                      () => toggle(child._id)
                    }
                  />
                  {isOpen && (
                    <div className="mt-2 w-full">
                      <RemoteBranch personId={child._id} depth={depth + 1} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Person card for remote (cross-register) people — click expands; the
 *  tree cannot re-center on them because they are not in this register. */
function RemotePersonCard({
  person,
  onToggle,
}: {
  person: {
    _id: string;
    name: string;
    sex?: "male" | "female";
    birthYear?: number;
    deathYear?: number;
    imageUrl?: string;
    partnerId?: string;
  };
  onToggle?: () => void;
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
    <div
      className="flex items-center gap-2 rounded-sm border border-border/80 bg-card px-2.5 py-2 shadow-sm"
      title={person.name}
    >
      {person.imageUrl ? (
        <img
          src={person.imageUrl}
          alt={person.name}
          className="shrink-0 rounded-full border border-border object-cover size-8"
        />
      ) : (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border font-serif font-bold size-8 text-xs",
            person.sex === "female"
              ? "border-accent bg-secondary text-accent-foreground"
              : "border-primary/50 bg-secondary text-primary",
          )}
        >
          {person.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="max-w-[150px] text-left">
        <div className="break-words font-serif font-semibold leading-snug text-[13px]">
          {person.name}
        </div>
        {years && (
          <div className="italic leading-tight text-muted-foreground text-[11px]">
            {years}
          </div>
        )}
      </div>
      {onToggle && (
        <button
          type="button"
          title="Expand family"
          onClick={onToggle}
          className="ml-0.5 self-center text-muted-foreground/50 transition-colors hover:text-primary"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
}

/* ── WeddingRing ─────────────────────────────────────────────── */

function WeddingRing() {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Married"
      className="size-4 shrink-0 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <title>Married</title>
      <circle cx="12" cy="14" r="7" />
      <path d="M9 7.5 L12 3.5 L15 7.5" />
    </svg>
  );
}

/* ── PersonCard ────────────────────────────────────────────────── */

function PersonCard({
  person,
  onSelect,
  onToggle,
}: {
  person: Person;
  onSelect: () => void;
  onToggle?: () => void;
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
      className="group/card flex items-center gap-2 rounded-sm border border-border bg-card px-2.5 py-2 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      {person.imageUrl ? (
        <img
          src={person.imageUrl}
          alt={person.name}
          className="shrink-0 rounded-full border border-border object-cover size-8"
        />
      ) : (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border font-serif font-bold size-8 text-xs",
            person.sex === "female"
              ? "border-accent bg-secondary text-accent-foreground"
              : "border-primary/50 bg-secondary text-primary",
          )}
        >
          {person.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="max-w-[150px] text-left">
        <div className="break-words font-serif font-semibold leading-snug text-[13px]">
          {person.name}
        </div>
        {years && (
          <div className="italic leading-tight text-muted-foreground text-[11px]">
            {years}
          </div>
        )}
      </div>
      {onToggle && (
        <span
          role="button"
          tabIndex={-1}
          title="Expand family"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="ml-0.5 self-center text-muted-foreground/50 transition-colors hover:text-primary"
        >
          <ChevronRight className="size-4" />
        </span>
      )}
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
