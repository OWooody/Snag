"use client";

import { formatOriginsTextarea } from "@snag/shared";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const HELPER =
  "One origin per line (scheme://host[:port]). Snag is blocked until at least one origin is listed.";

const PLACEHOLDER = `http://localhost:3000
http://localhost:5173
https://staging.example.com`;

export const DEFAULT_ORIGINS_TEXTAREA = PLACEHOLDER;

export function AllowedOriginsField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Allowed origins</Label>
      <Textarea
        id={id}
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER}
        className="font-mono text-sm"
      />
      <p className="text-sm text-zinc-500">{HELPER}</p>
    </div>
  );
}

export function originsToTextarea(origins: string[] | null | undefined): string {
  return formatOriginsTextarea(origins);
}
