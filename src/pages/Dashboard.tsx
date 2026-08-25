import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BookOpen,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { BranchMark } from "@/components/branding";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
type FamilyDoc = Doc<"families">;

const NONE = "__none__";
const str = (v?: Id<"people"> | null) => v ?? NONE;
const unstr = (v: string): Id<"people"> | undefined =>
  v === NONE ? undefined : (v as Id<"people">);
const yearOf = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : undefined;
};

interface PersonFormState {
  name: string;
  sex: string;
  birthYear: string;
  deathYear: string;
  fatherId: string;
  motherId: string;
  partnerId: string;
}

const EMPTY_FORM: PersonFormState = {
  name: "",
  sex: NONE,
  birthYear: "",
  deathYear: "",
  fatherId: NONE,
  motherId: NONE,
  partnerId: NONE,
};

export default function Dashboard() {
  const { user, isLoading, signOut } = useAuth();
  const navigate = useNavigate();

  const families = useQuery(api.families.listMine);
  const [selectedId, setSelectedId] = useState<Id<"families"> | null>(null);

  // Keep selection valid if the list changes (e.g. deletion).
  useEffect(() => {
    if (selectedId && families && !families.some((f) => f._id === selectedId)) {
      setSelectedId(null);
    }
  }, [families, selectedId]);

  const selected =
    selectedId != null ? families?.find((f) => f._id === selectedId) : undefined;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="relative min-h-screen">
      <div className="grain-overlay" aria-hidden />

      {/* Header */}
      <header className="border-b border-border/70 bg-card/60 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5 text-primary">
            <BranchMark className="size-7" />
            <span className="font-serif text-lg font-semibold tracking-wide">
              The Kinship Register
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/families"
              className="label-archival hidden text-muted-foreground transition-colors hover:text-primary sm:inline"
            >
              The Archive
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="gap-2"
            >
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="mb-8">
          <p className="label-archival mb-2 text-muted-foreground">
            Curator's Desk
          </p>
          <h1 className="font-serif text-3xl font-bold tracking-tight">
            Welcome{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="mt-2 text-sm italic text-muted-foreground">
            Your registers are private to compose and public to read.
          </p>
        </div>

        {isLoading || families === undefined ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-12">
            {/* Left: registers */}
            <section className="lg:col-span-5">
              <NewRegisterForm onCreated={(id) => setSelectedId(id)} />
              <div className="mt-6 space-y-3">
                {families.length === 0 ? (
                  <p className="rounded-sm border border-dashed border-border p-6 text-center text-sm italic text-muted-foreground">
                    No registers yet. Open your first above.
                  </p>
                ) : (
                  families.map((family) => (
                    <RegisterRow
                      key={family._id}
                      family={family}
                      active={family._id === selectedId}
                      onSelect={() => setSelectedId(family._id)}
                    />
                  ))
                )}
              </div>
            </section>

            {/* Right: curator panel */}
            <section className="lg:col-span-7">
              {selected ? (
                <CuratorPanel key={selected._id} family={selected} />
              ) : (
                <div className="frame-archive flex h-full min-h-48 items-center justify-center rounded-sm bg-card p-10 text-center">
                  <p className="text-sm italic leading-relaxed text-muted-foreground">
                    Choose a register from your shelf,
                    <br />
                    or found a new one, to begin curating.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NewRegisterForm({
  onCreated,
}: {
  onCreated: (id: Id<"families">) => void;
}) {
  const create = useMutation(api.families.create);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Give the register a name.");
      return;
    }
    setBusy(true);
    try {
      const id = await create({
        name,
        description: description || undefined,
      });
      toast.success("A new register is opened.", {
        description: `${name.trim()} now waits for its first entry.`,
      });
      setName("");
      setDescription("");
      onCreated(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="frame-archive mb-2 rounded-sm bg-card p-5"
    >
      <h2 className="mb-4 flex items-center gap-2 font-serif text-lg font-semibold">
        <Plus className="size-4 text-primary" /> Found a New Register
      </h2>
      <div className="space-y-3">
        <div>
          <Label htmlFor="family-name" className="label-archival text-muted-foreground">
            Family Name
          </Label>
          <Input
            id="family-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The Okafor Lineage"
            className="mt-1.5 bg-background/60 font-serif"
          />
        </div>
        <div>
          <Label htmlFor="family-desc" className="label-archival text-muted-foreground">
            Description <span className="normal-case">(optional)</span>
          </Label>
          <Input
            id="family-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A line or two about this house…"
            className="mt-1.5 bg-background/60 font-serif italic"
          />
        </div>
        <Button type="submit" disabled={busy} className="label-archival w-full gap-2">
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Open Register
        </Button>
      </div>
    </form>
  );
}

function RegisterRow({
  family,
  active,
  onSelect,
}: {
  family: FamilyDoc;
  active: boolean;
  onSelect: () => void;
}) {
  const removeFamily = useMutation(api.families.remove);
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={`cursor-pointer rounded-sm border bg-card p-4 transition-all hover:border-primary/40 ${
        active
          ? "border-primary ring-1 ring-primary/40"
          : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-serif text-base font-semibold">
            {family.name}
          </h3>
          <p className="truncate text-xs italic text-muted-foreground">
            /{family.slug}
          </p>
        </div>
        <button
          type="button"
          title="Dissolve this register"
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dissolve “{family.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Every entry within it will be struck from the record. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await removeFamily({ familyId: family._id });
                  toast.success("The register has been dissolved.");
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Could not delete.",
                  );
                }
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Dissolve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CuratorPanel({ family }: { family: FamilyDoc }) {
  const people = useQuery(api.people.listByFamily, {
    familyId: family._id,
  });
  const removePerson = useMutation(api.people.remove);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Person | null>(null);

  const byId = useMemo(
    () => new Map((people ?? []).map((p) => [p._id, p])),
    [people],
  );

  const nameOf = (id?: Id<"people">) => byId.get(id!)?.name ?? "—";

  return (
    <div className="frame-archive rounded-sm bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-5">
        <div>
          <h2 className="font-serif text-xl font-semibold">{family.name}</h2>
          <p className="text-xs italic text-muted-foreground">
            {(people?.length ?? 0)} entries in the ledger
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link to={`/families/${family.slug}`}>
              <BookOpen className="size-3.5" /> View Tree
            </Link>
          </Button>
          <Button
            size="sm"
            className="label-archival gap-2"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-3.5" /> Add Entry
          </Button>
        </div>
      </div>

      {people === undefined ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : people.length === 0 ? (
        <p className="p-10 text-center text-sm italic text-muted-foreground">
          The ledger is blank. Add the first entry — perhaps the eldest known
          forebear.
        </p>
      ) : (
        <div className="overflow-x-auto p-2">
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
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {[...people]
                .sort(
                  (a, b) =>
                    (a.birthYear ?? 9999) - (b.birthYear ?? 9999) ||
                    a.name.localeCompare(b.name),
                )
                .map((person) => (
                  <tr
                    key={person._id}
                    className="border-b border-border/40 last:border-0 hover:bg-secondary/40"
                  >
                    <td className="px-3 py-2 font-serif font-medium">
                      {person.sex === "male" ? "♂ " : person.sex === "female" ? "♀ " : ""}
                      {person.name}
                    </td>
                    <td className="px-3 py-2 text-xs italic tabular-nums text-muted-foreground">
                      {person.birthYear || person.deathYear
                        ? `${person.birthYear ?? "?"} – ${person.deathYear ?? ""}`
                        : "—"}
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">
                      {nameOf(person.fatherId)}
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">
                      {nameOf(person.motherId)}
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-muted-foreground md:table-cell">
                      {nameOf(person.partnerId)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        type="button"
                        title="Amend entry"
                        onClick={() => {
                          setEditing(person);
                          setDialogOpen(true);
                        }}
                        className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Strike entry"
                        onClick={() => setPendingDelete(person)}
                        className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <PersonDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        familyId={family._id}
        members={people ?? []}
        editing={editing}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Strike {pendingDelete?.name} from the record?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Links to this person — parents, children, partners — will be
              gently undone. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep entry</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDelete) return;
                try {
                  await removePerson({ personId: pendingDelete._id });
                  toast.success("Entry struck from the record.");
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Could not delete.",
                  );
                }
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Strike entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RelationField({
  label,
  value,
  onChange,
  options,
  excludeIds,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Person[];
  excludeIds: Set<string>;
}) {
  const available = options.filter((p) => !excludeIds.has(p._id));
  return (
    <div>
      <Label className="label-archival text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1.5 font-serif">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None recorded</SelectItem>
          {available.map((p) => (
            <SelectItem key={p._id} value={p._id}>
              {p.name}
              {p.birthYear ? ` (${p.birthYear})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PersonDialog({
  open,
  onOpenChange,
  familyId,
  members,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  familyId: Id<"families">;
  members: Person[];
  editing: Person | null;
}) {
  const create = useMutation(api.people.create);
  const update = useMutation(api.people.update);
  const [form, setForm] = useState<PersonFormState>(EMPTY_FORM);
  const [prefillKey, setPrefillKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-seed the form whenever the dialog opens for a different target.
  const targetKey = editing ? `edit:${editing._id}` : "create";
  if (open && prefillKey !== targetKey) {
    setPrefillKey(targetKey);
    setForm(
      editing
        ? {
            name: editing.name,
            sex: editing.sex ?? NONE,
            birthYear: editing.birthYear?.toString() ?? "",
            deathYear: editing.deathYear?.toString() ?? "",
            fatherId: str(editing.fatherId),
            motherId: str(editing.motherId),
            partnerId: str(editing.partnerId),
          }
        : EMPTY_FORM,
    );
  }
  if (!open && prefillKey !== null) {
    setPrefillKey(null);
  }

  const set = (patch: Partial<PersonFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Every entry needs a name.");
      return;
    }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      sex:
        form.sex === "male" || form.sex === "female"
          ? (form.sex as "male" | "female")
          : undefined,
      birthYear: yearOf(form.birthYear),
      deathYear: yearOf(form.deathYear),
      fatherId: unstr(form.fatherId),
      motherId: unstr(form.motherId),
      partnerId: unstr(form.partnerId),
    };
    try {
      if (editing) {
        await update({ personId: editing._id, ...payload });
        toast.success("The entry has been amended.");
      } else {
        await create({ familyId, ...payload });
        toast.success("Entered into the register.", {
          description: payload.name,
        });
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif">
            {editing ? `Amend — ${editing.name}` : "A New Entry"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="person-name" className="label-archival text-muted-foreground">
                Full Name
              </Label>
              <Input
                id="person-name"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. Edmund Whitmore"
                className="mt-1.5 bg-background/60 font-serif"
              />
            </div>

            <div>
              <Label className="label-archival text-muted-foreground">Sex</Label>
              <Select
                value={form.sex}
                onValueChange={(v) => set({ sex: v })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unrecorded</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="birth-year" className="label-archival text-muted-foreground">
                  Born
                </Label>
                <Input
                  id="birth-year"
                  inputMode="numeric"
                  value={form.birthYear}
                  onChange={(e) => set({ birthYear: e.target.value })}
                  placeholder="1889"
                  className="mt-1.5 bg-background/60 tabular-nums"
                />
              </div>
              <div>
                <Label htmlFor="death-year" className="label-archival text-muted-foreground">
                  Died
                </Label>
                <Input
                  id="death-year"
                  inputMode="numeric"
                  value={form.deathYear}
                  onChange={(e) => set({ deathYear: e.target.value })}
                  placeholder="—"
                  className="mt-1.5 bg-background/60 tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <RelationField
              label="Father"
              value={form.fatherId}
              onChange={(v) => set({ fatherId: v })}
              options={members}
              excludeIds={
                editing
                  ? new Set([editing._id])
                  : new Set<string>()
              }
            />
            <RelationField
              label="Mother"
              value={form.motherId}
              onChange={(v) => set({ motherId: v })}
              options={members}
              excludeIds={
                editing
                  ? new Set([editing._id])
                  : new Set<string>()
              }
            />
            <RelationField
              label="Partner"
              value={form.partnerId}
              onChange={(v) => set({ partnerId: v })}
              options={members}
              excludeIds={
                editing
                  ? new Set([editing._id])
                  : new Set<string>()
              }
            />
          </div>

          <p className="text-xs italic leading-relaxed text-muted-foreground">
            Children who share a father or mother are gathered as siblings
            automatically. Partners are joined with a single bond.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="label-archival gap-2">
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {editing ? "Amend Entry" : "Add Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
