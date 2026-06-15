/** The Terra spark, an 8-point asterisk burst, like a seed / sunburst. */
export function Spark({
  className = "",
  spin = false,
}: {
  className?: string;
  spin?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={spin ? { animation: "terra-spin 9s linear infinite" } : undefined}
    >
      {[0, 45, 90, 135].map((deg) => (
        <rect
          key={deg}
          x="10.7"
          y="1.5"
          width="2.6"
          height="21"
          rx="1.3"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
    </svg>
  );
}
