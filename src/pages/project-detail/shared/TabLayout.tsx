import { Children, type ReactNode } from "react";
import { UserNotice } from "../../../components/UserNotice";

export function TabShell({ children }: { children: ReactNode }) {
  return <div className="tab-page tab-page--wide">{children}</div>;
}

export function TabAlert({
  message,
  variant,
}: {
  message?: string;
  variant?: "success" | "error" | "info";
}) {
  return <UserNotice message={message} variant={variant} />;
}

export function TabNoticeStack({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return <div className="tab-page-notices">{items}</div>;
}

export function TabReadOnlyNotice({ message }: { message: string }) {
  return <UserNotice message={message} variant="info" className="tab-readonly-notice" />;
}

/** Footer simpan per tab — tombol kanan, garis pemisah konsisten. */
export function TabFormFooter({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <footer className="tab-form-footer">
      <div className="tab-form-footer__actions">{children}</div>
      {hint ? <p className="tab-form-footer__hint text-muted">{hint}</p> : null}
    </footer>
  );
}

/** Lanjut / konfirmasi fase — selaras dengan panel kesehatan proyek. */
export function TabPhaseFooter({
  children,
  hint,
  nested,
}: {
  children: ReactNode;
  hint?: string;
  /** Di dalam panel kesehatan — tanpa garis atas ganda. */
  nested?: boolean;
}) {
  return (
    <footer className={`tab-phase-footer${nested ? " tab-phase-footer--nested" : ""}`}>
      <div className="tab-phase-footer__actions">{children}</div>
      {hint ? <p className="tab-phase-footer__hint text-muted">{hint}</p> : null}
    </footer>
  );
}
