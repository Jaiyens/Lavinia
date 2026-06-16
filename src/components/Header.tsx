"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X, ArrowRight } from "lucide-react";
import { TerraMark } from "./TerraMark";
import { nav } from "@/lib/site";

export function Header() {
  const [overDark, setOverDark] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // section anchors only exist on the home page; route there first elsewhere
  const fix = (href: string) => (href.startsWith("#") && pathname !== "/" ? `/${href}` : href);

  // white text only while the header overlaps a dark section (the camera);
  // dark text everywhere else (white hero + light sections)
  useEffect(() => {
    const onScroll = () => {
      let dark = false;
      for (const id of ["hero-sky", "eyes-dark", "camera"]) {
        const el = document.getElementById(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= 64 && r.bottom >= 64) dark = true;
      }
      setOverDark(dark);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const onLight = !overDark; // dark text except over the dark camera section

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="bg-transparent">
        <nav className="container-x flex h-16 items-center justify-between gap-6">
          <div className="flex items-center gap-7">
            <a href={fix("#top")} aria-label="Terra home" className="press flex shrink-0 items-center gap-2">
              <TerraMark className={`h-6 w-6 ${onLight ? "text-accent-500" : "text-white"}`} />
              <span className={`text-xl font-semibold tracking-tight ${onLight ? "text-ink" : "text-white"}`}>
                Terra
              </span>
            </a>
            <div className="hidden items-center gap-6 md:flex">
              {nav.map((item) => (
                <a
                  key={item.href}
                  href={fix(item.href)}
                  className={`text-sm font-medium transition-colors ${
                    onLight ? "text-ink-mute hover:text-ink" : "text-white/85 hover:text-white"
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>

          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={`press -mr-1 inline-flex h-10 w-10 items-center justify-center rounded-full md:hidden ${
              onLight ? "text-ink" : "text-white"
            }`}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </nav>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="glass-rim mx-4 mt-1 rounded-2xl border border-white/55 bg-white/65 p-2 shadow-[0_24px_55px_-18px_rgba(9,40,60,0.45)] backdrop-blur-2xl backdrop-saturate-150 md:hidden"
          >
            <div className="flex flex-col gap-1">
              {nav.map((item) => (
                <a
                  key={item.href}
                  href={fix(item.href)}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-3 text-base font-medium text-ink-soft hover:bg-white/60 hover:text-ink"
                >
                  {item.label}
                </a>
              ))}
              <a
                href={fix("#inquire")}
                onClick={() => setOpen(false)}
                className="press mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-medium text-ink shadow-[0_8px_20px_-8px_rgba(9,40,60,0.35)] ring-1 ring-black/10"
              >
                Inquire
                <ArrowRight size={15} />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
