import { useEffect, useState } from "react";
import { api } from "../../../api";
export function RemindersTab({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<
    { type: string; severity: string; title: string; message: string }[]
  >([]);
  useEffect(() => {
    api<typeof items>(`/projects/${projectId}/reminders`).then(setItems);
  }, [projectId]);
  return (
    <div className="card">
      <h2 className="card-title">Reminder</h2>
      <ul className="plain">
        {items.map((r, i) => (
          <li key={i} className={`reminder-${r.severity}`}>
            [{r.type}] {r.message}
          </li>
        ))}
      </ul>
      {items.length === 0 && <p>Tidak ada reminder aktif.</p>}
    </div>
  );
}

