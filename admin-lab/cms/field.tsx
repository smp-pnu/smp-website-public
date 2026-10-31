import { useId } from "react";

export function Field({
  label,
  value,
  onChange,
  type = "text",
  wide = false,
  hint,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  type?: string;
  wide?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <label className={`cms-field${wide ? " cms-wide" : ""}`}>
      <span id={`${id}-label`}>{label}</span>
      <input
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </label>
  );
}
