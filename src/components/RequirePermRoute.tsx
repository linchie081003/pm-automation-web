import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { canAnyPerm } from "../lib/mainNav";

type Props = {
  anyPerm: string[];
  children: React.ReactNode;
  redirectTo?: string;
};

/** Route guard: redirect jika user tidak punya permission menu/fitur. */
export function RequirePermRoute({ anyPerm, children, redirectTo = "/" }: Props) {
  const { can } = useAuth();
  if (!canAnyPerm(can, anyPerm)) {
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
}
