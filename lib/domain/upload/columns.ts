/**
 * Expected accounting-Excel column contract (Phase 2A foundation).
 *
 * This is the single source of truth for how a parsed accounting export maps to
 * a normalized `transactions` row. The actual XLSX parsing is intentionally NOT
 * implemented in this batch (no parser dependency yet); Phase 2B wires a
 * server-side parser that produces `TransactionDraft[]` against this contract.
 *
 * Header matching is case-insensitive and trims whitespace; `aliases` lists the
 * Georgian / English header variants seen in real exports. Keep this pure (no
 * DB/server imports) so it stays testable and shareable.
 */
import type { Database } from "@/db/types";

export type Currency = Database["public"]["Enums"]["currency"];

/** A single normalized row, pre-insert. Mirrors the `transactions` columns. */
export interface TransactionDraft {
  rowIndex: number;
  transactionDate: string | null; // ISO yyyy-mm-dd
  documentRef: string | null;
  reference: string | null;
  description: string | null;
  comment: string | null;
  debitAccount: string | null;
  creditAccount: string | null;
  debitAmount: number | null;
  creditAmount: number | null;
  originalAmount: number | null;
  originalCurrency: Currency | null;
  rawRow: Record<string, unknown>;
}

export interface ColumnSpec {
  /** Field on TransactionDraft this column feeds. */
  field: keyof TransactionDraft;
  /** Canonical header label. */
  label: string;
  /** Accepted header variants (lowercased match), incl. Georgian. */
  aliases: string[];
  required: boolean;
}

export const EXPECTED_COLUMNS: ColumnSpec[] = [
  { field: "transactionDate", label: "Date",            aliases: ["date", "თარიღი", "trans date", "transaction date"], required: true },
  { field: "documentRef",     label: "Document",        aliases: ["document", "doc", "დოკუმენტი", "doc no", "document no"], required: false },
  { field: "reference",       label: "Reference",       aliases: ["reference", "ref", "ref no"], required: false },
  { field: "description",     label: "Description",     aliases: ["description", "დანიშნულება", "narration", "details"], required: false },
  { field: "comment",         label: "Comment",         aliases: ["comment", "კომენტარი", "note", "notes"], required: false },
  { field: "debitAccount",    label: "Debit account",   aliases: ["debit account", "debit", "დებეტი", "dr account", "dr"], required: false },
  { field: "creditAccount",   label: "Credit account",  aliases: ["credit account", "credit", "კრედიტი", "cr account", "cr"], required: false },
  { field: "debitAmount",     label: "Debit amount",    aliases: ["debit amount", "debit sum", "დებეტის თანხა", "dr amount"], required: false },
  { field: "creditAmount",    label: "Credit amount",   aliases: ["credit amount", "credit sum", "კრედიტის თანხა", "cr amount"], required: false },
  { field: "originalAmount",  label: "Amount",          aliases: ["amount", "თანხა", "sum", "value"], required: false },
  { field: "originalCurrency",label: "Currency",        aliases: ["currency", "ვალუტა", "ccy", "cur"], required: false },
];

/** Map a raw header string to a known field, or null if unrecognized. */
export function matchHeader(header: string): keyof TransactionDraft | null {
  const h = header.trim().toLowerCase();
  for (const col of EXPECTED_COLUMNS) {
    if (col.label.toLowerCase() === h || col.aliases.includes(h)) return col.field;
  }
  return null;
}

export const REQUIRED_COLUMN_LABELS = EXPECTED_COLUMNS.filter((c) => c.required).map((c) => c.label);
