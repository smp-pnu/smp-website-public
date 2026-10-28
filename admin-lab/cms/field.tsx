export function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="cms-field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
