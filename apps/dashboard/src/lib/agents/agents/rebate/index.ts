// Side-effect barrel for the rebate agent folder: importing it registers the agent (run.ts
// calls register() at module load). The agents/index.ts barrel side-effect imports "./rebate",
// which resolves here.

import "./run";
