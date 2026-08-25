import { Link } from "react-router";
import { useAuth } from "@/hooks/use-auth";

/** Wax-seal style brand mark: a branching tree inside a double ring. */
export function BranchMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      aria-hidden
      role="img"
    >
      <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="2" />
      <circle cx="32" cy="32" r="25" stroke="currentColor" strokeWidth="0.75" />
      {/* trunk */}
      <path
        d="M32 50 V30"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* branches */}
      <path
        d="M32 38 C26 36 22 31 21 25 M32 34 C38 32 42 28 43 22 M32 44 C27 43 24 40 23 37 M32 41 C37 40 40 37 41 34"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* leaf dots */}
      <circle cx="21" cy="23" r="1.8" fill="currentColor" />
      <circle cx="43" cy="20" r="1.8" fill="currentColor" />
      <circle cx="23" cy="35" r="1.4" fill="currentColor" />
      <circle cx="41" cy="32" r="1.4" fill="currentColor" />
      <circle cx="32" cy="27" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function OrnamentRule({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={className ?? "flex items-center justify-center gap-3"}
    >
      <span className="h-px w-16 bg-gradient-to-r from-transparent to-border" />
      <span className="text-accent text-sm">❦</span>
      <span className="h-px w-16 bg-gradient-to-l from-transparent to-border" />
    </div>
  );
}

/** Shared navigation for public pages. */
export function PublicNav() {
  const { isAuthenticated, isLoading } = useAuth();
  return (
    <header className="border-b border-border/70 bg-card/60 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2.5 text-primary">
          <BranchMark className="size-7" />
          <span className="font-serif text-lg font-semibold tracking-wide">
            The Kinship Register
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          <Link
            to="/families"
            className="label-archival rounded-sm px-2 py-1 text-muted-foreground transition-colors hover:text-primary"
          >
            The Archive
          </Link>
          {!isLoading && isAuthenticated ? (
            <Link to="/dashboard" className="label-archival rounded-sm border border-primary/60 px-3 py-1.5 text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
              Curator's Desk
            </Link>
          ) : (
            <Link
              to="/auth?returnTo=%2Fdashboard"
              className="label-archival rounded-sm border border-primary/60 px-3 py-1.5 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
