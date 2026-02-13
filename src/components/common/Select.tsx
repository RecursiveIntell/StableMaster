interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  label?: string;
  disabled?: boolean;
  placeholder?: string;
}

export default function Select({
  value,
  onChange,
  options,
  label,
  disabled = false,
  placeholder,
}: SelectProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-300">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg
                   focus:outline-none focus:border-blue-500 text-white
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt === "" && placeholder ? placeholder : opt}
          </option>
        ))}
      </select>
    </div>
  );
}
