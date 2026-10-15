import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, ListTree, Route, Share2, Table2 } from "lucide-react";
import { toast } from "sonner";
import { Link, useParams } from "react-router";
import FamilyTreeCanvas from "@/components/FamilyTreeCanvas";
import { PublicNav } from "@/components/branding";
import { SearchField, type PickOption } from "@/components/SearchField";
import { relate } from "@/lib/kinship";
import { cn } from "@/lib/utils";
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
type Linked = FunctionReturnType<typeof api.lineage.linked>;

const VIEWS = [
  { id: "tree", Icon: ListTree, text: "Tree", title: "Show the family tree" },
  { id: "ledger", Icon: Table2, text: "Ledger", title: "Show the full ledger" },
  { id: "kinship", Icon: Route, text: "Kinship", title: "Find how two people are related" },
] as const;

export default function FamilyTreePage() {
  const { slug } = useParams<{ slug: string }>();
  const family = useQuery(api.families.getBySlug, slug ? { slug } : "skip");
  const people = useQuery(
    api.people.listByFamily,
    family ? { familyId: family._id } : "skip",
  );
  // Registers joined to this one: branches to open on the tree, people for
  // the kinship finder, names of parents recorded elsewhere.
  const linked = useQuery(
    api.lineage.linked,
    family ? { familyId: family._id } : "skip",
  );

  const [focusChoice, setFocusChoice] = useState<Id<"people"> | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState("");
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("tree");

  // Default focus is derived (eldest forebear) rather than set in an effect —
  // no cascade render, and an explicit choice always wins.
  const defaultFocus = useMemo(() => {
    if (!people || people.length === 0) return null;
    const roots = people.filter((p) => !p.fatherId && !p.motherId);
    const pool = roots.length > 0 ? roots : people;
    return [...pool].sort(
      (a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999),
    )[0]._id;
  }, [people]);
  const focusId = focusChoice ?? defaultFocus;

  const sorted = useMemo(
    () =>
      people ? [...people].sort((a, b) => a.name.localeCompare(b.name)) : [],
    [people],
  );

  const ledger = useMemo(() => {
    if (!people) return [];
    const q = ledgerFilter.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
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
        <div className="flex w-full items-center gap-4 px-6 py-4">
          <Link
            to="/families"
            className="shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-primary"
            title="Back to the archive"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex shrink-0 items-center rounded-sm border border-border bg-card p-0.5">
            {VIEWS.map(({ id, Icon, text, title }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-pressed={view === id}
                className={cn(
                  "flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors",
                  view === id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
                title={title}
              >
                <Icon className="size-4" />
                {text}
              </button>
            ))}
          </div>
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-2 sm:ml-auto"
            onClick={() => shareRegister(family.name, family.slug)}
          >
            <Share2 className="size-3.5" />
            Share
          </Button>
        </div>
      </header>

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="z-20 shrink-0 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-2">
          <div className="flex items-center gap-2">
            <span className="label-archival text-muted-foreground">
              Centre upon
            </span>
            <Select
              value={focusId ?? ""}
              onValueChange={(v) => setFocusChoice(v as Id<"people">)}
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
              ⚭ married · ❦ from a joined register · click a name to open their line · double-click to centre
            </p>
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
        ) : view === "tree" ? (
          <div className="h-full w-full p-6">
            {/* Tree canvas — needs a definite height for React Flow */}
            <FamilyTreeCanvas
              people={people}
              linked={linked}
              focusId={focusId}
              onFocusChange={(id) => setFocusChoice(id as Id<"people">)}
            />
          </div>
        ) : view === "kinship" ? (
          <KinshipPanel linked={linked} homeId={family._id} />
        ) : (
          <div className="w-full px-6 pb-8 pt-6">
            {/* Ledger */}
            {ledger.length > 0 && (
              <div className="mt-10 w-full">
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
                        <th className="px-3 py-2 label-archival text-[11px] font-medium">
                          Name
                        </th>
                        <th className="px-3 py-2 label-archival text-[11px] font-medium">
                          Years
                        </th>
                        <th className="hidden px-3 py-2 label-archival text-[11px] font-medium sm:table-cell">
                          Father
                        </th>
                        <th className="hidden px-3 py-2 label-archival text-[11px] font-medium sm:table-cell">
                          Mother
                        </th>
                        <th className="hidden px-3 py-2 label-archival text-[11px] font-medium md:table-cell">
                          Partner
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((person) => (
                        <tr
                          key={person._id}
                          className="border-b border-border/40 hover:bg-secondary/40"
                        >
                          <td className="px-3 py-2 font-serif font-medium">
                            <span className="flex items-center gap-2">
                              {person.imageUrl && (
                                <img
                                  src={person.imageUrl}
                                  alt=""
                                  className="size-6 shrink-0 rounded-full border border-border object-cover"
                                />
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
                            {person.fatherId
                              ? lookupName(person.fatherId!, linked?.people ?? people)
                              : "—"}
                          </td>
                          <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">
                            {person.motherId
                              ? lookupName(person.motherId!, linked?.people ?? people)
                              : "—"}
                          </td>
                          <td className="hidden px-3 py-2 text-xs text-muted-foreground md:table-cell">
                            {person.partnerId
                              ? lookupName(person.partnerId!, linked?.people ?? people)
                              : "—"}
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

/** Pick two people; says how the first is related to the second and who
 *  joins them, across this register and the ones joined to it. */
function KinshipPanel({ linked, homeId }: { linked: Linked | undefined; homeId: Id<"families"> }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const options = useMemo<PickOption[]>(() => {
    if (!linked) return [];
    const register = new Map(linked.families.map((f) => [f._id, f.name]));
    const home = (p: Person) => (p.familyId === homeId ? 0 : 1);
    return [...linked.people]
      .sort((x, y) => home(x) - home(y) || x.name.localeCompare(y.name))
      .map((p) => ({
        value: p._id,
        label: `${p.name}${p.birthYear ? ` (${p.birthYear})` : ""}`,
        group: home(p) ? `From · ${register.get(p.familyId)}` : undefined,
      }));
  }, [linked, homeId]);
  const result = useMemo(
    () => (linked && a && b && a !== b ? relate(linked.people, b, a) : null),
    [linked, a, b],
  );
  const nameOf = (id: string) => linked?.people.find((p) => p._id === id)?.name;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h2 className="font-serif text-xl font-semibold">How are they related?</h2>
      <p className="mt-1 text-sm italic text-muted-foreground">
        Pick two people from this register or one joined to it.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <SearchField label="Person" value={a} options={options} onChange={setA} placeholder={linked ? "Choose someone…" : "Loading…"} />
        <SearchField label="Related to" value={b} options={options} onChange={setB} placeholder={linked ? "Choose someone…" : "Loading…"} />
      </div>
      <div aria-live="polite">
        {a && b && (
          <div className="frame-archive mt-8 rounded-sm bg-card p-6">
            {a === b ? (
              <p className="font-serif text-lg">That's the same person.</p>
            ) : !result ? (
              <p className="font-serif text-lg">
                No recorded line joins {nameOf(a)} and {nameOf(b)}.
              </p>
            ) : (
              <>
                <p className="font-serif text-lg">
                  <strong>{nameOf(a)}</strong> is <strong>{nameOf(b)}</strong>'s {result.phrase}.
                </p>
                <ol className="mt-5 space-y-2 border-l-2 border-border pl-4" aria-label="Who joins them">
                  {result.path.map((link, i) => (
                    <li key={i}>
                      <span className="font-serif font-medium">{link.person.name}</span>
                      {link.word && (
                        <span className="text-sm italic text-muted-foreground">
                          {" "}— {result.path[i - 1].person.name}'s {link.word}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </>
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

/** Phones get the share sheet; elsewhere the public link is copied. */
async function shareRegister(name: string, slug: string) {
  const url = `${window.location.origin}${import.meta.env.BASE_URL}families/${slug}`;
  if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
    await navigator.share({ title: name, url }).catch(() => {}); // dismissed sheet
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied", { description: url });
  } catch {
    toast.error("Could not copy the link", { description: url });
  }
}
