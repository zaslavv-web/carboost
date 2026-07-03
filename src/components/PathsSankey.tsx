import { useMemo } from "react";
import { tooltipProps } from "@/lib/chartTooltip";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

interface Transition {
  from: string;
  to: string;
  count: number;
}

interface Props {
  transitions: Transition[];
  maxNodes?: number;
}

/**
 * Sankey requires a DAG. We split each route into two columnar nodes
 * (source side "↦ route" and target side "route ↦") so cycles like
 * A→B→A become unambiguous flows and recharts won't loop.
 */
const PathsSankey = ({ transitions, maxNodes = 24 }: Props) => {
  const { nodes, links } = useMemo(() => {
    if (!transitions.length) return { nodes: [], links: [] };

    // Keep top routes by total traffic
    const traffic = new Map<string, number>();
    for (const t of transitions) {
      traffic.set(t.from, (traffic.get(t.from) ?? 0) + t.count);
      traffic.set(t.to, (traffic.get(t.to) ?? 0) + t.count);
    }
    const keep = new Set(
      [...traffic.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxNodes)
        .map(([k]) => k),
    );

    const filtered = transitions.filter(
      (t) => keep.has(t.from) && keep.has(t.to) && t.from !== t.to && t.count > 0,
    );
    if (!filtered.length) return { nodes: [], links: [] };

    const srcIdx = new Map<string, number>();
    const dstIdx = new Map<string, number>();
    const nodeList: { name: string }[] = [];

    const getSrc = (name: string) => {
      if (!srcIdx.has(name)) {
        srcIdx.set(name, nodeList.length);
        nodeList.push({ name });
      }
      return srcIdx.get(name)!;
    };
    const getDst = (name: string) => {
      if (!dstIdx.has(name)) {
        dstIdx.set(name, nodeList.length);
        nodeList.push({ name });
      }
      return dstIdx.get(name)!;
    };

    const linkList = filtered.map((t) => ({
      source: getSrc(t.from),
      target: getDst(t.to),
      value: t.count,
    }));

    return { nodes: nodeList, links: linkList };
  }, [transitions, maxNodes]);

  if (!nodes.length || !links.length) return null;

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth: 720 }}>
        <ResponsiveContainer width="100%" height={Math.min(120 + nodes.length * 28, 720)}>
          <Sankey
            data={{ nodes, links }}
            nodePadding={18}
            nodeWidth={12}
            linkCurvature={0.5}
            iterations={32}
            link={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.25 } as any}
            node={<SankeyNode />}
            margin={{ top: 10, right: 140, bottom: 10, left: 140 }}
          >
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const SankeyNode = (props: any) => {
  const { x, y, width, height, index, payload, containerWidth } = props;
  const isOut = x + width + 6 > containerWidth / 2;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="hsl(var(--primary))"
        fillOpacity={0.85}
      />
      <text
        textAnchor={isOut ? "end" : "start"}
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2}
        fontSize={11}
        fill="hsl(var(--foreground))"
        dy={4}
      >
        {truncate(payload.name, 28)} ({payload.value})
      </text>
    </Layer>
  );
};

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export default PathsSankey;
