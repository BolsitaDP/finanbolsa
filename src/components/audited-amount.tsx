import Link from "next/link";

import { formatMoney } from "@/lib/format";

/**
 * A total you can click open.
 *
 * Every sum in the app is computed in SQL now, which is fast but opaque — the
 * number no longer comes with a visible list of what added up to it. This makes
 * it auditable in one click: the link carries the same category and month the
 * total was computed from, so the rows that come back are the rows that made the
 * number. Dropping the month would show the category's whole history instead,
 * which adds up to something else entirely.
 */
export function AuditedAmount({
  amountMinor,
  currency,
  href,
  className,
  title,
}: {
  amountMinor: number;
  currency: string;
  href: string;
  className?: string;
  title: string;
}) {
  return (
    <Link href={href} title={title} className={`${className ?? ""} underline-offset-4 hover:underline`}>
      {formatMoney(amountMinor, currency)}
    </Link>
  );
}
