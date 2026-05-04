import { Link } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileSignature, Stamp, Layers, Languages, Coins, ShieldCheck } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

const features = [
  { icon: FileSignature, title: "Sign & fill official forms", desc: "Type, tick checkboxes, draw signatures right on top of any Bhutanese government PDF." },
  { icon: Stamp, title: "Bhutan legal stamps", desc: "Apply legal revenue stamps at exact 20mm × 25mm — or upload your own seal." },
  { icon: Languages, title: "English & Dzongkha", desc: "Edit forms in either language. Dzongkha PDFs render and overlay perfectly." },
  { icon: Layers, title: "118+ official templates", desc: "DCRC, Immigration, Finance, NLC, RCSC, MoFA, e-GP, Health, Education." },
  { icon: Coins, title: "Pay with USDT (TRC20)", desc: "1 credit = 1 finalized PDF. No subscriptions. New accounts get 1 free credit." },
  { icon: ShieldCheck, title: "Private by default", desc: "Your uploads stay in your account. Only you can read them." },
];

const Index = () => (
  <div className="min-h-screen flex flex-col">
    <SiteHeader />
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-40"
          style={{ backgroundImage: `url(${heroBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
          aria-hidden
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/80 to-background" aria-hidden />
        <div className="absolute inset-0 -z-10 bg-gradient-glow" aria-hidden />
        <div className="container py-20 sm:py-28 lg:py-36">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/60 px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Made for Bhutan 🇧🇹
            </span>
            <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
              Fill, sign and stamp{" "}
              <span className="text-gradient-brand">Bhutanese government forms</span>{" "}
              right in your browser.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl">
              Druk Digital Yigkhang turns 118+ official forms — in English and Dzongkha — into editable templates.
              Add text, tick boxes, drop your signature, apply a legal stamp at exact 20×25 mm, and download a finished PDF.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="hero" size="lg">
                <Link to="/templates">Browse 118 templates <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="soft" size="lg">
                <Link to="/editor">Upload your own PDF</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-16 sm:py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">Everything you need for a Bhutanese paperwork day.</h2>
          <p className="mt-3 text-muted-foreground">Built for citizens, civil servants, lawyers and businesses dealing with citizen-services forms.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group rounded-2xl border border-border/70 bg-card/60 p-6 transition hover:border-primary/40 hover:bg-card">
              <div className="h-10 w-10 rounded-xl bg-gradient-brand grid place-items-center text-primary-foreground shadow-glow">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-medium">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-24">
        <div className="rounded-3xl border border-border/70 bg-gradient-card p-8 sm:p-12 text-center shadow-card">
          <h3 className="text-2xl sm:text-3xl font-semibold">Get started free.</h3>
          <p className="mt-2 text-muted-foreground">1 free credit on signup. Top up later with USDT (TRC20).</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild variant="hero" size="lg"><Link to="/auth">Create account</Link></Button>
            <Button asChild variant="ghost" size="lg"><Link to="/pricing">See pricing</Link></Button>
          </div>
        </div>
      </section>
    </main>
    <SiteFooter />
  </div>
);

export default Index;
