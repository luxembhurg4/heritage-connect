import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const NONE = "__none__";

export type PickOption = { value: string; label: string; group?: string };

/** Searchable picker: type part of a name or a year to narrow the list.
 *  Offers "None recorded" unless given a placeholder to show instead. */
export function SearchField({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  options: PickOption[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <div className="min-w-0">
      <Label className="label-archival text-muted-foreground">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            className="mt-1.5 w-full min-w-0 justify-between font-serif font-normal"
          >
            <span className="truncate">{current?.label ?? placeholder ?? "None recorded"}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Search by name or year…" />
            <CommandList>
              <CommandEmpty>No one matches.</CommandEmpty>
              {!placeholder && (
                <CommandGroup>
                  <CommandItem value="None recorded" onSelect={() => pick(NONE)}>
                    None recorded
                  </CommandItem>
                </CommandGroup>
              )}
              {groups.map((g) => (
                <CommandGroup key={g} heading={g || undefined}>
                  {options
                    .filter((o) => (o.group ?? "") === g)
                    .map((o) => (
                      // cmdk matches on value; the id keeps same-named people apart.
                      <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => pick(o.value)}>
                        {o.label}
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
