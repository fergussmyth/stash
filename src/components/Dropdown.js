import { useEffect, useRef, useState } from "react";

export default function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Select",
  className = "",
  buttonClassName = "",
  menuClassName = "",
  disabled = false,
  ariaLabel,
  id,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleClick(event) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = options.find((opt) => opt.value === value);
  const label = selected ? selected.label : placeholder;

  return (
    <div ref={wrapRef} className={`dropdown ${className}`}>
      <button
        id={id}
        className={`dropdownTrigger ${buttonClassName}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <span className="dropdownLabel">{label}</span>
        <span className="dropdownChevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className={`dropdownMenu ${menuClassName}`} role="menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`dropdownItem ${opt.value === value ? "active" : ""}`}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onChange?.(opt.value);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
