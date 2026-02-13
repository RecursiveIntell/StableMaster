interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  label?: string;
  disabled?: boolean;
}

export default function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  label,
  disabled = false,
}: InputProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-300">
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg
                   focus:outline-none focus:border-blue-500 text-white
                   disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}
