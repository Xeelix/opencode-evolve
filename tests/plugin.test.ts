import { describe, expect, test } from "bun:test"
import { EvolvePlugin } from "../src/plugin"

describe("plugin", () => {
  test("registers evolve tools", async () => {
    const plugin = await EvolvePlugin(
      {
        project: {} as never,
        client: {
          app: {
            log: async () => {},
          },
        } as never,
        $: {} as never,
        directory: process.cwd(),
        worktree: process.cwd(),
        experimental_workspace: {
          register() {},
        },
        serverUrl: new URL("https://example.com"),
      },
      {},
    )

    expect(plugin.tool).toBeDefined()
    expect(plugin.tool?.evolve_list).toBeDefined()
    expect(plugin.tool?.evolve_read).toBeDefined()
    expect(plugin.tool?.evolve_edit).toBeDefined()
    expect(plugin.tool?.evolve_policy).toBeDefined()
  })
})
