import { motion } from "framer-motion";
import { ArrowRight, GitBranch, Network, Users } from "lucide-react";
import { Link } from "react-router";
import { BranchMark, OrnamentRule, PublicNav } from "@/components/branding";

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: "easeOut" as const },
};

export default function Landing() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="grain-overlay" aria-hidden />
      <PublicNav />

      <main className="flex-1">
        {/* ——— Hero ——— */}
        <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:pt-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,color-mix(in_oklab,var(--accent)_14%,transparent),transparent_70%)]"
          />
          <div className="relative mx-auto max-w-3xl text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="mx-auto mb-8 w-fit rounded-full border border-border/80 bg-card/70 p-5 text-primary shadow-sm"
            >
              <BranchMark className="size-14" />
            </motion.div>

            <motion.p {...fadeUp} className="label-archival mb-5 text-muted-foreground">
              Est. MMXXVI · A Public Archive of Families
            </motion.p>

            <motion.h1
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.05 }}
              className="font-serif text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl"
            >
              Every family is a story
              <span className="block italic text-primary">
                told in branches.
              </span>
            </motion.h1>

            <motion.p
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.12 }}
              className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              Compile your forebears and your descendants on the same living
              page. Unfold generations upward into the past, or downward toward
              those yet to come — siblings gathered together, branches joined,
              every relation kept in its place.
            </motion.p>

            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.2 }}
              className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Link
                to="/auth?returnTo=%2Fdashboard"
                className="label-archival inline-flex items-center gap-2 rounded-sm border border-primary/70 bg-primary px-6 py-3 text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                Begin Your Register
                <ArrowRight className="size-4" />
              </Link>
              <Link
                to="/families"
                className="label-archival inline-flex items-center gap-2 rounded-sm border border-border bg-card/80 px-6 py-3 text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
              >
                Browse the Archives
              </Link>
            </motion.div>

            <OrnamentRule className="mt-16" />
          </div>
        </section>

        {/* ——— Features ——— */}
        <section className="px-4 pb-20">
          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-3">
            {[
              {
                numeral: "I",
                icon: GitBranch,
                title: "Grow Both Directions",
                body: "Follow any branch deeper into the old generations or onward toward the new. Each entry unfolds in place, generation by generation.",
              },
              {
                numeral: "II",
                icon: Network,
                title: "Siblings, Kept Together",
                body: "Kindred who share parents are gathered beneath one bough automatically — no manual arranging, ever.",
              },
              {
                numeral: "III",
                icon: Users,
                title: "Many Families, One Archive",
                body: "Registers are public reading rooms: browse any family's tree freely; only the curator holds the pen.",
              },
            ].map(({ numeral, icon: Icon, title, body }) => (
              <motion.article
                key={numeral}
                {...fadeUp}
                className="frame-archive relative rounded-sm bg-card p-6"
              >
                <span className="absolute right-4 top-3 font-serif text-3xl italic text-accent/60">
                  {numeral}
                </span>
                <Icon className="mb-4 size-6 text-primary" strokeWidth={1.5} />
                <h3 className="mb-2 font-serif text-lg font-semibold">
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </motion.article>
            ))}
          </div>
        </section>

        {/* ——— Specimen archive teaser ——— */}
        <section className="px-4 pb-24">
          <motion.div
            {...fadeUp}
            className="frame-archive foxed relative mx-auto max-w-4xl overflow-hidden rounded-sm bg-card"
          >
            <div className="grid gap-8 p-8 sm:grid-cols-[1fr_auto] sm:items-center sm:p-10">
              <div>
                <p className="label-archival mb-3 text-muted-foreground">
                  From the Stacks · Specimen Collection
                </p>
                <h2 className="font-serif text-2xl font-semibold sm:text-3xl">
                  The Whitmore Family of Ashford Vale
                </h2>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                  Five generations, twenty-seven souls, and a handful of
                  siblings who prove the branches find each other on their own.
                  Summon this register from the archive and wander it freely —
                  Samuel & Edith's line unfolds from 1861 to the present day.
                </p>
                <Link
                  to="/families"
                  className="label-archival mt-6 inline-flex items-center gap-2 border-b border-primary/60 pb-0.5 text-primary transition-colors hover:border-primary hover:text-primary/80"
                >
                  Open the specimen register
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <div className="hidden sm:block">
                <BranchMark className="size-28 text-primary/25" />
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-border/70 bg-card/50 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row">
          <div className="flex items-center gap-2 text-primary">
            <BranchMark className="size-5" />
            <span className="font-serif text-sm font-semibold">
              The Kinship Register
            </span>
          </div>
          <nav className="flex items-center gap-5">
            <Link
              to="/families"
              className="text-xs italic text-muted-foreground transition-colors hover:text-foreground"
            >
              The Archive
            </Link>
            <Link
              to="/auth?returnTo=%2Fdashboard"
              className="text-xs italic text-muted-foreground transition-colors hover:text-foreground"
            >
              Curator's Desk
            </Link>
          </nav>
          <p className="text-xs italic text-muted-foreground">
            Compiled with care · {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}
