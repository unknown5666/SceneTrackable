// ============================================================
// SHARED MOTION VARIANTS
//
// One place for the app's motion language so every surface animates the same
// way: 150–250ms, subtle, spring where it helps. Framer Motion honours
// `prefers-reduced-motion` when components use `useReducedMotion`, and these
// variants are small enough to be near-invisible when it doesn't.
// ============================================================

import type { Variants, Transition } from "framer-motion";

/** Standard easing + duration for enter/exit fades. */
export const EASE: Transition = { duration: 0.2, ease: [0.22, 1, 0.36, 1] };

/** A soft spring for pills, badges and layout shifts. */
export const SPRING: Transition = { type: "spring", stiffness: 500, damping: 34, mass: 0.8 };

/** Springy pop for things that "arrive" — summary cards, badges. */
export const POP: Transition = { type: "spring", stiffness: 420, damping: 24 };

/** Page/route content: fade + a small upward slide. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: EASE },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

/** Container that staggers its children in (~25ms apart). */
export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.025 } },
};

/** A single card/row inside a stagger container. */
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: EASE },
};

/** Dropdown/menu: scale + fade from an origin corner. */
export const menuVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } },
};

/** Modal panel: scale + fade. */
export const modalPanelVariants: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, scale: 0.98, y: 8, transition: { duration: 0.14 } },
};

/** Backdrop fade. */
export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.14 } },
};

/** Element chip flying in — used by the breakdown theater. */
export const chipVariants: Variants = {
  initial: { opacity: 0, scale: 0.7, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: POP },
  exit: { opacity: 0, scale: 0.7 },
};
