import { useMutation, useQuery } from "convex/react";
import { ArrowRight, BookOpen, LibraryBig, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { OrnamentRule, PublicNav } from "@/components/branding";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../convex/_generated/api";

export default function FamiliesDirectory() {
  const families = useQuery(api.families.list);
  const seedDemo = useMutation(api.families.seedDemo);

  const hasSpecimen = families?.some((f) => f.slug === "whitmore-family-archive");

  const handleSeed = async () => {
    try {
      await seedDemo();
      toast.success("The specimen register has been unpacked.", {
        description: "The Whitmore Family now sits on the archive shelf.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not restore the specimen.");
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="grain-overlay" aria-hidden />
      <PublicNav />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">
        <header className="mb-10 text-center">
          <p className="label-archival mb-3 text-muted-foreground">
            The Reading Room
          </p>
          <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
            The Archive
          </h1>
          <OrnamentRule className="mt-5" />
          <p className="mx-auto mt-4 max-w-md text-sm italic leading-relaxed text-muted-foreground">
            Every register below is open to any visitor. Wander the branches;
            only each family's curator may amend the record.
          </p>
        </header>

        {families === undefined ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 rounded-sm" />
            ))}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {families.map((family) => (
              <Link
                key={family._id}
                to={`/families/${family.slug}`}
                className="frame-archive group relative flex flex-col rounded-sm bg-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <BookOpen
                  className="mb-4 size-5 text-primary"
                  strokeWidth={1.5}
                />
                <h2 className="font-serif text-xl font-semibold leading-snug group-hover:text-primary">
                  {family.name}
                </h2>
                {family.description && (
                  <p className="mt-2 line-clamp-2 text-sm italic leading-relaxed text-muted-foreground">
                    {family.description}
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between pt-5">
                  <span className="label-archival text-[11px] text-muted-foreground">
                    {family.memberCount}{" "}
                    {family.memberCount === 1 ? "entry" : "entries"}
                  </span>
                  <span className="label-archival inline-flex items-center gap-1.5 text-primary">
                    Open
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            ))}

            {!hasSpecimen && (
              <button
                type="button"
                onClick={handleSeed}
                className="flex flex-col items-start rounded-sm border border-dashed border-border bg-card/50 p-6 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card"
              >
                <Sparkles className="mb-4 size-5 text-accent" strokeWidth={1.5} />
                <h2 className="font-serif text-xl font-semibold leading-snug">
                  Restore the specimen archive
                </h2>
                <p className="mt-2 text-sm italic leading-relaxed text-muted-foreground">
                  Unpack The Whitmore Family — five generations of demo lineage,
                  free to wander.
                </p>
                <span className="label-archival mt-auto inline-flex items-center gap-1.5 pt-5 text-primary">
                  Unfold specimen
                  <ArrowRight className="size-3.5" />
                </span>
              </button>
            )}

            {families.length === 0 && hasSpecimen !== false && (
              <div className="col-span-full py-16 text-center">
                <LibraryBig className="mx-auto mb-4 size-8 text-muted-foreground/50" strokeWidth={1.25} />
                <p className="text-sm italic text-muted-foreground">
                  The shelves stand empty for now.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-border/70 bg-card/50 py-6 text-center">
        <p className="text-xs italic text-muted-foreground">
          The Kinship Register · a public archive of families
        </p>
      </footer>
    </div>
  );
}
