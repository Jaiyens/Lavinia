// The solar-watch agent's own barrel. Importing this module registers the agent (run.ts calls
// register() at module load, for its side effect). The append-only agents barrel imports this
// folder once; keep this a bare side-effect import so a folder import resolves cleanly.

import "./run";
