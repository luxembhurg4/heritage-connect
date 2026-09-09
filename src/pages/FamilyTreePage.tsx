import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { Link, useParams } from "react-router";
import { FamilyTree } from "@/components/tree/FamilyTree";
import { PublicNav } from "@/components/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function FamilyTreePage() {
  const { slug } = useParams<{ slug: string }>();
  const family = useQuery(api.families.getBySlug, slug ? { slug } : "skip");
  const people = useQuery(api.people.listByFamily, family ? { familyId: family._id } : "skip");

  const [focusId, setFocusId] = useState<Id<"people"> | null>(null);
  const [zoom, setZoom] = useState(1);
  const [ledgerFilter, setLedgerFilter] = useState("");

  // Auto-focus the eldest forebear when the register loads.
  useEffect(() => {
    if (people && people.length > 0 && !focusId) {
      const roots = people.filter((p) => !p.fatherId && !p.motherId);
      const pool = roots.length > 0 ? roots : people;
      const eldest = [...pool].sort(
        (a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999),
      )[0];
      setFocusId(eldest._id);
    }
  }, [people, focusId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(
    () =>
      people
        ? [...people].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [people],
  );

  const ledger = useMemo(() => {
    if (!people) return [];
    const q = ledgerFilter.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      String(p.birthYear ?? "").includes(q),
    );
  }, [people, ledgerFilter]);

  // ── loading / 404 ─────────────────────────────────────────────
  if (family === undefined) {
    return (
      <div className="relative flex h-screen flex-col bg-background">
        <div className="grain-overlay" aria-hidden />
        <PublicNav />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm italic text-muted-foreground">Consulting the shelves…</p>
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
            <h1 className="font-serif text-2xl font-semibold">Register not found</h1>
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
            <span className="label-archival text-muted-foreground">Centre upon</span>
            <Select value={focusId ?? ""} onValueChange={(v) => setFocusId(v as Id<"people">)}>
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
              ❧ joined · click a name to re-centre · click a child to expand their family
            </p>
            <div className="flex items-center gap-0.5 rounded-sm border border-border bg-card p-0.5">
              <button
                type="button"
                title="Zoom in"
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
                title="Zoom out"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
                className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Minus className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body: tree + ledger ─────────────────────────────── */}
      <div className="relative flex-1 overflow-auto bg-card/30">
        {!hasPeople ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm italic text-muted-foreground">
              This register awaits its first entries.
            </p>
          </div>
        ) : (
          <div className="mx-auto w-fit min-w-max px-8 pb-8 pt-6">
            {/* Tree canvas */}
            <div className="mx-auto w-fit">
              <FamilyTree people={people} focusId={focusId!} onFocusChange={setFocusId} zoom={zoom} />
            </div>

            {/* Ledger */}
            {ledger.length > 0 && (
              <div className="mt-12 w-full max-w-3xl">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="label-archival text-xs tracking-[0.3em] text-muted-foreground/70">
                    FULL LEDGER · {ledger.length}
                  </h2>
                  <Input
                    placeholder="Search ledger…"
                    value={ledgerFilter}
                    onChange={(e) => setLedgerFilter(e.target.value)}
                    className="w-48 bg-background/60 font-serif text-sm"
                  />
                </div>
                <div className="frame-archive rounded-sm border border-border/60 bg-card/70 p-4">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-muted-foreground">
                        <th className="px-3 py-2 label-archival text-[11px] font-medium">Name</th>
                        <th className="px-3 py-2 label-archival text-[11px] font-medium">Years</th>
                        <th className="hidden px-3 py-2 label-archival text-[11px] font-medium sm:table-cell">Father</th>
                        <th className="hidden px-3 py-2 label-archival text-[11px] font-medium sm:table-cell">Mother</th>
                        <th className="hidden px-3 py-2 label-archival text-[11px] font-medium md:table-cell">Partner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((person) => (
                        <tr key={person._id} className="border-b border-border/40 hover:bg-secondary/40">
                          <td className="px-3 py-2 font-serif font-medium">
                            <span className="flex items-center gap-2">
                              {person.imageUrl && (
                                <img src={person.imageUrl} alt="" className="size-6 shrink-0 rounded-full border border-border object-cover" />
                              )}
                              <span className="truncate">{person.name}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs italic tabular-nums text-muted-foreground">
                            {person.birthYear || person.deathYear
                              ? `${person.birthYear ?? "?"} – ${person.deathYear ?? ""}`
                              : "—"}
                          </td>
                          <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">
                            {person.fatherId ? lookupName(person.fatherId!, people) : "—"}
                          </td>
                          <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">
                            {person.motherId ? lookupName(person.motherId!, people) : "—"}
                          </td>
                          <td className="hidden px-3 py-2 text-xs text-muted-foreground md:table-cell">
                            {person.partnerId ? lookupName(person.partnerId!, people) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function lookupName(id: Id<"people">, people: Person[]): string {
  return people.find((p) => p._id === id)?.name ?? "—";
}
