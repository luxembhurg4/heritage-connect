import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

type Person = Doc<"people">;
type PersonId = Id<"people">;

interface FamilyTreeProps {
  people: Person[];
  focusId: PersonId;
  onFocusChange?: (id: PersonId) => void;
}

interface Edge {
  from: PersonId;
  to: PersonId;
}

function sortKey(p: Person): number {
  return p.birthYear ?? 9999;
}

export function FamilyTree({ people, focusId, onFocusChange }: FamilyTreeProps) {
  const byId = useMemo(
    () => new Map(people.map((p) => [p._id, p])),
    [people],
  );

  const [upOpen, setUpOpen] = useState<Set<string>>(() => new Set([focusId]));
  const [downOpen, setDownOpen] = useState<Set<string>>(
    () => new Set([focusId]),
  );

  // Re-center expansions whenever a new focus person is chosen.
  useEffect(() => {
    setUpOpen(new Set([focusId]));
    setDownOpen(new Set([focusId]));
  }, [focusId]);

  const partnerOf = (p?: Person): Person | undefined => {
    if (!p) return undefined;
    if (p.partnerId) {
      const direct = byId.get(p.partnerId);
      if (direct) return direct;
    }
    // Defensive: if a legacy bond is one-sided (the partner names this person
    // but not vice versa), still draw the couple instead of hiding the spouse.
    return people.find((q) => q.partnerId === p._id);
  };

  const parentsOfCouple = (a?: Person, b?: Person): Person[] => {
    const ids = new Set<string>();
    for (const member of [a, b]) {
      if (member?.fatherId) ids.add(member.fatherId);
      if (member?.motherId) ids.add(member.motherId);
    }
    return [...ids]
      .map((id) => byId.get(id as PersonId))
      .filter((p): p is Person => Boolean(p))
      .sort((x, y) => sortKey(x) - sortKey(y));
  };

  const childrenOfCouple = (a?: Person, b?: Person): Person[] => {
    const found = new Map<PersonId, Person>();
    for (const member of [a, b]) {
      if (!member) continue;
      for (const child of people) {
        if (child.fatherId === member._id || child.motherId === member._id) {
          found.set(child._id, child);
        }
      }
    }
    return [...found.values()].sort((x, y) => sortKey(x) - sortKey(y));
  };

  // Pure view graph derived from expansion state — nodes + visible edges.
  const { edges } = useMemo(() => {
    const visited = new Set<string>();
    const collectedEdges: Edge[] = [];
    const walk = (id: PersonId) => {
      if (visited.has(id)) return;
      visited.add(id);
      const person = byId.get(id);
      if (!person) return;
      const partner = partnerOf(person);
      if (upOpen.has(id)) {
        for (const parent of parentsOfCouple(person, partner)) {
          collectedEdges.push({ from: parent._id, to: id });
          walk(parent._id);
        }
      }
      if (downOpen.has(id)) {
        for (const child of childrenOfCouple(person, partner)) {
          collectedEdges.push({ from: id, to: child._id });
          walk(child._id);
        }
      }
    };
    walk(focusId);
    return { edges: collectedEdges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byId, focusId, upOpen, downOpen]);

  // ---- Measured SVG connectors -------------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);

  const measure = () => {
    const root = containerRef.current;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const next: string[] = [];
    for (const edge of edges) {
      const fromEl = root.querySelector<HTMLElement>(
        `[data-node="${edge.from}"]`,
      );
      const toEl = root.querySelector<HTMLElement>(`[data-node="${edge.to}"]`);
      if (!fromEl || !toEl) continue;
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      const x1 = fr.left + fr.width / 2 - rootRect.left;
      const y1 = fr.bottom - rootRect.top;
      const x2 = tr.left + tr.width / 2 - rootRect.left;
      const y2 = tr.top - rootRect.top;
      const midY = (y1 + y2) / 2;
      next.push(`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`);
    }
    setPaths(next);
  };

  useLayoutEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure);
    });
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(() => measure()).catch(() => {});
    }
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges]);

  const toggleUp = (id: string) => {
    setUpOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleDown = (id: string) => {
    setDownOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Guards the render pass against cycles in the data (bad relationships
  // must never hang the page). Fresh per render, so re-renders stay correct.
  const renderSeen = new Set<string>();

  const renderNode = (id: PersonId): ReactNode => {
    if (renderSeen.has(id)) return null;
    renderSeen.add(id);
    const person = byId.get(id);
    if (!person) return null;
    const partner = partnerOf(person);

    const allParents = parentsOfCouple(person, partner);
    const allChildren = childrenOfCouple(person, partner);
    const showParents = upOpen.has(id);
    const showChildren = downOpen.has(id);
    const parents = showParents ? allParents : null;
    const children = showChildren ? allChildren : null;

    return (
      <div className="flex flex-col items-center">
        {/* Older generations above */}
        {parents ? (
          <div className="flex items-start justify-center gap-x-8 pb-10 sm:gap-x-12">
            {parents.map((p) => (
              <div key={p._id}>{renderNode(p._id)}</div>
            ))}
          </div>
        ) : allParents.length > 0 ? (
          <button
            type="button"
            onClick={() => toggleUp(id)}
            className="label-archival mb-9 flex items-center gap-1.5 rounded-full border border-dashed border-border bg-card/70 px-3 py-1 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <ChevronUp className="size-3" />
            Lineage · {allParents.length}
          </button>
        ) : (
          <div
            aria-hidden
            className="mb-9 text-[10px] tracking-[0.35em] text-muted-foreground/40"
          >
            ···
          </div>
        )}

        <PersonCluster
          person={person}
          partner={partner}
          focusId={focusId}
          onSelect={onFocusChange}
          onFoldUp={
            showParents && allParents.length > 0 ? () => toggleUp(id) : undefined
          }
          onFoldDown={
            showChildren && allChildren.length > 0
              ? () => toggleDown(id)
              : undefined
          }
        />

        {/* Newer generations below */}
        {children ? (
          <div className="flex items-start justify-center pt-10">
            {children.map((c) => (
              <div key={c._id} className="px-3">
                {renderNode(c._id)}
              </div>
            ))}
          </div>
        ) : allChildren.length > 0 ? (
          <button
            type="button"
            onClick={() => toggleDown(id)}
            className="label-archival mt-9 flex items-center gap-1.5 rounded-full border border-dashed border-border bg-card/70 px-3 py-1 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <ChevronDown className="size-3" />
            Posterity · {allChildren.length}
          </button>
        ) : (
          <div aria-hidden className="mt-9 h-6" />
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <svg
        className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible"
        aria-hidden
      >
        {paths.map((d, i) => (
          <path
            key={`${d}-${i}`}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.25}
            strokeLinejoin="round"
            className="text-muted-foreground/55"
          />
        ))}
      </svg>
      <div className="relative z-10">{renderNode(focusId)}</div>
    </div>
  );
}

function PersonCluster({
  person,
  partner,
  focusId,
  onSelect,
  onFoldUp,
  onFoldDown,
}: {
  person: Person;
  partner?: Person;
  focusId: Id<"people">;
  onSelect?: (id: PersonId) => void;
  onFoldUp?: () => void;
  onFoldDown?: () => void;
}) {
  return (
    <div
      data-node={person._id}
      className="group/node relative z-10 flex items-stretch justify-center gap-1"
    >
      {(person._id === focusId || partner?._id === focusId) && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-sm bg-secondary px-2 py-0.5 text-[10px] italic text-secondary-foreground shadow-sm">
          in view
        </span>
      )}
      {onFoldUp && (
        <button
          type="button"
          title="Fold lineage"
          onClick={(e) => {
            e.stopPropagation();
            onFoldUp();
          }}
          className="absolute -top-2.5 left-1/2 z-20 flex size-5 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-all hover:border-primary/50 hover:text-primary group-hover/node:opacity-100"
        >
          <ChevronUp className="size-3" />
        </button>
      )}
      {onFoldDown && (
        <button
          type="button"
          title="Fold posterity"
          onClick={(e) => {
            e.stopPropagation();
            onFoldDown();
          }}
          className="absolute -bottom-2.5 left-1/2 z-20 flex size-5 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-all hover:border-primary/50 hover:text-primary group-hover/node:opacity-100"
        >
          <ChevronDown className="size-3" />
        </button>
      )}

      <PersonCard
        person={person}
        highlighted={person._id === focusId}
        onSelect={() => onSelect?.(person._id)}
 />
      {partner && (
        <>
          <div
            aria-hidden
            className="flex select-none items-center px-0.5 text-accent"
            title="Joined"
          >
            ❧
          </div>
          <PersonCard
            person={partner}
            highlighted={partner._id === focusId}
            onSelect={() => onSelect?.(partner._id)}
          />
        </>
      )}
    </div>
  );
}

function PersonCard({
  person,
  highlighted,
  onSelect,
}: {
  person: Person;
  highlighted: boolean;
  onSelect: () => void;
}) {
  let years = "Dates unknown";
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
      onClick={onSelect}
      title={person.name}
      className={cn(
        "w-36 cursor-pointer rounded-sm border bg-card px-2.5 py-2 text-left shadow-[0_1px_2px_rgba(60,40,20,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md sm:w-40",
        highlighted ? "border-primary ring-1 ring-primary/45" : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        {person.imageUrl ? (
          <img
            src={person.imageUrl}
            alt={person.name}
            className="size-7 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full border font-serif text-xs font-bold",
              person.sex === "female"
                ? "border-accent bg-secondary text-accent-foreground"
                : "border-primary/50 bg-secondary text-primary",
            )}
          >
            {person.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate font-serif text-[13px] font-semibold leading-tight">
            {person.name}
          </span>
          <span className="block truncate text-[11px] italic leading-tight text-muted-foreground">
            {years}
          </span>
        </span>
      </div>
    </button>
  );
}
