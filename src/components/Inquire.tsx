"use client";

import { useState, type FormEvent } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Loader2, MapPin } from "lucide-react";
import { Reveal } from "./ui/Reveal";
import { GlassButton } from "./ui/GlassButton";

type Status = "idle" | "loading" | "success" | "error";

const EASE = [0.22, 1, 0.36, 1] as const;

const fieldClass =
  "w-full rounded-xl border border-line bg-white/80 px-4 py-3 text-sm text-ink placeholder:text-ink-mute transition-colors focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-ink/15";

export function Inquire() {
  const reduce = useReducedMotion();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError("");

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/inquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Something went wrong. Please try again.");
      }
      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <section id="inquire" className="relative scroll-mt-24 py-24 sm:py-32">
      <div className="container-x">
        <div className="glass-liquid glass-rim relative mx-auto grid max-w-5xl gap-12 rounded-3xl p-7 sm:p-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
          {/* left copy */}
          <Reveal>
            <p className="eyebrow">Inquire</p>
            <h2 className="mt-5 text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              <span className="text-ink">Let&apos;s talk.</span>
            </h2>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-ink-soft">
              Whether you farm in the Central Valley, want to partner, or are an investor
              following the round, we&apos;d love to hear from you.
            </p>
            <div className="mt-8 flex items-center gap-2 text-sm text-ink-mute">
              <MapPin size={16} className="text-ink-soft" />
              Fresno, California
            </div>
          </Reveal>

          {/* form */}
          <div className="relative">
            <AnimatePresence mode="wait">
              {status === "success" ? (
                <motion.div
                  key="success"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="flex h-full min-h-[20rem] flex-col items-center justify-center rounded-2xl border border-line bg-mist p-10 text-center"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white">
                    <Check size={26} />
                  </span>
                  <h3 className="mt-5 text-2xl font-semibold text-ink">
                    Thanks, we got it.
                  </h3>
                  <p className="mt-2 max-w-sm text-ink-soft">
                    We&apos;ll be in touch shortly. In the meantime, feel free to reach out
                    directly anytime.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatus("idle")}
                    className="press mt-6 text-sm font-semibold text-ink-soft hover:text-ink"
                  >
                    Send another message
                  </button>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  onSubmit={onSubmit}
                  initial={false}
                  className="grid gap-4 sm:grid-cols-2"
                >
                  <Field label="Name" className="sm:col-span-1">
                    <input name="name" required placeholder="Jane Grower" className={fieldClass} />
                  </Field>
                  <Field label="Email" className="sm:col-span-1">
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="jane@farm.com"
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Farm / Company" className="sm:col-span-1">
                    <input name="company" placeholder="Creekside Farms" className={fieldClass} />
                  </Field>
                  <Field label="Acres (optional)" className="sm:col-span-1">
                    <input name="acres" placeholder="e.g. 2,500" className={fieldClass} />
                  </Field>
                  <Field label="I am a…" className="sm:col-span-2">
                    <select name="role" className={fieldClass} defaultValue="Grower">
                      <option>Grower</option>
                      <option>Partner</option>
                      <option>Investor</option>
                      <option>Other</option>
                    </select>
                  </Field>
                  <Field label="Message" className="sm:col-span-2">
                    <textarea
                      name="message"
                      required
                      rows={4}
                      placeholder="Tell us a little about your operation or what you'd like to discuss."
                      className={`${fieldClass} resize-y`}
                    />
                  </Field>

                  {status === "error" && (
                    <p className="sm:col-span-2 text-sm text-red-600">{error}</p>
                  )}

                  <div className="sm:col-span-2">
                    <GlassButton
                      type="submit"
                      disabled={status === "loading"}
                      tone="brand"
                      className="w-full px-6 py-3.5 sm:w-auto"
                    >
                      {status === "loading" ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Sending…
                        </>
                      ) : (
                        <>
                          Send inquiry
                          <ArrowRight size={16} />
                        </>
                      )}
                    </GlassButton>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
