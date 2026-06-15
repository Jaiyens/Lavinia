// ESPI / Green Button ingestion. The parser is built to the fixed ESPI schema and
// tested against the sample XML under fixtures/greenbutton/; when real PG&E
// Self-Access data flows later, the parser is unchanged.
// - parse:    pure XML -> model (UsagePoints, intervals, summaries, address)
// - schedule: PG&E meter-read table loader + billing-cycle-close lookup
// - import:   the DB edge, upsert UsagePoints onto a Farm as Pumps with usage
export * from "./parse";
export * from "./schedule";
export * from "./import";
