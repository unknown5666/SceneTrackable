// ============================================================
// NAV BRIDGE — let non-component code trigger a router navigation.
//
// The store and toasts live outside React, so they can't call
// `useNavigate()`. MainLayout registers the live navigate function here on
// mount; anyone can then call `navigateTo("/projects?review=1")` — e.g. the
// "Review" action on the background-breakdown completion toast.
// ============================================================

type NavFn = (to: string) => void;

let _navigate: NavFn | null = null;

export function setNavigator(fn: NavFn | null): void {
  _navigate = fn;
}

export function navigateTo(to: string): void {
  if (_navigate) _navigate(to);
  else window.location.assign(to); // pre-mount fallback
}
