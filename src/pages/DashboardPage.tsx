import { useAuth } from "../auth";
import ExecutivePage from "./ExecutivePage";
import HomePage from "./HomePage";

/** PM/delivery → operasional; management/finance → executive portfolio. */
export default function DashboardPage() {
  const { can } = useAuth();
  if (can("dashboard.executive")) {
    return <ExecutivePage />;
  }
  return <HomePage />;
}
