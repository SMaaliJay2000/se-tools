import { useEffect, useState } from "react";

// A deliberately tiny History API router: tools are addressed as /<tool-id>/<sub-path>, and the Vercel
// rewrite in vercel.json serves index.html for those paths. Swap for a router library if routing grows.

export function navigate(path: string) {
  if (path === location.pathname) return;
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0 });
}

export function usePathname() {
  const [pathname, setPathname] = useState(location.pathname);
  useEffect(() => {
    const sync = () => setPathname(location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return pathname;
}

/** Anchor that navigates client-side but keeps real href semantics (new tab, copy link, middle click). */
export function Link({ href, onClick, ...props }: React.ComponentProps<"a"> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(href);
      }}
      {...props}
    />
  );
}
