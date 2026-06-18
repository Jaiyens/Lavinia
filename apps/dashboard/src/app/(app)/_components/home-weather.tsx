import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Snowflake,
  Sun,
} from "lucide-react";
import { en } from "@/copy/en";
import { cardClass } from "@/components/ui";
import type { FarmWeather } from "@/lib/weather/forecast";

// Weather UI (server components) over the best-effort FarmWeather. Both the compact top-strip
// widget and the bottom forecast card render nothing-but-honest: when weather is null (offline,
// no farm location, API down) the widget renders nothing and the card shows an "unavailable" line.

const LA_TZ = "America/Los_Angeles";

/** A weather glyph for a WMO code, returned as a concrete element (no dynamic component var). */
function WeatherGlyph({
  code,
  size,
  className,
}: {
  code: number;
  size: number;
  className?: string;
}) {
  const p = { size, className, "aria-hidden": true } as const;
  if (code <= 1) return <Sun {...p} />;
  if (code === 2) return <CloudSun {...p} />;
  if (code === 45 || code === 48) return <CloudFog {...p} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle {...p} />;
  if (code >= 61 && code <= 67) return <CloudRain {...p} />;
  if (code >= 71 && code <= 77) return <Snowflake {...p} />;
  if (code >= 80 && code <= 82) return <CloudRain {...p} />;
  if (code >= 95) return <CloudLightning {...p} />;
  return <Cloud {...p} />;
}

const fmtTemp = (f: number): string => `${Math.round(f)}°`;

/** Compact current-conditions chip for the top strip. Renders nothing when weather is missing. */
export function WeatherWidget({ weather }: { weather: FarmWeather | null }) {
  if (weather === null) return null;
  return (
    <div
      className={cardClass({ className: "flex items-center gap-2.5 px-4 py-2.5" })}
      aria-label={`${en.home.weather.condition(weather.current.code)}, ${fmtTemp(weather.current.tempF)}`}
    >
      <WeatherGlyph code={weather.current.code} size={20} className="text-gold" />
      <div className="leading-tight">
        <p className="type-body-sm tnum font-semibold text-on-surface">
          {fmtTemp(weather.current.tempF)}
        </p>
        <p className="type-caption text-on-surface-variant">
          {en.home.weather.condition(weather.current.code)}
        </p>
      </div>
    </div>
  );
}

/** The bottom forecast card: today's reading plus the next few days. */
export function WeatherCard({ weather }: { weather: FarmWeather | null }) {
  return (
    <section className={cardClass({ radius: "2xl", className: "flex flex-col p-5" })}>
      <h2 className="type-label-caps text-on-surface-variant">{en.home.weather.title}</h2>
      {weather === null ? (
        <p className="type-body-md mt-4 text-on-surface-variant">{en.home.weather.unavailable}</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3">
            <WeatherGlyph code={weather.current.code} size={32} className="text-gold" />
            <div>
              <p className="type-headline tnum text-on-surface">
                {fmtTemp(weather.current.tempF)}
              </p>
              <p className="type-caption text-on-surface-variant">
                {en.home.weather.condition(weather.current.code)}
              </p>
            </div>
          </div>
          <ul className="mt-4 flex flex-col gap-2 border-t border-outline-variant pt-3">
            {weather.days.slice(0, 4).map((day) => {
              const weekday = new Intl.DateTimeFormat("en-US", {
                timeZone: LA_TZ,
                weekday: "short",
              }).format(new Date(`${day.date}T12:00:00`));
              return (
                <li key={day.date} className="flex items-center gap-3">
                  <span className="type-body-sm w-10 text-on-surface-variant">{weekday}</span>
                  <WeatherGlyph code={day.code} size={18} className="text-on-surface-variant" />
                  <span className="type-body-sm ml-auto tnum text-on-surface">
                    {fmtTemp(day.maxF)}
                  </span>
                  <span className="type-body-sm w-10 text-right tnum text-on-surface-variant">
                    {fmtTemp(day.minF)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
