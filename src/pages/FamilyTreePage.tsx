import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { Link, useParams } from "react-router";
import { FamilyTree } from "@/components/tree/FamilyTree";
import { PublicNav } from "@/components/branding";
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

  /* ---------------------------------------------------------------
   * Loading / 404 states
   * ------------------------------------------------------------- */
  if (family === undefined) {
    return (
      <div className="relative flex h-screen flex-col bg-background">
        <div className="grain-overlay" aria-hidden />
        <PublicNav />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm italic text-muted-foreground">
            Consulting the shelves…
          </p>
        </div>
      </div>
    );
  }

  if (family === null) {
    return (
      <div className="relative flex h-screen flex-col bg-background">
        <div className="grain-overlay" aria-hidden />
        <PublicNav />
        <div className="flex flex-1 items-center justify-center">
          <div className="frame-archive max-w-md rounded-sm bg-card p-10 text-center">
            <h1 className="font-serif text-2xl font-semibold">
              Register not found
            </h1>
            <p className="mt-3 text-sm italic text-muted-foreground">
              No family archive answers to that name.
            </p>
            <Button asChild variant="outline" className="mt-6 gap-2">
              <Link to="/families">
                <ArrowLeft className="size-4" /> Return to the archive
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hasPeople = people && people.length > 0;

  return (
    <div className="relative flex h-screen flex-col bg-background">
      <div className="grain-overlay" aria-hidden />
      <PublicNav />

      {/* ── Top Ribbon ───────────────────────────────────────── */}
      <header className="shrink-0 border-b border-border/60 bg-card/70 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/families"
            className="shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-primary"
            title="Back to the archive"
          >
            <ArrowLeft className="size-5" />
          </Link>

          <div className="min-w-0 text-center sm:text-left">
            <h1 className="font-serif text-xl font-bold tracking-tight sm:text-2xl">
              {family.name}
            </h1>
            {family.description && (
              <p className="mt-0.5 line-clamp-2 text-xs italic leading-relaxed text-muted-foreground">
                {family.description}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="z-20 shrink-0 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="label-archival text-muted-foreground">
              Centre upon
            </span>
            <Select
              value={focusId ?? ""}
              onValueChange={(v) => setFocusId(v as Id<"people">)}
            >
              <SelectTrigger className="w-52 font-serif">
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

          <div className="flex items-center gap-3">
            <p className="hidden text-[10px] italic text-muted-foreground md:block">
              ❧ joined · ▲ lineage · ▼ posterity · click to re-centre
            </p>
            <div className="flex items-center gap-0.5 rounded-sm border border-border bg-card p-0.5">
              <button
                type="button"
                title="Draw nigh"
                onClick={() => setZoom((z) => Math.min(1.5, z + 0.15))}
                className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
                className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Minus className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tree Canvas (fills remaining viewport) ─────────── */}
      <div className="relative flex-1 overflow-auto bg-card/30">
        {!hasPeople || !focusId ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm italic text-muted-foreground">
              {hasPeople
                ? "Select a soul to centre the tree."
                : "This register awaits its first entries. "}
              {hasPeople ? null : (
                <Link
                  to="/auth?returnTo=%2Fdashboard"
                  className="underline underline-offset-2 hover:text-primary"
                >
                  To the Curator's Desk →
                </Link>
              )}
            </p>
          </div>
        ) : (
          <div className="mx-auto w-fit min-w-max px-8 py-12">
            <FamilyTree
              people={people}
              focusId={focusId}
              onFocusChange={setFocusId}
              zoom={zoom}
            />
          </div>
        )}
      </div>
    </div>
  );
}
