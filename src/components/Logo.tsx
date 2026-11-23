import Link from "next/link";

/** A domino tile whose four pips take the colors shared with the other vporel games. */
function Mark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 14 27" className={className} aria-hidden>
      <rect x="0.5" y="0.5" width="13" height="26" rx="3" fill="#fffdf8" stroke="#3a2e22" strokeWidth="1" />
      <path d="M3 13.5h8" stroke="#cbbda4" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="4.2" cy="4.4" r="1.7" fill="#e5484d" />
      <circle cx="9.8" cy="4.4" r="1.7" fill="#2f9e66" />
      <circle cx="4.2" cy="9.6" r="1.7" fill="#3e63dd" />
      <circle cx="9.8" cy="9.6" r="1.7" fill="#f2b200" />
      <circle cx="7" cy="20" r="2" fill="#2a2118" />
    </svg>
  );
}

export default function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 font-display font-bold tracking-tight">
      <Mark className={`-rotate-12 ${big ? "h-12 w-auto" : "h-8 w-auto"}`} />
      <span className={big ? "text-5xl" : "text-2xl"}>Domino</span>
    </Link>
  );
}
