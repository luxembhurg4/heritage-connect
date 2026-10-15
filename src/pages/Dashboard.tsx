import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Cropper, { type Area } from "react-easy-crop";
import {
  BookOpen,
  ChevronsUpDown,
  ImagePlus,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
const childIdEquals = (familyId: Id<"families">, a?: Id<"people"> | null, b?: Id<"people"> | null) => {
  if (a == null || b == null) return false;
  return a === b;
};
const unstr = (v: string): Id<"people"> | undefined =>
  v === NONE ? undefined : (v as Id<"people">);
const yearOf = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : undefined;
};

/** A match from the name lookup — either a local member (full Person) or the
 *  slimmer shape returned by lineage.lookupByName (carries the register name). */
type NameMatch = {
  name: string;
  sex?: "male" | "female";
  birthYear?: number;
  deathYear?: number;
  fatherId?: Id<"people">;
  motherId?: Id<"people">;
  partnerId?: Id<"people">;
  familyName?: string;
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
  const access = useQuery(api.users.access);
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

        {isLoading || families === undefined || access === undefined ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !access?.approved ? (
          <div className="frame-archive mx-auto max-w-lg rounded-sm bg-card p-10 text-center">
            <p className="font-serif text-xl font-semibold">
              {access?.status === "declined" ? "Request declined" : "Request sent"}
            </p>
            <p className="mt-3 text-sm italic leading-relaxed text-muted-foreground">
              {access?.status === "declined"
                ? "The register's admin hasn't granted curator access to this account."
                : "Your request to become a curator is waiting for the admin's approval. Sign in again once you've been approved."}
            </p>
          </div>
        ) : (
          <>
          {access.isAdmin && <AccessPanel />}
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
          </>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Admin only: approve or decline curator requests, remove curators. */
function AccessPanel() {
  const people = useQuery(api.users.accessList);
  const setAccess = useMutation(api.users.setAccess);
  if (!people?.length) return null;
  const act = (userId: Id<"users">, status: "approved" | "declined", done: string) =>
    setAccess({ userId, status }).then(
      () => toast.success(done),
      (err) => toast.error(err instanceof Error ? err.message : "Could not update access."),
    );
  const group = (status: "pending" | "approved", title: string) => {
    const list = people.filter((p) => p.status === status);
    if (!list.length) return null;
    return (
      <div>
        <p className="label-archival mb-2 text-muted-foreground">{title}</p>
        <ul className="divide-y divide-border rounded-sm border border-border bg-card">
          {list.map((p) => (
            <li key={p._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {p.image && <img src={p.image} alt="" className="size-8 rounded-full" />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-sm font-semibold">{p.name ?? p.email}</p>
                <p className="truncate text-xs text-muted-foreground">{p.email}</p>
              </div>
              {status === "pending" ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => act(p._id, "approved", `${p.email} can now curate.`)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => act(p._id, "declined", "Request declined.")}>
                    Decline
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => act(p._id, "declined", `${p.email} can no longer curate.`)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <section className="mb-8 space-y-4" aria-label="Curator access">
      {group("pending", "Access requests")}
      {group("approved", "Curators")}
    </section>
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
  const repairCycles = useMutation(api.people.repairCycles);

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
            variant="outline"
            title="Detect and undo impossible relationships"
            onClick={async () => {
              try {
                const n = await repairCycles({ familyId: family._id });
                toast.success(
                  n === 0
                    ? "No tangled links found."
                    : `Untangled ${n} link${n === 1 ? "" : "s"}.`,
                );
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Could not repair.",
                );
              }
            }}
          >
            Untangle Links
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
                      <span className="flex items-center gap-2">
                        {person.imageUrl ? (
                          <img
                            src={person.imageUrl}
                            alt=""
                            className="size-6 shrink-0 rounded-full border border-border object-cover"
                          />
                        ) : null}
                        {person.sex === "male" ? "♂ " : person.sex === "female" ? "♀ " : ""}
                        <span className="truncate">{person.name}</span>
                      </span>
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

type PickOption = { value: string; label: string; group?: string };

/** Searchable picker: type part of a name or a year to narrow the list. */
function SearchField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: PickOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <div className="min-w-0">
      <Label className="label-archival text-muted-foreground">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            className="mt-1.5 w-full min-w-0 justify-between font-serif font-normal"
          >
            <span className="truncate">{current?.label ?? "None recorded"}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Search by name or year…" />
            <CommandList>
              <CommandEmpty>No one matches.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="None recorded" onSelect={() => pick(NONE)}>
                  None recorded
                </CommandItem>
              </CommandGroup>
              {groups.map((g) => (
                <CommandGroup key={g} heading={g || undefined}>
                  {options
                    .filter((o) => (o.group ?? "") === g)
                    .map((o) => (
                      // cmdk matches on value; the id keeps same-named people apart.
                      <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => pick(o.value)}>
                        {o.label}
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Cuts the framed square out of a photo at 256×256 (JPEG; white behind
 *  any transparency, which JPEG can't keep). */
async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 256, 256);
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, 256, 256);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("The photograph could not be prepared."))),
      "image/jpeg",
      0.9,
    ),
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
  const generateUploadUrl = useMutation(api.people.generateUploadUrl);
  const allRegisters = useQuery(api.families.listMine);
  // Members of the user's other registers — eligible as cross-register partners.
  const otherRegisterId = allRegisters?.find((f) => f._id !== familyId)?._id;
  const otherMembers = useQuery(
    api.people.listByFamily,
    otherRegisterId ? { familyId: otherRegisterId } : "skip",
  );
  const [form, setForm] = useState<PersonFormState>(EMPTY_FORM);
  const [prefillKey, setPrefillKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageStorageId, setImageStorageId] = useState<Id<"_storage"> | null>(
    null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showDied, setShowDied] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropArea, setCropArea] = useState<Area | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Case-insensitive match for the name currently typed: this register's own
  // members first, then a lookup across every register the curator owns — so a
  // person already recorded on another tree is caught before saving.
  const lookup = useQuery(api.lineage.lookupByName, { name: form.name });
  const existingMatch = useMemo<NameMatch | null>(() => {
    const needle = form.name.trim().toLowerCase();
    if (!needle) return null;
    const local = members.find(
      (m) => m.name.toLowerCase() === needle && m._id !== editing?._id,
    );
    if (local) return local;
    if (
      lookup &&
      lookup._id !== editing?._id &&
      lookup.name.toLowerCase() === needle
    ) {
      return lookup;
    }
    return null;
  }, [form.name, members, lookup, editing]);

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
    setImageStorageId(editing?.imageStorageId ?? null);
    setPreviewUrl(editing?.imageUrl ?? null);
    setShowDied(editing?.deathYear != null);
    setCropSrc(null);
  }
  if (!open && prefillKey !== null) {
    setPrefillKey(null);
  }

  const born = yearOf(form.birthYear);
  const named = (p: Person) => `${p.name}${p.birthYear ? ` (${p.birthYear})` : ""}`;
  const notSelf = (p: Person) => p._id !== editing?._id;
  const isSet = (v: string) => !!v && v !== NONE;
  const byYear = (a?: number, b?: number) => (a ?? 9999) - (b ?? 9999);

  // Father / Mother: men or women (unrecorded sex stays listed) born before
  // this person (unknown years stay listed), oldest first.
  const older = (p: Person) => born == null || p.birthYear == null || p.birthYear < born;
  const parentPicks = (not: "male" | "female", current: string): PickOption[] => {
    const list: PickOption[] = members
      .filter((m) => notSelf(m) && m.sex !== not && older(m))
      .sort((a, b) => byYear(a.birthYear, b.birthYear))
      .map((m) => ({ value: m._id, label: named(m) }));
    // Keep an already-recorded parent listed even if they no longer fit.
    const p = members.find((m) => m._id === current);
    if (p && !list.some((o) => o.value === current)) list.unshift({ value: current, label: named(p) });
    return list;
  };
  // Picking one parent fills in the other with their recorded partner, if empty.
  const partnerIn = (id: string) => members.find((m) => m._id === id)?.partnerId;
  const pickParent = (role: "fatherId" | "motherId", other: "fatherId" | "motherId", id: string) => {
    const spouse = isSet(id) ? partnerIn(id) : undefined;
    set({
      [role]: id,
      ...(spouse && !isSet(form[other]) && members.some((m) => m._id === spouse) ? { [other]: spouse } : {}),
    });
  };

  // Partner: the opposite sex (unrecorded sex stays listed), born within
  // 10 years of this person, not already partnered to someone else (picking
  // them would unlink their spouse); the curator's other register comes after.
  const partnered = new Set(
    [...members, ...(otherMembers ?? [])]
      .filter((m) => m.partnerId && m._id !== editing?._id)
      .flatMap((m) => [m._id as string, m.partnerId as string]),
  );
  const fits = (p: Person) =>
    notSelf(p) &&
    !partnered.has(p._id) &&
    (form.sex === NONE || !p.sex || p.sex !== form.sex) &&
    (born == null || p.birthYear == null || Math.abs(p.birthYear - born) <= 10);
  const otherName = allRegisters?.find((f) => f._id === otherRegisterId)?.name;
  const partnerPicks: PickOption[] = [
    ...members.filter(fits).sort((a, b) => byYear(a.birthYear, b.birthYear)).map((m) => ({ value: m._id, label: named(m) })),
    ...(otherMembers ?? [])
      .filter(fits)
      .sort((a, b) => byYear(a.birthYear, b.birthYear))
      .map((m) => ({ value: m._id, label: named(m), group: `From · ${otherName ?? "another register"}` })),
  ];
  if (isSet(form.partnerId) && !partnerPicks.some((o) => o.value === form.partnerId)) {
    const p = [...members, ...(otherMembers ?? [])].find((m) => m._id === form.partnerId);
    partnerPicks.unshift({ value: form.partnerId, label: p ? named(p) : "Recorded partner" });
  }

  // A chosen photo is framed first: the curator drags/zooms a square, the
  // circle inside shows what the tree displays, and only that square uploads.
  const closeCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    if (fileRef.current) fileRef.current.value = "";
  };
  const handleFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Keep photographs under 5 MB.");
      return;
    }
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropArea(null);
    setCropSrc(URL.createObjectURL(file));
  };
  const confirmCrop = async () => {
    if (!cropSrc || !cropArea) return;
    setUploading(true);
    try {
      const blob = await cropToBlob(cropSrc, cropArea);
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      if (!res.ok) throw new Error("The photograph could not be filed.");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setImageStorageId(storageId);
      setPreviewUrl(URL.createObjectURL(blob));
      closeCrop();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not upload photograph.",
      );
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    setImageStorageId(null);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const set = (patch: Partial<PersonFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Every entry needs a name.");
      return;
    }
    // If an existing record with this exact name was found and the user
    // clicked "Copy record" above, their full record is already loaded. Do
    // nothing here — the button handles the copy.
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
      imageStorageId: imageStorageId ?? undefined,
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
                onBlur={() => {
                  // Auto-fill from an existing record once the curator leaves
                  // the name field — fills only the fields still left empty.
                  // (Side effects stay outside the state updater: React may
                  // invoke updaters twice in StrictMode.)
                  if (editing || !existingMatch) return;
                  const ex = existingMatch;
                  const localIds = new Set(members.map((m) => m._id));
                  const patch: Partial<PersonFormState> = {};
                  if (form.sex === NONE && ex.sex) patch.sex = ex.sex;
                  if (!form.birthYear && ex.birthYear != null)
                    patch.birthYear = String(ex.birthYear);
                  if (!form.deathYear && ex.deathYear != null)
                    patch.deathYear = String(ex.deathYear);
                  if (form.fatherId === NONE && ex.fatherId && localIds.has(ex.fatherId))
                    patch.fatherId = ex.fatherId;
                  if (form.motherId === NONE && ex.motherId && localIds.has(ex.motherId))
                    patch.motherId = ex.motherId;
                  if (form.partnerId === NONE && ex.partnerId) {
                    const known =
                      localIds.has(ex.partnerId) ||
                      (otherMembers ?? []).some((m) => m._id === ex.partnerId);
                    if (known) patch.partnerId = ex.partnerId;
                  }
                  if (Object.keys(patch).length === 0) return;
                  set({ ...patch });
                  toast.success(
                    `Filled from ${ex.name}'s record${
                      ex.familyName ? ` in ${ex.familyName}` : ""
                    }.`,
                  );
                }}
                placeholder="e.g. Edmund Whitmore"
                className="mt-1.5 bg-background/60 font-serif"
              />                {existingMatch && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] italic text-accent">
                  <span className="inline-flex rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase text-accent-foreground">
                    Exists
                  </span>
                  {existingMatch.name} already recorded
                  {existingMatch.familyName
                    ? ` in ${existingMatch.familyName}`
                    : " in this register"}
                  —
                  <button
                    type="button"
                    onClick={() => {
                      const ex = existingMatch;
                      // Parents must belong to this register — only copy them
                      // when they live here. Partner may cross registers.
                      const localIds = new Set(members.map((m) => m._id));
                      const knownPartner =
                        ex.partnerId &&
                        (localIds.has(ex.partnerId) ||
                          (otherMembers ?? []).some(
                            (m) => m._id === ex.partnerId,
                          ));
                      setForm((prev) => ({
                        ...prev,
                        name: ex.name,
                        sex: ex.sex ?? NONE,
                        birthYear: ex.birthYear?.toString() ?? "",
                        deathYear: ex.deathYear?.toString() ?? "",
                        fatherId:
                          ex.fatherId && localIds.has(ex.fatherId)
                            ? ex.fatherId
                            : NONE,
                        motherId:
                          ex.motherId && localIds.has(ex.motherId)
                            ? ex.motherId
                            : NONE,
                        partnerId: knownPartner ? str(ex.partnerId) : NONE,
                      }));
                      setShowDied(ex.deathYear != null);
                      toast.success(`Copied ${ex.name}'s record into this register.`);
                    }}
                    className="ml-1 rounded bg-accent/15 px-1 text-[10px] font-medium text-accent-foreground transition-colors hover:bg-accent/25"
                  >
                    Copy record
                  </button>
                </p>
              )}
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
                {showDied ? (
                  <Input
                    id="death-year"
                    inputMode="numeric"
                    value={form.deathYear}
                    onChange={(e) => set({ deathYear: e.target.value })}
                    placeholder="1924"
                    className="mt-1.5 bg-background/60 tabular-nums"
                  />
                ) : (
                  <label
                    htmlFor="died-toggle"
                    className="mt-1.5 flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-dashed border-border bg-background/40 px-3"
                  >
                    <Checkbox
                      id="died-toggle"
                      checked={false}
                      onCheckedChange={(v) => setShowDied(v === true)}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SearchField
              label="Father"
              value={form.fatherId}
              options={parentPicks("female", form.fatherId)}
              onChange={(v) => pickParent("fatherId", "motherId", v)}
            />
            <SearchField
              label="Mother"
              value={form.motherId}
              options={parentPicks("male", form.motherId)}
              onChange={(v) => pickParent("motherId", "fatherId", v)}
            />
          </div>
          <SearchField
            label="Partner"
            value={form.partnerId}
            options={partnerPicks}
            onChange={(v) => set({ partnerId: v })}
          />

          <div>
            <Label className="label-archival text-muted-foreground">
              Photograph
            </Label>
            {cropSrc ? (
              <div className="mt-1.5 space-y-3">
                <div className="relative h-64 w-full overflow-hidden rounded-sm bg-muted">
                  <Cropper
                    image={cropSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    maxZoom={8}
                    showGrid={false}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(_, px) => setCropArea(px)}
                    classes={{
                      // The circle inside the square: what the tree shows.
                      cropAreaClassName:
                        "after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:border-2 after:border-white/90 after:content-['']",
                    }}
                  />
                </div>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  aria-label="Zoom photograph"
                  className="w-full accent-primary"
                />
                <p className="text-xs italic text-muted-foreground">
                  Drag to move, scroll or pinch to zoom. The circle shows what the tree will display.
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={closeCrop}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" disabled={!cropArea || uploading} onClick={confirmCrop} className="gap-2">
                    {uploading && <Loader2 className="size-3.5 animate-spin" />}
                    Use this framing
                  </Button>
                </div>
              </div>
            ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt=""
                  className="size-12 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                  <ImagePlus className="size-4" />
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="gap-2"
              >
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="size-3.5" />
                )}
                {previewUrl ? "Replace" : "Add photo"}
              </Button>
              {previewUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removePhoto}
                  className="gap-2 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" /> Remove
                </Button>
              )}
            </div>
            )}
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
