import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Coins, LogOut } from "lucide-react";
import { useState } from "react";

const links = [
  { to: "/", label: "Home" },
  { to: "/editor", label: "Editor" },
  { to: "/templates", label: "Templates" },
  { to: "/pricing", label: "Pricing" },
];

export const SiteHeader = () => {
  const { user, signOut } = useAuth();
  const { balance } = useCredits();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const Logo = (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span aria-hidden className="h-7 w-7 rounded-md bg-gradient-brand shadow-glow" />
      <span className="text-base sm:text-lg">Druk Digital Yigkhang</span>
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-4">
        {Logo}
        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                `px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user && (
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/60 px-3 py-1 text-xs text-muted-foreground">
              <Coins className="h-3.5 w-3.5 text-primary" />
              <span className="text-foreground font-medium">{balance ?? "—"}</span> credits
            </div>
          )}
          {user ? (
            <>
              <Button variant="hero" size="sm" className="hidden sm:inline-flex" onClick={() => navigate("/editor")}>
                Open editor
              </Button>
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" className="hidden sm:inline-flex">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button variant="hero" size="sm" className="hidden sm:inline-flex" onClick={() => navigate("/auth")}>
              Sign in
            </Button>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="mt-8 flex flex-col gap-1">
                {links.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.to === "/"}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `rounded-md px-3 py-2 text-base transition-colors ${
                        isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`
                    }
                  >
                    {l.label}
                  </NavLink>
                ))}
                <div className="my-3 h-px bg-border" />
                {user ? (
                  <>
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Balance: <span className="text-foreground font-medium">{balance ?? "—"}</span> credits
                    </div>
                    <Button variant="hero" onClick={() => { setOpen(false); navigate("/editor"); }}>
                      Open editor
                    </Button>
                    <Button variant="ghost" onClick={() => { setOpen(false); signOut(); }}>
                      Sign out
                    </Button>
                  </>
                ) : (
                  <Button variant="hero" onClick={() => { setOpen(false); navigate("/auth"); }}>
                    Sign in
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
