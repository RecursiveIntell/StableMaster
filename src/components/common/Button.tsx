import { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  size?: "small" | "medium" | "large";
  fullWidth?: boolean;
  icon?: ReactNode;
}

export default function Button({
  children,
  onClick,
  disabled = false,
  variant = "primary",
  size = "medium",
  fullWidth = false,
  icon,
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors";

  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white",
    secondary: "bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white",
    danger: "bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white",
  };

  const sizes = {
    small: "px-3 py-1.5 text-sm",
    medium: "px-4 py-2 text-base",
    large: "px-6 py-3 text-lg",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${
        fullWidth ? "w-full" : ""
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {icon}
      {children}
    </button>
  );
}
