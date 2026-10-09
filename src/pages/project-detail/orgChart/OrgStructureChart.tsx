
export type OrgNode = { role: string; name: string; level: number };

export function parseOrgLine(trimmed: string): { role: string; name: string } {
  const em = trimmed.match(/^(.+?)\s*[—–]\s*(.+)$/);
  if (em) return { role: em[1].trim(), name: em[2].trim() };
  const hy = trimmed.match(/^(.+?)\s+-\s+(.+)$/);
  if (hy) return { role: hy[1].trim(), name: hy[2].trim() };
  const tight = trimmed.match(/^([^\s-]+)-\s*(.+)$/);
  if (tight) return { role: tight[1].trim(), name: tight[2].trim() };
  return { role: trimmed, name: "" };
}

function parseOrgText(raw: string): OrgNode[] {
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/\r/g, ""))
    .filter((line) => line.trim());
  const indentCols = lines
    .map((line) => line.search(/\S/))
    .filter((c) => c >= 0);
  const uniqueIndents = [...new Set(indentCols)].sort((a, b) => a - b);
  const levelForCol = (col: number) => {
    const idx = uniqueIndents.indexOf(col);
    return idx >= 0 ? idx : 0;
  };
  return lines.map((line) => {
    const col = line.search(/\S/);
    const { role, name } = parseOrgLine(line.trim());
    return { role, name, level: levelForCol(col) };
  });
}

type OrgTreeNode = OrgNode & { children: OrgTreeNode[] };

function buildOrgTree(nodes: OrgNode[]): OrgTreeNode[] {
  const roots: OrgTreeNode[] = [];
  const stack: { level: number; node: OrgTreeNode }[] = [];
  for (const n of nodes) {
    const item: OrgTreeNode = { ...n, children: [] };
    while (stack.length && stack[stack.length - 1].level >= n.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(item);
    } else {
      stack[stack.length - 1].node.children.push(item);
    }
    stack.push({ level: n.level, node: item });
  }
  return roots;
}

function OrgTreeTopDown({ node }: { node: OrgTreeNode }) {
  const hasKids = node.children.length > 0;
  return (
    <div className="org-td-node">
      <div className="org-node-card org-node-card--topdown">
        <span className="org-role">{node.role}</span>
        {node.name ? <span className="org-name">{node.name}</span> : null}
      </div>
      {hasKids && (
        <div className="org-td-sub">
          <div className="org-td-vline org-td-vline--parent" aria-hidden />
          <div className="org-td-children-rail">
            <div className="org-td-hrail" aria-hidden />
            <div className="org-td-row">
              {node.children.map((c, i) => (
                <div key={`${c.role}-${c.name}-${i}`} className="org-td-branch">
                  <div className="org-td-vline org-td-vline--stem" aria-hidden />
                  <OrgTreeTopDown node={c} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function OrgStructureChart({ title, raw }: { title: string; raw: string }) {
  const nodes = parseOrgText(raw || "");
  const tree = buildOrgTree(nodes);
  if (!tree.length) {
    return (
      <div className="org-chart org-chart-empty">
        <h4>{title}</h4>
        <p className="text-muted">
          Format: <code>Peran — Nama</code> atau <code>kode- Nama</code>. Indent spasi = level
          bawah (top-down).
        </p>
      </div>
    );
  }
  return (
    <div className="org-chart org-chart-topdown">
      <div className="org-chart-head">
        <h4>{title}</h4>
        <span className="org-chart-meta">{nodes.length} orang</span>
      </div>
      <div className="org-chart-scroll org-chart-scroll--topdown">
        <div className="org-td-forest">
          {tree.map((n, i) => (
            <OrgTreeTopDown key={`${n.role}-${i}`} node={n} />
          ))}
        </div>
      </div>
    </div>
  );
}
