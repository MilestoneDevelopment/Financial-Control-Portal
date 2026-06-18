"use client";

import { useState, useTransition } from "react";
import type { TreeSection } from "@/lib/domain/structure/tree";
import type { StructureIssue } from "@/lib/domain/structure/tree";
import {
  addNodeAction,
  updateNodeAction,
  setNodeActiveAction,
} from "./actions";
import styles from "./structure.module.css";

type Counts = { sections: number; groups: number; classes: number; active: number; inactive: number };

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
  tree: TreeSection[];
  issues: StructureIssue[];
  counts: Counts;
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
        {[
          ["Sections", counts.sections],
          ["Groups", counts.groups],
          ["Classes", counts.classes],
          ["Active", counts.active],
          ["Inactive", counts.inactive],
        ].map(([label, value]) => (
          <div key={label} className={styles.card}>
            <div className={styles.cardValue} data-num>{value}</div>
            <div className={styles.cardLabel}>{label}</div>
          </div>
        ))}
      </div>

      {issues.length > 0 && (
        <div className={styles.issues}>
          <div className={styles.issuesTitle}>Validation</div>
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
        {tree.length === 0 && (
          <div className={styles.empty}>No sections yet. Add the first section below.</div>
        )}

        {tree.map((section) => (
          <div key={section.id} className={styles.section}>
            <NodeRow
              level={0}
              node={section}
              canEdit={canEdit}
              pending={pending}
              onRename={(label) => run(() => updateNodeAction({ companyId, nodeId: section.id, label }))}
              onToggleActive={() =>
                run(() => setNodeActiveAction({ companyId, nodeId: section.id, active: !section.is_active }))
              }
            />
            {section.children.map((group) => (
              <div key={group.id} className={styles.group}>
                <NodeRow
                  level={1}
                  node={group}
                  canEdit={canEdit}
                  pending={pending}
                  onRename={(label) => run(() => updateNodeAction({ companyId, nodeId: group.id, label }))}
                  onToggleActive={() =>
                    run(() => setNodeActiveAction({ companyId, nodeId: group.id, active: !group.is_active }))
                  }
                />
                {group.children.map((cls) => (
                  <NodeRow
                    key={cls.id}
                    level={2}
                    node={cls}
                    canEdit={canEdit}
                    pending={pending}
                    onRename={(label) => run(() => updateNodeAction({ companyId, nodeId: cls.id, label }))}
                    onToggleActive={() =>
                      run(() => setNodeActiveAction({ companyId, nodeId: cls.id, active: !cls.is_active }))
                    }
                    onDirection={(dir) =>
                      run(() => updateNodeAction({ companyId, nodeId: cls.id, cashDirection: dir }))
                    }
                  />
                ))}
                {canEdit && (
                  <AddInline
                    level={2}
                    placeholder="Add class…"
                    withDirection
                    disabled={pending}
                    onAdd={(label, dir) =>
                      run(() =>
                        addNodeAction({
                          companyId,
                          versionId,
                          kind: "class",
                          label,
                          parentId: group.id,
                          cashDirection: dir,
                        }),
                      )
                    }
                  />
                )}
              </div>
            ))}
            {canEdit && (
              <AddInline
                level={1}
                placeholder="Add group…"
                disabled={pending}
                onAdd={(label) =>
                  run(() => addNodeAction({ companyId, versionId, kind: "group", label, parentId: section.id }))
                }
              />
            )}
          </div>
        ))}

        {canEdit && (
          <AddInline
            level={0}
            placeholder="Add section…"
            disabled={pending}
            onAdd={(label) =>
              run(() => addNodeAction({ companyId, versionId, kind: "section", label, parentId: null }))
            }
          />
        )}
      </div>

      {!canEdit && (
        <div className={styles.readonly}>Read-only — you do not have the “Edit cash flow structure” permission.</div>
      )}
    </div>
  );
}

type Dir = "in" | "out" | "neutral";

function NodeRow({
  level,
  node,
  canEdit,
  pending,
  onRename,
  onToggleActive,
  onDirection,
}: {
  level: 0 | 1 | 2;
  node: { id: string; label: string; is_active: boolean; cash_direction: Dir; kind: string };
  canEdit: boolean;
  pending: boolean;
  onRename: (label: string) => void;
  onToggleActive: () => void;
  onDirection?: (dir: Dir) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(node.label);

  return (
    <div
      className={styles.row}
      style={{ paddingLeft: 14 + level * 22, opacity: node.is_active ? 1 : 0.5 }}
    >
      <span className={styles.rowMark} data-level={level} aria-hidden />
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
        <span className={styles.rowLabel} data-level={level}>{node.label}</span>
      )}

      {node.kind === "class" && onDirection && (
        <select
          className={styles.dir}
          value={node.cash_direction}
          disabled={!canEdit || pending}
          onChange={(e) => onDirection(e.target.value as Dir)}
        >
          <option value="in">Cash In</option>
          <option value="out">Cash Out</option>
          <option value="neutral">Neutral</option>
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

function AddInline({
  level,
  placeholder,
  withDirection,
  disabled,
  onAdd,
}: {
  level: 0 | 1 | 2;
  placeholder: string;
  withDirection?: boolean;
  disabled?: boolean;
  onAdd: (label: string, dir: Dir) => void;
}) {
  const [value, setValue] = useState("");
  const [dir, setDir] = useState<Dir>("out");
  return (
    <form
      className={styles.addForm}
      style={{ paddingLeft: 14 + level * 22 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(value.trim(), dir);
        setValue("");
      }}
    >
      <input
        className={styles.input}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
      />
      {withDirection && (
        <select className={styles.dir} value={dir} onChange={(e) => setDir(e.target.value as Dir)} disabled={disabled}>
          <option value="in">Cash In</option>
          <option value="out">Cash Out</option>
          <option value="neutral">Neutral</option>
        </select>
      )}
      <button className={styles.btnSm} type="submit" disabled={disabled || !value.trim()}>
        Add
      </button>
    </form>
  );
}
