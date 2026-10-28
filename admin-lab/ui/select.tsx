import { Children, isValidElement, useMemo, type ReactNode } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

type Option = { value: string; label: ReactNode; disabled?: boolean; group?: string };
type Props = {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  "aria-label": string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
};

function optionsFrom(children: ReactNode, group?: string): Option[] {
  return Children.toArray(children).flatMap((child): Option[] => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean; label?: string }>(child)) return [];
    if (child.type === "option") return [{ value: String(child.props.value ?? child.props.children ?? ""), label: child.props.children, disabled: child.props.disabled, group }];
    return optionsFrom(child.props.children, child.type === "optgroup" ? child.props.label : group);
  });
}

/** One keyboard-accessible menu for filters, editors and import mappings. */
export function AdminSelect({ children, value, onValueChange, className = "", ...props }: Props) {
  const options = useMemo(() => optionsFrom(children), [children]);
  const groups = [...new Set(options.map((o) => o.group))];
  const item = (o: Option) => <Select.Item key={o.value} value={o.value} disabled={o.disabled} className="ui-select-item">
    <Select.ItemText>{o.label}</Select.ItemText><Select.ItemIndicator><Check size={15} /></Select.ItemIndicator>
  </Select.Item>;
  return <Select.Root value={String(value)} items={options} disabled={props.disabled} name={props.name} modal={false}
    onValueChange={(next) => { if (next !== null && next !== String(value)) onValueChange(next); }}>
    <Select.Trigger id={props.id} aria-label={props["aria-label"]} className={`ui-select ${className}`}>
      <Select.Value /><Select.Icon><ChevronDown size={15} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Positioner className="ui-select-positioner" align="start" sideOffset={6} alignItemWithTrigger={false}>
      <Select.Popup className="ui-select-popup"><Select.List className="ui-select-list">
        {groups.map((group) => group ? <Select.Group key={group}><Select.GroupLabel className="ui-select-group">{group}</Select.GroupLabel>{options.filter((o) => o.group === group).map(item)}</Select.Group> : options.filter((o) => !o.group).map(item))}
      </Select.List></Select.Popup>
    </Select.Positioner></Select.Portal>
  </Select.Root>;
}
