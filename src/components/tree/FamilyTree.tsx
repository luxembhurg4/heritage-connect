import { useEffect, useMemo, useState } from "react";
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

/* ── helpers ─────────────────────────────────────────────────────── */

function sortKey(p: Person): number {
  return p.birthYear ?? 9999;
}

const DEPTH_COLORS = [
  "border-primary/20",
  "border-accent/25",
  "border-primary/15",
  "border-accent/20",
  "border-primary/12",
  "border-accent/15",
  "border-primary/10",
];

const DEPTH_BG = [
  "bg-card/50",
  "bg-card/35",
  "bg-card/25",
  "bg-card/15",
  "bg-card/10",
  "bg-card/8",
  "bg-card/5",
];

/* ── main component ──────────────────────────────────────────────── */

export function FamilyTree({
  people,
  focusId,
  onFocusChange,
  zoom = 1,
}: FamilyTreeProps) {
  const byId = useMemo(
    () => new Map(people.map((p) => [p._id, p])),
    [people],
  );

  /** Which child-chips are expanded (by their person ID). Per-level accordion. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Auto-expand: when focus changes, open up to 3 levels of descendants
  useEffect(() => {
    const auto = new Set<string>();
    let levels = 3;
    const queue: PersonId[] = [focusId];
    while (queue.length > 0 && levels > 0) {
      const next: PersonId[] = [];
      for (const pid of queue) {
        const p = byId.get(pid);
        if (!p) continue;
        const kids = childrenOf(pid);
        for (const kid of kids) {
          auto.add(kid._id);
          next.push(kid._id);
        }
      }
      queue.length = 0;
      queue.push(...next);
      levels--;
    }
    setExpanded(auto);
  }, [focusId, byId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset expansion on new focus
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── query helpers ────────────────────────────────────────────────

  const partnerOf = (p: Person): Person | undefined => {
    if (p.partnerId) {
      const direct = byId.get(p.partnerId);
      if (direct) return direct;
    }
    // Defensive reverse-lookup for legacy one-sided bonds
    return people.find((q) => q.partnerId === p._id);
  };

  const childrenOf = (id: PersonId): Person[] => {
    return people
      .filter((c) => c.fatherId === id || c.motherId === id)
      .sort((a, b) => sortKey(a) - sortKey(b));
  };

  /** All parents of a person (from both partners' links). */
  const parentsOf = (id: PersonId): Person[] => {
    const person = byId.get(id);
    if (!person) return [];
    const partner = partnerOf(person);
    const ids = new Set<string>();
    for (const member of [person, partner]) {
      if (member?.fatherId) ids.add(member.fatherId);
      if (member?.motherId) ids.add(member.motherId);
    }
    return [...ids]
      .map((i) => byId.get(i as PersonId))
      .filter((p): p is Person => Boolean(p))
      .sort((a, b) => sortKey(a) - sortKey(b));
  };

  // ── render ───────────────────────────────────────────────────────

  const focus = byId.get(focusId);
  if (!focus) return null;

  const focusPartner = partnerOf(focus);
  const focusParents = parentsOf(focusId);

  return (
    <div
      className="flex flex-col items-center gap-0 overflow-auto px-4 py-8 sm:px-8"
      style={{ zoom, transformOrigin: "top center" }}
    >
      {/* ── Ancestor chain (breadcrumb) ── */}
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
          <div className="flex items-center gap-1 text-muted-foreground/25">
            <div className="h-4 w-px bg-current" />
          </div>
        </div>
      )}

      {/* ── Focus family bubble ── */}
      <FamilyBubble
        focus={focus}
        partner={focusPartner}
        childrenList={childrenOf(focusId)}
        expanded={expanded}
        onToggle={toggleExpand}
        onSelect={onFocusChange}
        byId={byId}
        allPeople={people}
        childrenOf={childrenOf}
        partnerOf={partnerOf}
        depth={0}
      />
    </div>
  );
}

/* ── FamilyBubble: one couple + their children ─────────────────── */

function FamilyBubble({
  focus,
  partner,
  childrenList,
  expanded,
  onToggle,
  onSelect,
  byId,
  allPeople,
  childrenOf,
  partnerOf,
  depth,
}: {
  focus: Person;
  partner?: Person;
  childrenList: Person[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect?: (id: PersonId) => void;
  byId: Map<string, Person>;
  allPeople: Person[];
  childrenOf: (id: PersonId) => Person[];
  partnerOf: (p: Person) => Person | undefined;
  depth: number;
}) {
  const colorClass = DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)];
  const bgClass = DEPTH_BG[Math.min(depth, DEPTH_BG.length - 1)];

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border px-4 py-3 shadow-[0_1px_3px_rgba(60,40,20,0.1)] sm:px-5 sm:py-4",
        colorClass,
        bgClass,
      )}
    >
      {/* ── Couple row ── */}
      <div className="flex items-center justify-center gap-2">
        <PersonCard
          person={focus}
          onSelect={() => onSelect?.(focus._id)}
          compact={depth > 0}
        />
        {partner && (
          <>
            <span className="select-none text-sm text-accent/70" title="Joined">
              ❧
            </span>
            <PersonCard
              person={partner}
              onSelect={() => onSelect?.(partner._id)}
              compact={depth > 0}
            />
          </>
        )}
      </div>

      {/* ── Children chips + nested bubbles ── */}
      {childrenList.length > 0 && (
        <div className="mt-3">
          {/* Small divider */}
          <div className="mx-auto mb-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-border/50" />
            <span className="label-archival text-[9px] tracking-[0.25em] text-muted-foreground/40">
              ISSUE · {childrenList.length}
            </span>
            <div className="h-px flex-1 bg-border/50" />
          </div>

          <div className="flex flex-col gap-2.5">
            {childrenList.map((child) => {
              const isExpanded = expanded.has(child._id);
              const hasKids = hasDescendantsById(child._id, allPeople);

              return (
                <div key={child._id} className="flex flex-col items-center">
                  {/* Child chip */}
                  <button
                    type="button"
                    onClick={() => {
                      if (hasKids) onToggle(child._id);
                      onSelect?.(child._id);
                    }}
                    className={cn(
                      "group/chip relative flex items-center gap-1.5 rounded-sm border px-3 py-1.5 transition-all duration-200",
                      hasKids
                        ? "cursor-pointer border-dashed border-border bg-card/60 hover:border-primary/50 hover:bg-card hover:shadow-sm"
                        : "cursor-pointer border-transparent bg-card/40 hover:border-border hover:bg-card/60",
                    )}
                  >
                    {/* Photo or initial */}
                    {child.imageUrl ? (
                      <img
                        src={child.imageUrl}
                        alt={child.name}
                        className="size-5 shrink-0 rounded-full border border-border object-cover"
                      />
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
                      {child.name.length > 18
                        ? child.name.slice(0, 16) + "…"
                        : child.name}
                    </span>

                    {child.birthYear && (
                      <span className="text-[10px] italic text-muted-foreground/50">
                        {child.birthYear}
                      </span>
                    )}

                    {/* Expand indicator */}
                    {hasKids && (
                      <span className="ml-0.5 text-muted-foreground/40 transition-transform group-hover/chip:text-primary/60">
                        {isExpanded ? (
                          <ChevronDown className="size-3" />
                        ) : (
                          <ChevronRight className="size-3" />
                        )}
                      </span>
                    )}
                  </button>

                  {/* ── Nested family bubble (child's descendants) ── */}
                  {isExpanded && hasKids && (
                    <div className="mt-2 w-full pl-4 sm:pl-6">
                      <FamilyBubble
                        focus={child}
                        partner={partnerOf(child)}
                        childrenList={childrenOf(child._id)}
                        expanded={expanded}
                        onToggle={onToggle}
                        onSelect={onSelect}
                        byId={byId}
                        allPeople={allPeople}
                        childrenOf={childrenOf}
                        partnerOf={partnerOf}
                        depth={depth + 1}
                      />
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

function hasDescendantsById(id: PersonId, allPeople: Person[]): boolean {
  return allPeople.some((c) => c.fatherId === id || c.motherId === id);
}

/* ── PersonCard ───────────────────────────────────────────────── */

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
          ? "w-auto max-w-[180px] border-border/60 px-2 py-1.5"
          : "w-40 border-border px-2.5 py-2 sm:w-44",
      )}
    >
      {person.imageUrl ? (
        <img
          src={person.imageUrl}
          alt={person.name}
          className={cn(
            "shrink-0 rounded-full border border-border object-cover",
            compact ? "size-6" : "size-8",
          )}
        />
      ) : (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border font-serif font-bold",
            compact ? "size-6 text-[10px]" : "size-8 text-xs",
            person.sex === "female"
              ? "border-accent bg-secondary text-accent-foreground"
              : "border-primary/50 bg-secondary text-primary",
          )}
        >
          {person.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 text-left">
        <span
          className={cn(
            "block truncate font-serif font-semibold leading-tight",
            compact ? "text-[11px]" : "text-[13px]",
          )}
        >
          {person.name}
        </span>
        {years && (
          <span
            className={cn(
              "block truncate italic leading-tight text-muted-foreground",
              compact ? "text-[9px]" : "text-[11px]",
            )}
          >
            {years}
          </span>
        )}
      </span>
    </button>
  );
}
