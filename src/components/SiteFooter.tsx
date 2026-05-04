import { Link } from "react-router-dom";

export const SiteFooter = () => (
  <footer className="border-t border-border/60 mt-24">
    <div className="container py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-5 w-5 rounded bg-gradient-brand" />
        <span>© {new Date().getFullYear()} Druk Digital Yigkhang</span>
      </div>
      <nav className="flex gap-5">
        <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
        <Link to="/editor" className="hover:text-foreground">Editor</Link>
        <Link to="/templates" className="hover:text-foreground">Templates</Link>
      </nav>
      <p className="text-xs">Pay with USDT (TRC20). No subscription.</p>
    </div>
  </footer>
);
