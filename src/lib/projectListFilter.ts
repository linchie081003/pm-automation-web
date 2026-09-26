export type ProjectSearchRow = {
  code?: string;
  name?: string;
  client_name?: string;
  project_manager?: string | null;
  sph_no?: string | null;
};

export function filterProjectsBySearch<T extends ProjectSearchRow>(
  rows: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((p) => {
    const haystack = [
      p.code,
      p.name,
      p.client_name,
      p.project_manager,
      p.sph_no,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
