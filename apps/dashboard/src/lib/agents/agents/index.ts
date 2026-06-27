// The agent registration barrel. Importing this module registers every agent (each agent
// file calls register() at module load, for its side effect). The dispatcher imports this
// ONCE before iterating listAgents(), so importing the barrel is what populates the
// registry.
//
// APPEND-ONLY: a feature worktree adds its agent file under ./agents and appends ONE
// side-effect import line below — it never edits an existing line. Keep these as bare
// side-effect imports (no `from ... import {}`), in registration order.

import "./refresh";
import "./rebate";
import "./solar-watch";
import "./rate-opt";
import "./bill-audit/run";
import "./crop-scrape/run";
