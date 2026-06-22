// The rate optimization agent's folder barrel: a side-effect import that registers the agent
// (run.ts calls register() at module load). The agents barrel (../index.ts) imports THIS, so
// "./rate-opt" resolves here and the agent is registered exactly once. Append-only convention.

import "./run";
