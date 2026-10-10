"use client"

import { Select } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"

type Option = { value: string; label: string; group?: string }
type Props = {
  name: string
  label: string
  value: string
  displayValue?: string
  options: Option[]
  disabled?: boolean
  onChange: (value: string) => void
}

/** Shared visual and keyboard interaction for catalog and member filters. */
export function FilterSelect({ name, label, value, displayValue, options, disabled = false, onChange }: Props) {
  // Keep a bookmarked condition visible even if its last report was unpublished.
  const items = value && !options.some(option => option.value === value)
    ? [...options, { value, label: value }] : options
  const groups = Array.from(new Set(items.map(item => item.group)))
  const renderItem = (item: Option) => <Select.Item key={item.value} value={item.value}
    className="relative flex min-h-11 cursor-default items-center rounded-[2px] py-2 pl-3 pr-9 text-[13px] text-site-body outline-none data-[highlighted]:bg-white/[0.07] data-[highlighted]:text-white data-[selected]:text-site-accent">
    <Select.ItemText>{item.label}</Select.ItemText>
    <Select.ItemIndicator className="absolute right-3"><Check size={14} strokeWidth={1.5} /></Select.ItemIndicator>
  </Select.Item>
  return <Select.Root name={name} value={value} items={items} disabled={disabled} modal={false}
    onValueChange={next => { if (next !== null && next !== value) onChange(next) }}>
    <Select.Trigger aria-label={label} title={items.find(item => item.value === value)?.label}
      className={`group flex h-11 w-full min-w-0 items-center justify-between gap-1 rounded-[4px] border px-2 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent disabled:cursor-wait disabled:opacity-60 sm:gap-3 sm:px-3 sm:text-[13px] ${value ? "border-site-accent/35 bg-site-accent/10 text-site-accent" : "border-site-line bg-site-surface/70 text-site-body hover:border-white/25 hover:bg-white/[0.05]"}`}>
      <Select.Value className="truncate">{displayValue}</Select.Value>
      <Select.Icon className="shrink-0 text-site-muted transition-transform duration-150 group-data-[popup-open]:rotate-180 motion-reduce:transition-none"><ChevronDown size={14} strokeWidth={1.5} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Positioner align="start" sideOffset={6} alignItemWithTrigger={false} className="z-50 outline-none">
        <Select.Popup className="min-w-[var(--anchor-width)] max-w-[calc(100vw-32px)] overflow-hidden rounded-[4px] border border-site-line bg-site-surface p-1 shadow-xl shadow-black/30 outline-none">
          <Select.List className="max-h-[min(18rem,var(--available-height))] overflow-y-auto overscroll-contain [scrollbar-color:#475569_transparent] [scrollbar-width:thin]">
            {groups.map(group => group ? <Select.Group key={group}>
              <Select.GroupLabel className="border-t border-site-line-soft px-3 pb-1 pt-3 text-[11px] tracking-wide text-site-muted">{group}</Select.GroupLabel>
              {items.filter(item => item.group === group).map(renderItem)}
            </Select.Group> : items.filter(item => !item.group).map(renderItem))}
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>
}
