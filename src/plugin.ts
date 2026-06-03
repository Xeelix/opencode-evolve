import type { Plugin } from "@opencode-ai/plugin"
import { createEvolveTools } from "./tools"

export const EvolvePlugin: Plugin = async ({ client, worktree }) => {
  if (process.env.EVOLVE_DEBUG === "1") {
    await client.app.log({
      body: {
        service: "opencode-evolve",
        level: "info",
        message: `plugin loaded for ${worktree}`,
      },
    })
  }

  return {
    tool: createEvolveTools(),
  }
}

export default EvolvePlugin
