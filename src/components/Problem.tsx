import { Reveal, Stagger, RevealItem } from "./ui/Reveal";
import { TiltGlass } from "./ui/TiltGlass";
import { AuroraText, TERRA_AURORA_DEEP } from "./ui/aurora-text";
import { TextReveal } from "./ui/text-reveal";
import { Highlighter } from "./ui/highlighter";
import { problems, stakes } from "@/lib/site";

export function Problem() {
  return (
    <section className="relative py-24 sm:py-32">
      {/* soft white gradient bridges the seam from the hero, no hard cut */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-36 bg-gradient-to-b from-white to-white/0"
      />

      <div className="container-x relative z-10">
        <Reveal>
          <p className="text-5xl font-semibold tracking-tight sm:text-7xl">
            <AuroraText colors={TERRA_AURORA_DEEP}>The problem</AuroraText>
          </p>
          <h2 className="mt-6 max-w-3xl text-3xl font-semibold leading-[1.12] tracking-tight text-ink sm:text-5xl">
            <TextReveal>{"Farming hasn't changed in twenty years."}</TextReveal>{" "}
            <Highlighter>The stakes have.</Highlighter>
          </h2>
          <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-ink-mute sm:text-lg">
            Margins are thinner, water is metered, and every input a farm uses
            is now reported to a regulator. The operation still runs on paper
            records and memory.
          </p>
        </Reveal>

        <Stagger className="mt-14 grid gap-5 md:grid-cols-3" stagger={0.1}>
          {problems.map((p, i) => (
            <RevealItem key={p.title} className="h-full">
              <TiltGlass className="h-full p-7">
                <span className="fig-label">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-4 text-xl font-semibold tracking-tight text-ink">{p.title}</h3>
                <p className="mt-3 text-[0.975rem] leading-relaxed text-ink-mute">{p.body}</p>
              </TiltGlass>
            </RevealItem>
          ))}
        </Stagger>

        <Reveal delay={0.05}>
          <h2 className="mt-20 max-w-3xl text-3xl font-semibold leading-[1.12] tracking-tight text-ink sm:text-5xl">
            <TextReveal>{"And everyone pays."}</TextReveal>
          </h2>
        </Reveal>
        <Stagger className="mt-6 grid gap-5 md:grid-cols-3" stagger={0.1}>
          {stakes.map((s) => (
            <RevealItem key={s.value} className="h-full">
              <TiltGlass className="h-full p-7">
                <span className="block text-4xl font-semibold leading-none tracking-tight text-ink sm:text-5xl">
                  {s.value}
                </span>
                <p className="mt-4 text-[0.95rem] leading-relaxed text-ink-mute">{s.body}</p>
              </TiltGlass>
            </RevealItem>
          ))}
        </Stagger>

        {/* the founders, on camera */}
        <Reveal delay={0.05} className="mx-auto mt-16 max-w-3xl">
          <div className="glass relative overflow-hidden rounded-[2rem] p-2">
            <video
              src="/founder-intro.mp4"
              poster="/founder-intro-poster.jpg"
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full rounded-[1.55rem] bg-black object-cover"
            />
          </div>
          <p className="mt-4 text-center text-sm text-ink-mute">
            Meet the founders. One minute on what Terra is and why we build it
            in Fresno.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
