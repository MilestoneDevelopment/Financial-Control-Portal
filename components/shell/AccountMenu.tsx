"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./shell.module.css";

const ITEMS = [
  "My Profile",
  "Account Settings",
  "Change Password",
  "Notification Preferences",
  "Appearance",
  "My Access & Permissions",
  "Activity / Login History",
  "Help / Support",
];

/**
 * Account menu - personal settings, distinct from the Admin Console.
 * Phase 0 wires open/close + sign-out; individual settings modals come later.
 */
export function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function signOut() {
    setOpen(false);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const initials = email ? email.slice(0, 2).toUpperCase() : "··";

  return (
    <div className={styles.acct} ref={ref}>
      <button
        type="button"
        className={styles.acctBtn}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={styles.acctInit}>{initials}</span>
      </button>
      {open && (
        <div className={styles.acctMenu} role="menu">
          <div className={styles.acctEmail}>{email}</div>
          {ITEMS.map((label) => (
            <button key={label} type="button" className={styles.acctItem} role="menuitem">
              {label}
            </button>
          ))}
          <div className={styles.acctDivider} />
          <button type="button" className={styles.acctItem} role="menuitem" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
