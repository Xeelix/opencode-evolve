import { tool } from "@opencode-ai/plugin"
import {
  createSkill,
  listSkills,
  patchSkill,
  policyStatus,
  readSkill,
  removeSupportingFile,
  setSkillPolicy,
  writeSupportingFile,
} from "./core"
import { validateSkillPath } from "./validation"

function json(data: unknown): string {
  return JSON.stringify(data, null, 2)
}

export function createEvolveTools() {
  return {
    evolve_list: tool({
      description: "List local skills from .opencode/skills. Nested skill paths like 'caps/frames' are supported.",
      args: {
        prefix: tool.schema.string().optional().describe("Optional skill path prefix, e.g. 'caps'"),
      },
      async execute(args, context) {
        const skills = await listSkills(context.worktree, args.prefix)
        return json({ count: skills.length, skills })
      },
    }),

    evolve_read: tool({
      description: "Read SKILL.md or a supporting file from a local skill. Use the nested skill path as 'skill'.",
      args: {
        skill: tool.schema.string().describe("Skill path, e.g. 'plugin1' or 'caps/frames'"),
        file: tool.schema.string().optional().describe("Optional file path under the skill directory"),
      },
      async execute(args, context) {
        validateSkillPath(args.skill)
        return await readSkill(context.worktree, args.skill, args.file)
      },
    }),

    evolve_edit: tool({
      description: "Create a skill, patch SKILL.md safely, or manage supporting files. There is no full update action.",
      args: {
        action: tool.schema.enum(["create", "patch", "write_file", "remove_file"]).describe("Action to perform"),
        skill: tool.schema.string().describe("Skill path, e.g. 'plugin1' or 'caps/frames'"),
        description: tool.schema.string().optional().describe("Required for create"),
        body: tool.schema.string().optional().describe("Required for create"),
        old_string: tool.schema.string().optional().describe("Required for patch; must match exactly once"),
        new_string: tool.schema.string().optional().describe("Required for patch"),
        file: tool.schema.string().optional().describe("Required for write_file and remove_file"),
        content: tool.schema.string().optional().describe("Required for write_file"),
        overwrite: tool.schema.boolean().optional().describe("Optional for write_file; defaults to false"),
      },
      async execute(args, context) {
        validateSkillPath(args.skill)

        if (args.action === "create") {
          if (!args.description || args.body === undefined) {
            throw new Error("Create requires 'description' and 'body'.")
          }
          return json(await createSkill(context.worktree, args.skill, args.description, args.body))
        }

        if (args.action === "patch") {
          if (!args.old_string || args.new_string === undefined) {
            throw new Error("Patch requires 'old_string' and 'new_string'.")
          }
          return json(await patchSkill(context.worktree, args.skill, args.old_string, args.new_string))
        }

        if (args.action === "write_file") {
          if (!args.file || args.content === undefined) {
            throw new Error("write_file requires 'file' and 'content'.")
          }
          return json(
            await writeSupportingFile(
              context.worktree,
              args.skill,
              args.file,
              args.content,
              args.overwrite ?? false,
            ),
          )
        }

        if (args.action === "remove_file") {
          if (!args.file) {
            throw new Error("remove_file requires 'file'.")
          }
          return json(await removeSupportingFile(context.worktree, args.skill, args.file))
        }

        throw new Error(`Unknown action: ${args.action}`)
      },
    }),

    evolve_policy: tool({
      description: "Lock or unlock a local skill, or inspect policy status.",
      args: {
        action: tool.schema.enum(["lock", "unlock", "status"]).describe("Policy action"),
        skill: tool.schema.string().optional().describe("Required for lock and unlock; optional for status"),
      },
      async execute(args, context) {
        if (args.action === "status") {
          return json(await policyStatus(context.worktree, args.skill))
        }

        if (!args.skill) {
          throw new Error(`${args.action} requires 'skill'.`)
        }

        validateSkillPath(args.skill)
        return json(
          await setSkillPolicy(context.worktree, args.skill, args.action === "lock" ? "locked" : "auto"),
        )
      },
    }),
  }
}
