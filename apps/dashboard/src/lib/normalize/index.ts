// The normalization layer: every data source maps into one internal shape
// (NormalizedMeter), which the importer consumes. Add a source by adding a mapper.
export * from "./types";
export { normalizeEspi } from "./espi";
export {
  normalizeDownloadMyData,
  normalizeDownloadMyDataCsv,
  normalizeDownloadMyDataXml,
} from "./downloadmydata";
export { normalizeBayou, type BayouResponses } from "./bayou";
export {
  normalizeUtilityApi,
  countUtilityApiMeters,
  type UtilityApiResponses,
} from "./utilityapi";
