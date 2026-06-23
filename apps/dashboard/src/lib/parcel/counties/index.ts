// Central Valley county adapters. Each county is a config object (createEsriParcelAdapter) pointing
// at its public, token-free Esri parcel layer; adding a county = add its file here. The registry
// dispatches a point or a viewport bbox to whichever county covers it. Every layer below was
// live-verified to return polygon geometry without a token.

import type { CountyParcelAdapter } from "../types";
import { fresnoAdapter } from "./fresno";
import { maderaAdapter } from "./madera";
import { kingsAdapter } from "./kings";
import { tulareAdapter } from "./tulare";
import { kernAdapter } from "./kern";
import { mercedAdapter } from "./merced";
import { stanislausAdapter } from "./stanislaus";
import { sanJoaquinAdapter } from "./san-joaquin";
import { sacramentoAdapter } from "./sacramento";

export const CENTRAL_VALLEY_ADAPTERS: readonly CountyParcelAdapter[] = [
  fresnoAdapter,
  maderaAdapter,
  kingsAdapter,
  tulareAdapter,
  kernAdapter,
  mercedAdapter,
  stanislausAdapter,
  sanJoaquinAdapter,
  sacramentoAdapter,
];
