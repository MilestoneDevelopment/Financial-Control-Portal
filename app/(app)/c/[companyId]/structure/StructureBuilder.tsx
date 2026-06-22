"use client";

import { Fragment, useState, useTransition } from "react";
import type { TreeNode, TreeCounts, StructureIssue } from "@/lib/domain/structure/tree";
import {
  addNodeAction,
  updateNodeAction,
  setNodeActiveAction,
} from "./actions";
import styles from "./structure.module.css";

type Dir = "in" | "out" | "neutral" | "both";
type NodeKind = "section" | "group" | "class";

export function StructureBuilder({
  companyId,
  versionId,
  tree,
  issues,
  counts,
  canEdit,
}: {
  companyId: string;
  versionId: string;
  tree: TreeNode[];
  issues: StructureIssue[];
  counts: TreeCounts;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed.");
      }
    });
  }

  return (
    <div className={styles.wrap}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.cards}>
        {([
          ["Sections", counts.sections],
          ["Groups", counts.groups],
          ["Classes", counts.classes],
          ["Active", counts.active],
          ["Inactive", counts.inactive],
        ] as const).map(([label, value]) => (
          <div key={label} className={styles.card}>
            <div className={styles.cardValue} data-num>[ {value} ]</div>
            <div className={styles.cardLabel}>{label}</div>
          </div>
        ))}
      </div>

      {issues.length > 0 && (
        <div className={styles.issues}>
          <div className={styles.issuesTitle}>Validation [ {issues.length} ]</div>
          {issues.map((i, idx) => (
            <div
              key={idx}
              className={styles.issue}
              style={{
                background: i.severity === "err" ? "var(--fcp-unfavorable-bg)" : "var(--fcp-warning-bg)",
                color: i.severity === "err" ? "#c0493a" : "#b5781a",
              }}
            >
              {i.text}
            </div>
          ))}
        </div>
      )}

      <div className={styles.tree}>
        {tree.length === 0 ? (
          <div className={styles.empty}>
            This company has no cash flow structure yet. Add the first section below.
          </div>
        ) : (
          <TreeLevel
            nodes={tree}
            depth={0}
            companyId={companyId}
            versionId={versionId}
            canEdit={canEdit}
            pending={pending}
            run={run}
          />
        )}

        {canEdit && (
          <AddNode
            depth={0}
            kinds={["section"]}
            disabled={pending}
            onAdd={(kind, label, dir) =>
              run(() =>
                addNodeAction({
                  companyId,
                  versionId,
                  kind,
                  label,
                  parentId: null,
                  cashDirection: kind === "class" ? dir : undefined,
                }),
              )
            }
          />
        )}
      </div>

      {!canEdit && (
        <div className={styles.readonly}>
          Read-only - you do not have the "Edit cash flow structure" permission.
        </div>
      )}
    </div>
  );
}

/** Recursively renders a list of nodes and (when editable) an Add-child control. */
function TreeLevel({
  nodes,
  depth,
  companyId,
  versionId,
  canEdit,
  pending,
  run,
}: {
  nodes: TreeNode[];
  depth: number;
  companyId: string;
  versionId: string;
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<void>) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <Fragment key={node.id}>
          <NodeRow
            depth={depth}
            node={node}
            canEdit={canEdit}
            pending={pending}
            onRename={(label) => run(() => updateNodeAction({ companyId, nodeId: node.id, label }))}
            onToggleActive={() =>
              run(() => setNodeActiveAction({ companyId, nodeId: node.id, active: !node.is_active }))
            }
            onDirection={
              node.kind === "class"
                ? (dir) => run(() => updateNodeAction({ companyId, nodeId: node.id, cashDirection: dir }))
                : undefined
            }
          />

          {node.children.length > 0 && (
            <TreeLevel
              nodes={node.children}
              depth={depth + 1}
              companyId={companyId}
              versionId={versionId}
              canEdit={canEdit}
              pending={pending}
              run={run}
            />
          )}

          {/* Containers (section/group) can take child groups or class leaves. */}
          {canEdit && node.kind !== "class" && (
            <AddNode
              depth={depth + 1}
              kinds={["group", "class"]}
              disabled={pending}
              onAdd={(kind, label, dir) =>
                run(() =>
                  addNodeAction({
                    companyId,
                    versionId,
                    kind,
                    label,
                    parentId: node.id,
                    cashDirection: kind === "class" ? dir : undefined,
                  }),
                )
              }
            />
          )}
        </Fragment>
      ))}
    </>
  );
}

const DIR_OPTIONS: { value: Dir; label: string }[] = [
  { value: "in", label: "Cash In" },
  { value: "out", label: "Cash Out" },
  { value: "both", label: "In / Out" },
  { value: "neutral", label: "Neutral" },
];

function NodeRow({
  depth,
  node,
  canEdit,
  pending,
  onRename,
  onToggleActive,
  onDirection,
}: {
  depth: number;
  node: TreeNode;
  canEdit: boolean;
  pending: boolean;
  onRename: (label: string) => void;
  onToggleActive: () => void;
  onDirection?: (dir: Dir) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(node.label);
  const markLevel = Math.min(depth, 2);

  return (
    <div
      className={styles.row}
      style={{ paddingLeft: 14 + depth * 20, opacity: node.is_active ? 1 : 0.5 }}
    >
      <span className={styles.rowMark} data-level={markLevel} aria-hidden />
      {editing ? (
        <form
          className={styles.editForm}
          onSubmit={(e) => {
            e.preventDefault();
            onRename(value);
            setEditing(false);
          }}
        >
          <input
            className={styles.input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <button className={styles.btnSm} type="submit" disabled={pending}>Save</button>
          <button
            className={styles.btnSmGhost}
            type="button"
            onClick={() => {
              setValue(node.label);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <span className={styles.rowLabel} data-level={markLevel} data-kind={node.kind}>
          {node.label}
        </span>
      )}

      {/* Only leaf class nodes carry a cash direction (classification targets). */}
      {node.kind === "class" && onDirection && (
        <select
          className={styles.dir}
          value={node.cash_direction}
          disabled={!canEdit || pending}
          onChange={(e) => onDirection(e.target.value as Dir)}
        >
          {DIR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {canEdit && !editing && (
        <div className={styles.rowActions}>
          <button className={styles.btnSmGhost} type="button" onClick={() => setEditing(true)} disabled={pending}>
            Edit
          </button>
          <button className={styles.btnSmGhost} type="button" onClick={onToggleActive} disabled={pending}>
            {node.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Add a node of one of the allowed kinds under a parent (recursive, scoped). */
function AddNode({
  depth,
  kinds,
  disabled,
  onAdd,
}: {
  depth: number;
  kinds: NodeKind[];
  disabled?: boolean;
  onAdd: (kind: NodeKind, label: string, dir: Dir) => void;
}) {
  const [kind, setKind] = useState<NodeKind>(kinds[0]);
  const [value, setValue] = useState("");
  const [dir, setDir] = useState<Dir>("out");
  const label = kinds.length === 1 ? (kinds[0] === "section" ? "Add section" : `Add ${kinds[0]}`) : "Add child";

  return (
    <form
      className={styles.addForm}
      style={{ paddingLeft: 14 + depth * 20 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(kind, value.trim(), dir);
        setValue("");
      }}
    >
      {kinds.length > 1 && (
        <select
          className={styles.dir}
          value={kind}
          onChange={(e) => setKind(e.target.value as NodeKind)}
          disabled={disabled}
          aria-label="Node type"
        >
          <option value="group">Group</option>
          <option value="class">Class</option>
        </select>
      )}
      <input
        className={styles.input}
        placeholder={label}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
      />
      {kind === "class" && (
        <select className={styles.dir} value={dir} onChange={(e) => setDir(e.target.value as Dir)} disabled={disabled}>
          {DIR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
      <button className={styles.btnSm} type="submit" disabled={disabled || !value.trim()}>
        Add
      </button>
    </form>
  );
}
