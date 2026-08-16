"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CategorySelect } from "@/components/category-select";

function FieldLabel({
  label,
  enabled,
  onEnabledChange,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onEnabledChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function BulkEditSelectField({
  label,
  enabled,
  onEnabledChange,
  value,
  onValueChange,
  items,
  placeholder,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  items: Record<string, string>;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} enabled={enabled} onEnabledChange={onEnabledChange} />
      <Select value={value} onValueChange={(v) => v && onValueChange(v)} items={items} disabled={!enabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(items).map(([key, itemLabel]) => (
            <SelectItem key={key} value={key}>
              {itemLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function BulkEditCategoryField({
  label,
  enabled,
  onEnabledChange,
  value,
  onValueChange,
  categories,
  kind,
  noneLabel,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  categories: { id: string; name: string; kind: string; parentCategoryId: string | null }[];
  kind?: "expense" | "income";
  noneLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} enabled={enabled} onEnabledChange={onEnabledChange} />
      <CategorySelect
        categories={categories}
        value={value}
        onValueChange={onValueChange}
        kind={kind}
        noneLabel={noneLabel}
        disabled={!enabled}
        className="w-full"
      />
    </div>
  );
}

export function BulkEditTextField({
  label,
  enabled,
  onEnabledChange,
  value,
  onValueChange,
  placeholder,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} enabled={enabled} onEnabledChange={onEnabledChange} />
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={!enabled}
        placeholder={placeholder}
      />
    </div>
  );
}
