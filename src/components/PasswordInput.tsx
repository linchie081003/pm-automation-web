import { InputHTMLAttributes, useId, useState } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
};

/** Input password dengan tombol tampilkan / sembunyikan. */
export function PasswordInput({ label, id, className, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [visible, setVisible] = useState(false);

  return (
    <div className={`password-input-wrap${className ? ` ${className}` : ""}`}>
      {label ? <label htmlFor={inputId}>{label}</label> : null}
      <div className="password-input-field">
        <input
          {...rest}
          id={inputId}
          type={visible ? "text" : "password"}
          autoComplete={rest.autoComplete ?? "new-password"}
        />
        <button
          type="button"
          className="password-input-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
          aria-pressed={visible}
          tabIndex={-1}
        >
          {visible ? "Sembunyikan" : "Tampilkan"}
        </button>
      </div>
    </div>
  );
}
