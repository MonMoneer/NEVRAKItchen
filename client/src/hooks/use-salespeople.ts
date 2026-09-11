import { useQuery } from "@tanstack/react-query";
import { PREPARED_BY_OPTIONS } from "@shared/schema";

/**
 * The names offered in every "Prepared by" dropdown. Sourced from the user
 * table so adding a salesperson in the admin panel is enough — no code change.
 * The old hardcoded list is the fallback while the request is in flight or if
 * it fails, so the dialog is never left with an empty dropdown.
 */
export function useSalespeople(): string[] {
  const { data } = useQuery<string[]>({ queryKey: ["/api/salespeople"] });
  return data && data.length > 0 ? data : [...PREPARED_BY_OPTIONS];
}
