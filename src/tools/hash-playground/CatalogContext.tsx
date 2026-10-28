import { createContext, useContext } from "react";
import type { Catalog } from "./types";

const CatalogContext = createContext<Catalog | null>(null);

export const CatalogProvider = CatalogContext.Provider;

/** The algorithm catalog fetched once at startup; panels build their forms from it instead of hard-coding limits. */
export function useCatalog(): Catalog {
  const catalog = useContext(CatalogContext);
  if (!catalog) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return catalog;
}
