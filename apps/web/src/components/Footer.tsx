import { Mail } from "lucide-react";
import { TerraMark } from "./TerraMark";
import { LinkedinIcon, XIcon } from "./icons";
import { founders } from "@/lib/site";

const columns = [
  {
    heading: "Product",
    links: [
      { label: "The Eyes", href: "#camera" },
      { label: "Case Study", href: "#casestudy" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About Us", href: "#about" },
      { label: "Inquire", href: "#inquire" },
    ],
  },
  {
    heading: "Contact",
    links: founders.map((f) => ({
      label: f.name.split(" ")[0],
      href: `mailto:${f.email}`,
    })),
  },
];

const socials = [
  { label: "Email", icon: Mail, href: "mailto:kamisalahuddin@gmail.com", external: false },
  { label: "X", icon: XIcon, href: "https://x.com/TerraRoboticsHQ", external: true },
  {
    label: "LinkedIn",
    icon: LinkedinIcon,
    href: "https://www.linkedin.com/company/try-terra-ai/",
    external: true,
  },
];

export function Footer() {
  return (
    <footer className="relative text-ink">
      <div className="container-x py-16">
        <div className="grid gap-12 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          {/* brand */}
          <div>
            <div className="inline-flex items-center gap-2">
              <TerraMark className="h-6 w-6 text-grass-600" />
              <span className="font-display text-2xl font-semibold tracking-tight">Terra</span>
            </div>
            <p className="mt-4 max-w-xs text-pretty text-sm leading-relaxed text-ink-mute">
              An AI-native operating system for farms. Born and raised in Fresno, built for
              the largest ag county in America.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.heading}>
              <p className="text-sm font-semibold text-ink">{col.heading}</p>
              <ul className="mt-4 space-y-3 text-sm">
                {col.links.map((link) => (
                  <li key={link.label + link.href}>
                    <a
                      href={link.href}
                      className="text-ink-mute transition-colors hover:text-ink"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 border-t border-line pt-6">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <p className="text-xs text-ink-mute">
              © {new Date().getFullYear()} Terra. All rights reserved. The operating system
              for the farm.
            </p>
            <div className="flex items-center gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  target={s.external ? "_blank" : undefined}
                  rel={s.external ? "noreferrer" : undefined}
                  className="press text-ink-mute transition-colors hover:text-ink"
                >
                  <s.icon size={18} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
