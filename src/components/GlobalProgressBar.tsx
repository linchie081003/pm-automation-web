import { useEffect, useState } from "react";

import { subscribeMutationBusy } from "../lib/mutationBusy";

export function GlobalProgressBar() {
  const [active, setActive] = useState(false);
  useEffect(() => subscribeMutationBusy(setActive), []);
  if (!active) return null;
  return (
    <div className="global-progress" role="progressbar" aria-busy="true" aria-label="Memproses">
      <div className="global-progress__bar" />
    </div>
  );
}
