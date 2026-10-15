import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import ReactFlow, {
  Background,
  ControlButton,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  type NodeProps,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import ring from "@/assets/couple-ring.png";
import { cn } from "@/lib/utils";
import {
  buildLayout,
  NODE_HEIGHT,
  NODE_WIDTH,
  type Person,
  type PersonNodeData,
} from "./treeLayout";

// shortcut: targets reactflow v11 API. v12 moved to @xyflow/react — upgrade
// by swapping the import; props used here (fitView, zoomOnScroll) stay the same.

const nodeTypes = { person: PersonNode, union: UnionNode };

interface FamilyTreeCanvasProps {
  people: Person[];
  // This register and the ones joined to it (lineage.linked), once loaded.
  linked?: {
    families: { _id: string; name: string }[];
    people: (Person & { familyId: string })[];
  };
  focusId: string | null;
  onFocusChange?: (id: string) => void;
}

export default function FamilyTreeCanvas({
  people,
  linked,
  focusId,
  onFocusChange,
}: FamilyTreeCanvasProps) {
  const localIds = useMemo(() => new Set(people.map((p) => p._id)), [people]);
  // From other registers: spouses who married in, and everyone descended
  // from this register (with their spouses). Their lines fold until a card
  // is clicked; ancestors recorded elsewhere stay in their own register.
  const { all, badges } = useMemo(() => {
    const badges = new Map<string, string>();
    if (!linked) return { all: people, badges };
    const byId = new Map(linked.people.map((p) => [p._id, p]));
    const kids = new Map<string, Person[]>();
    for (const p of linked.people)
      for (const id of [p.fatherId, p.motherId]) if (id) kids.set(id, [...(kids.get(id) ?? []), p]);
    const keep = new Map(people.map((p) => [p._id, p]));
    const queue = [...people];
    const add = (p?: Person) => {
      if (!p || keep.has(p._id)) return;
      keep.set(p._id, p);
      queue.push(p);
    };
    for (let i = 0; i < queue.length; i++) {
      add(byId.get(queue[i].partnerId ?? ""));
      kids.get(queue[i]._id)?.forEach(add);
    }
    const register = new Map(linked.families.map((f) => [f._id, f.name]));
    for (const p of keep.values())
      if (!localIds.has(p._id)) badges.set(p._id, `❦ ${register.get(byId.get(p._id)!.familyId) ?? ""}`);
    return { all: [...keep.values()], badges };
  }, [people, linked, localIds]);

  // Unset = the layout picks a default from the register's depth. Clicking
  // a card reveals everything below that person; the stepper resets that.
  const [generations, setGenerations] = useState<number>();
  const [opened, setOpened] = useState(() => new Set<string>());
  const { nodes, edges, total, shown } = useMemo(
    () => buildLayout(all, focusId, badges, generations, opened),
    [all, focusId, badges, generations, opened],
  );
  // Fit the tree once React Flow has measured newly shown cards.
  // shortcut: fixed 50 ms wait for measuring — upgrade to useNodesInitialized
  // if the tree is ever wrapped in a ReactFlowProvider.
  const refit = () => window.setTimeout(() => flow?.fitView({ maxZoom: 1, duration: 300 }), 50);
  const step = (n: number) => {
    setGenerations(n);
    setOpened(new Set());
    refit();
  };
  // Clicking a card reveals everything below it; when that shows more
  // people (e.g. a branch recorded in another register), fit them in.
  const open = (id: string) => {
    const partnerId = (nodes.find((n) => n.id === id)?.data as PersonNodeData | undefined)?.person.partnerId;
    if (nodes.some((n) => (n.id === id || n.id === partnerId) && (n.data as PersonNodeData).hidden)) refit();
    setOpened((s) => new Set(s).add(id));
  };

  // fitView only runs on init. Picking a name in "Centre upon" centres on
  // them; a click on a card only highlights (and reveals), a double click centres.
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const centredOn = useRef(focusId);
  const centre = (id: string) => {
    const node = flow?.getNode(id);
    if (!flow || !node) return;
    flow.setCenter(
      node.position.x + NODE_WIDTH / 2,
      node.position.y + NODE_HEIGHT / 2,
      { zoom: Math.max(flow.getZoom(), 0.8), duration: 400 },
    );
  };
  useEffect(() => {
    if (!flow || !focusId || centredOn.current === focusId) return;
    centredOn.current = focusId;
    const node = flow.getNode(focusId);
    if (node)
      flow.setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, {
        zoom: Math.max(flow.getZoom(), 0.8),
        duration: 400,
      });
  }, [flow, focusId]);
  const pick = (id: string) => {
    if (!localIds.has(id)) return; // foreign spouses aren't in this register
    centredOn.current = id; // a click highlights without moving the view
    onFocusChange?.(id);
  };

  // Clicking the background hides the highlight (the person stays picked,
  // so their branch stays open); it shows again once focus changes.
  const [plainFor, setPlainFor] = useState<string | null>(null);

  // Controls fade after 5 s without activity in the tree, for a clean view.
  const [idle, setIdle] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const wake = () => {
    setIdle(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setIdle(true), 5000);
  };
  useEffect(() => {
    timer.current = window.setTimeout(() => setIdle(true), 5000);
    return () => window.clearTimeout(timer.current);
  }, []);

  // Full screen: just the tree area (its controls live inside it). Esc exits.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Refit whenever the canvas changes size (window resized or snapped, full
  // screen). Small height-only changes are skipped: phone browsers resize the
  // page as the address bar slides while scrolling.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !flow) return;
    let last = { w: el.clientWidth, h: el.clientHeight };
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (w === last.w && Math.abs(h - last.h) < 100) return;
      last = { w, h };
      window.clearTimeout(timer);
      timer = window.setTimeout(() => flow.fitView({ maxZoom: 1, duration: 200 }), 150);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [flow]);
  const toggleFull = () =>
    document.fullscreenElement ? document.exitFullscreen() : wrapRef.current?.requestFullscreen();

  return (
    <div
      ref={wrapRef}
      className="tree-canvas group/tree h-full w-full bg-white dark:bg-background"
      data-idle={idle}
      data-plain={plainFor !== null && plainFor === focusId}
      onPointerMove={wake}
      onPointerDown={wake}
      onWheel={wake}
      onKeyDown={wake}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={setFlow}
        onNodeClick={(_, node) => {
          pick(node.id);
          setPlainFor(null);
          open(node.id);
        }}
        onNodeDoubleClick={(_, node) => centre(node.id)}
        onPaneClick={() => setPlainFor(focusId)}
        zoomOnDoubleClick={false}
        fitView
        // Without a cap, a register of one or two people opens at 3× zoom.
        fitViewOptions={{ maxZoom: 1 }}
        zoomOnScroll
        zoomOnPinch
        panOnDrag
        panOnScroll
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={0.2}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls position="top-left" fitViewOptions={{ maxZoom: 1 }}>
          {/* Hidden where the browser can't full-screen an element (iPhone Safari). */}
          {document.fullscreenEnabled && (
            <ControlButton
              onClick={toggleFull}
              title={full ? "Exit full screen" : "Full screen"}
              aria-label={full ? "Exit full screen" : "Full screen"}
            >
              {full ? <Minimize2 /> : <Maximize2 />}
            </ControlButton>
          )}
        </Controls>
        <Panel
          position="top-right"
          className="flex items-center gap-2 rounded-sm border border-border bg-card px-2.5 py-1 text-xs shadow-sm"
        >
          <span className="text-muted-foreground">Generations</span>
          <button
            type="button"
            aria-label="Show one generation fewer"
            disabled={shown <= 1}
            onClick={() => step(shown - 1)}
            className={stepClass}
          >
            −
          </button>
          <span aria-live="polite" className="tabular-nums">
            {shown} of {total}
          </span>
          <button
            type="button"
            aria-label="Show one more generation"
            disabled={shown >= total}
            onClick={() => step(shown + 1)}
            className={stepClass}
          >
            +
          </button>
        </Panel>
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) =>
            node.type === "union"
              ? "transparent"
              : (node.data as PersonNodeData).focused
                ? "#e11d48"
                : "#a1a1aa"
          }
        />
      </ReactFlow>
    </div>
  );
}

const stepClass =
  "flex size-6 items-center justify-center rounded-full border border-border text-sm hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40";

/* ── node ─────────────────────────────────────────────────────── */

function PersonNode({ data }: NodeProps<PersonNodeData>) {
  const { person, focused, badge, part, spouse, hidden } = data;

  let years = "";
  if (person.birthYear && person.deathYear) {
    years = `${person.birthYear} – ${person.deathYear}`;
  } else if (person.birthYear) {
    years = `b. ${person.birthYear}`;
  } else if (person.deathYear) {
    years = `d. ${person.deathYear}`;
  }

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 rounded-sm border bg-card px-2.5 py-1.5 shadow-sm",
        // Sibling boxes: dashed dividers between the rows.
        part && part !== "bottom" && "[border-bottom-style:dashed]",
        focused
          ? "border-primary ring-1 ring-primary group-data-[plain=true]/tree:border-border group-data-[plain=true]/tree:ring-0"
          : "border-border",
        part === "top" && "rounded-b-none",
        part === "middle" && "rounded-none border-t-0",
        part === "bottom" && "rounded-t-none border-t-0",
      )}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      title={person.name}
    >
      {/* Edges need handles. Unnamed ones carry parent→child lines; l/r carry ⚭.
          Fixed height keeps l/r level with the union point on the ⚭ line.
          Top/Bottom come first because React Flow uses the first handle of a
          type when an edge does not name one. */}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <Handle id="l" type="target" position={Position.Left} className="!opacity-0" />
      <Handle id="r" type="source" position={Position.Right} className="!opacity-0" />
      {person.imageUrl ? (
        <img
          src={person.imageUrl}
          alt=""
          className="size-8 shrink-0 rounded-full border border-border object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border font-serif text-xs font-bold",
            person.sex === "female"
              ? "border-accent bg-secondary text-accent-foreground"
              : "border-primary/50 bg-secondary text-primary",
          )}
        >
          {person.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        {/* Long names wrap to two smaller lines instead of being cut off. */}
        <div
          className={cn(
            "line-clamp-2 font-serif font-semibold",
            person.name.length > 20 ? "text-[12px] leading-tight" : "text-[13px] leading-snug",
          )}
        >
          {person.name}
        </div>
        {(years || badge) && (
          <div className="truncate text-[11px] italic leading-tight text-muted-foreground">
            {years}
            {badge && (
              <span className="not-italic text-[9px] tracking-widest text-primary">
                {years && " · "}
                {badge}
              </span>
            )}
          </div>
        )}
      </div>
      {spouse && (
        // Centred on the seam with the partner's card above.
        <img
          src={ring}
          alt="married to the person above"
          className="pointer-events-none absolute left-1/2 top-0 w-9 max-w-none -translate-x-1/2 -translate-y-1/2"
        />
      )}
      {!!hidden && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border border-border bg-card px-1.5 text-[10px] leading-4 text-muted-foreground">
          +{hidden}
          <span className="sr-only"> more below</span>
        </span>
      )}
    </div>
  );
}

/** Middle of a side-by-side couple's line: shows the rings, and their
 *  children's line leaves from here. */
function UnionNode() {
  return (
    <div style={{ width: 1, height: 1 }}>
      <img
        src={ring}
        alt="married"
        className="pointer-events-none absolute left-0 top-0 w-9 max-w-none -translate-x-1/2 -translate-y-1/2"
      />
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}
