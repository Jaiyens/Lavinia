import { Reveal } from "./ui/Reveal";
import { TextReveal } from "./ui/text-reveal";
import { LinkedinIcon } from "./icons";
import { founders } from "@/lib/site";

export function About() {
  const jaiyen = founders.find((f) => f.name.startsWith("Jaiyen"));
  const kamran = founders.find((f) => f.name.startsWith("Kamran"));

  const k = {
    slug: "kamran",
    name: kamran?.name ?? "Kamran Salahuddin",
    role: kamran?.role ?? "Co-founder & CTO",
    school: kamran?.school ?? "University of Chicago",
    linkedin: kamran?.linkedin ?? "https://www.linkedin.com/in/kamransala/",
  };
  const j = {
    slug: "jaiyen",
    name: jaiyen?.name ?? "Jaiyen Shetty",
    role: jaiyen?.role ?? "Co-founder & CEO",
    school: jaiyen?.school ?? "UC Berkeley Haas",
    linkedin: jaiyen?.linkedin ?? "https://www.linkedin.com/in/jaiyen/",
  };

  const heading = (
    <div className="relative text-center">
      <span className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[130%] w-[180%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/65 blur-2xl" />
      <h2 className="text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl">
        <TextReveal>{"We grew up around farms. And we know how to build for them."}</TextReveal>
      </h2>
    </div>
  );

  return (
    <section id="about" className="relative scroll-mt-24 overflow-hidden py-24 sm:py-28">
      <div className="container-x">
        {/* desktop: big faces flanking the heading */}
        <div className="hidden items-center justify-center lg:flex">
          <Face {...k} className="z-0 w-[30rem] shrink-0 -mr-20" />
          <Reveal className="relative z-10 w-[24rem] shrink-0">{heading}</Reveal>
          <Face {...j} className="z-0 w-[30rem] shrink-0 -ml-20" />
        </div>

        {/* mobile: heading, then the two faces */}
        <div className="lg:hidden">
          <Reveal className="mx-auto max-w-md">{heading}</Reveal>
          <div className="mt-10 grid grid-cols-2 gap-4">
            <Face {...k} className="w-full" />
            <Face {...j} className="w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Face({
  slug,
  name,
  role,
  school,
  linkedin,
  className = "",
}: {
  slug: string;
  name: string;
  role: string;
  school: string;
  linkedin: string;
  className?: string;
}) {
  const bg = {
    backgroundImage: `url(/founders/${slug}.png), url(/founders/portrait-ph.svg)`,
  } as const;

  return (
    <figure className={`relative mx-auto ${className}`}>
      {/* full face with feathered edges that blend into the background */}
      <div
        className="aspect-square w-full bg-contain bg-center bg-no-repeat grayscale"
        style={{
          ...bg,
          opacity: 0.95,
          WebkitMaskImage: "radial-gradient(80% 80% at 50% 42%, #000 62%, transparent 100%)",
          maskImage: "radial-gradient(80% 80% at 50% 42%, #000 62%, transparent 100%)",
        }}
      />

      <figcaption className="mt-1 text-center">
        <div className="flex items-center justify-center gap-2">
          <p className="text-base font-semibold tracking-tight text-ink">{name}</p>
          <a
            href={linkedin}
            target="_blank"
            rel="noreferrer"
            aria-label={`${name} on LinkedIn`}
            className="glass-liquid glass-rim press inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-accent-600"
          >
            <LinkedinIcon size={13} />
          </a>
        </div>
        <p className="text-sm font-medium text-accent">{role}</p>
        <p className="mt-0.5 text-xs text-ink-mute">{school}</p>
      </figcaption>
    </figure>
  );
}
