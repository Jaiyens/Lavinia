// Barrel for the spreadsheet ingestion layer (pure: CSV text -> typed inventory rows).
export { parseCsv } from "./parse";
export {
  deriveIsLegacy,
  deriveIsSolar,
  parseInventory,
  toPumpStatus,
  type InventoryRow,
  type InventoryParse,
} from "./inventory";
export { canonicalEntityKey, displayOwner } from "./entity";
