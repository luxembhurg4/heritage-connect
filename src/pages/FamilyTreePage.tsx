import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { Link, useParams } from "react-router";
import { FamilyTree } from "@/components/tree/FamilyTree";
import { OrnamentRule, PublicNav } from "@/components/branding";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";

type Person = Doc<"people">;

function pickRoot(people: Person[]): Person {
  const roots = people.filter((p) => !p.fatherId && !p.motherId);
  const pool = roots.length > 0 ? roots : people;
  return [...pool].sort(
    (a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999),
  )[0];
}

export default function FamilyTreePage() {
  const { slug } = useParams<{ slug: string }>();
  const family = useQuery(api.families.getBySlug,
    slug ? { slug } : "skip",
  );
  const people = useQuery(
    api.people.listByFamily,
    family ? { familyId: family._id } : "skip",
  );

  const [focusId, setFocusId] = useState<Id<"people"> | null>(null);
  const [zoom, setZoom] = useState(1);

  // Choose an initial anchor once entries arrive.
  useEffect(() => {
    if (people && people.length > 0 && !focusId) {
      setFocusId(pickRoot(people)._id);
    }
  }, [people, focusId]);

  const sorted = useMemo(
    () =>
      people
        ? [...people].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [people],
  );

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="grain-overlay" aria-hidden />
      <PublicNav />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        {family === undefined ? (
          <p className="py-24 text-center text-sm italic text-muted-foreground">
            Consulting the shelves…
          </p>
        ) : family === null ? (
          <div className="frame-archive mx-auto max-w-md rounded-sm bg-card p-10 text-center">
            <h1 className="font-serif text-2xl font-semibold">
              Register not found
            </h1>
            <OrnamentRule className="my-5" />
            <p className="text-sm italic text-muted-foreground">
              No family archive answers to that name.
            </p>
            <Button asChild variant="outline" className="mt-6 gap-2">
              <Link to="/families">
                <ArrowLeft className="size-4" /> Return to the archive
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Register heading */}
            <header className="mb-6 text-center">
              <Link
                to="/families"
                className="label-archival inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
              >
                <ArrowLeft className="size-3.5" /> The Archive
              </Link>
              <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
                {family.name}
              </h1>
              {family.description && (
                <p className="mx-auto mt-2 max-w-xl text-sm italic leading-relaxed text-muted-foreground">
                  {family.description}
                </p>
              )}
              <OrnamentRule className="mt-5" />
            </header>

            {people !== undefined && people.length === 0 ? (
              <div className="frame-archive mx-auto max-w-md rounded-sm bg-card p-10 text-center">
                <h2 className="font-serif text-xl font-semibold">
                  An empty ledger
                </h2>
                <p className="mt-3 text-sm italic leading-relaxed text-muted-foreground">
                  This register awaits its first entries. Sign in as its curator
                  to begin the record.
                </p>
                <Button asChild className="mt-6 label-archival">
                  <Link to="/auth?returnTo=%2Fdashboard">To the Curator's Desk</Link>
                </Button>
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div className="mb-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
                  <div className="flex items-center gap-2">
                    <span className="label-archival text-muted-foreground">
                      Centre upon
                    </span>
                    <Select
                      value={focusId ?? ""}
                      onValueChange={(v) => setFocusId(v as Id<"people">)}
                    >
                      <SelectTrigger className="w-56 font-serif">
                        <SelectValue placeholder="Choose a soul…" />
                      </SelectTrigger>
                      <SelectContent>
                        {sorted.map((p) => (
                          <SelectItem key={p._id} value={p._id}>
                            {p.name}
                            {p.birthYear ? ` (${p.birthYear})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-sm border border-border bg-card p-0.5">
                      <button
                        type="button"
                        title="Draw nigh"
                        onClick={() => setZoom((z) => Math.min(1.5, z + 0.15))}
                        className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <Plus className="size-4" />
                      </button>
                      <span className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">
                        {Math.round(zoom * 100)}%
                      </span>
                      <button
                        type="button"
                        title="Step back"
                        onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
                        className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <Minus className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <p className="mb-4 text-center text-xs italic text-muted-foreground">
                  ❧ joined partners · ▲ unfold lineage · ▼ unfold posterity ·
                  siblings share a bough · select a card to re-centre
                </p>

                {/* Tree */}
                {people === undefined || !focusId ? (
                  <p className="py-20 text-center text-sm italic text-muted-foreground">
                    Unrolling the pedigree…
                  </p>
                ) : (
                  <div className="frame-archive relative max-h-[68vh] overflow-auto rounded-sm bg-card/40 p-8">
                    <div className="mx-auto w-fit min-w-max">
                      <FamilyTree
                        people={people}
                        focusId={focusId}
                        onFocusChange={setFocusId}
                        zoom={zoom}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-border/70 bg-card/50 py-6 text-center">
        <p className="text-xs italic text-muted-foreground">
          Preserved in The Kinship Register
        </p>
      </footer>
    </div>
  );
}
