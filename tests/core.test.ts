import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  createSkill,
  listSkills,
  patchSkill,
  policyStatus,
  readSkill,
  removeSupportingFile,
  setSkillPolicy,
  writeSupportingFile,
} from "../src/core"

const tempDirs: string[] = []

async function createWorktree() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "opencode-evolve-"))
  tempDirs.push(dir)
  await mkdir(path.join(dir, ".opencode", "skills"), { recursive: true })
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("core", () => {
  test("creates and lists nested skills", async () => {
    const worktree = await createWorktree()
    await createSkill(worktree, "caps/frames", "Use when editing frame logic.", "# Frames")

    const skills = await listSkills(worktree)
    expect(skills).toEqual([
      {
        skill: "caps/frames",
        name: "caps-frames",
        description: "Use when editing frame logic.",
        locked: false,
      },
    ])
  })

  test("patch rewrites only when old_string matches exactly once", async () => {
    const worktree = await createWorktree()
    await createSkill(worktree, "caps/frames", "Use when editing frame logic.", "# Frames")
    const current = await readFile(path.join(worktree, ".opencode", "skills", "caps", "frames", "SKILL.md"), "utf8")
    const next = current.replace("# Frames", "# Updated Frames")

    await patchSkill(worktree, "caps/frames", current, next)
    const saved = await readFile(path.join(worktree, ".opencode", "skills", "caps", "frames", "SKILL.md"), "utf8")

    expect(saved).toContain("# Updated Frames")
  })

  test("patch rejects ambiguous old_string", async () => {
    const worktree = await createWorktree()
    await createSkill(worktree, "caps/frames", "Use when editing frame logic.", "repeat\nrepeat")

    await expect(patchSkill(worktree, "caps/frames", "repeat", "x")).rejects.toThrow(
      "old_string must match exactly once",
    )
  })

  test("write_file defaults to no overwrite", async () => {
    const worktree = await createWorktree()
    await createSkill(worktree, "plugin1", "Use when editing plugin code.", "# Plugin")
    await writeSupportingFile(worktree, "plugin1", "references/api.md", "hello")

    await expect(
      writeSupportingFile(worktree, "plugin1", "references/api.md", "updated"),
    ).rejects.toThrow("File already exists")
  })

  test("lock blocks write operations", async () => {
    const worktree = await createWorktree()
    await createSkill(worktree, "plugin1", "Use when editing plugin code.", "# Plugin")
    await setSkillPolicy(worktree, "plugin1", "locked")

    await expect(
      writeSupportingFile(worktree, "plugin1", "references/api.md", "hello"),
    ).rejects.toThrow("Skill is locked")
  })

  test("read includes supporting file footer", async () => {
    const worktree = await createWorktree()
    await createSkill(worktree, "plugin1", "Use when editing plugin code.", "# Plugin")
    await writeSupportingFile(worktree, "plugin1", "references/api.md", "hello")

    const content = await readSkill(worktree, "plugin1")
    expect(content).toContain("[This skill has supporting files:]")
    expect(content).toContain("references/api.md")
  })

  test("policy status reports one skill", async () => {
    const worktree = await createWorktree()
    await createSkill(worktree, "plugin1", "Use when editing plugin code.", "# Plugin")

    const status = await policyStatus(worktree, "plugin1")
    expect(status.count).toBe(1)
    expect(status.skills[0]?.policy).toBe("auto")
  })

  test("remove_file deletes supporting files", async () => {
    const worktree = await createWorktree()
    await createSkill(worktree, "plugin1", "Use when editing plugin code.", "# Plugin")
    await writeSupportingFile(worktree, "plugin1", "references/api.md", "hello")
    await removeSupportingFile(worktree, "plugin1", "references/api.md")

    await expect(readSkill(worktree, "plugin1", "references/api.md")).rejects.toThrow("File not found")
  })

  test("rejects symlink escape inside skill", async () => {
    const worktree = await createWorktree()
    await createSkill(worktree, "plugin1", "Use when editing plugin code.", "# Plugin")
    const skillDir = path.join(worktree, ".opencode", "skills", "plugin1")
    await symlink(path.join(worktree, ".opencode"), path.join(skillDir, "references"))

    await expect(
      writeSupportingFile(worktree, "plugin1", "references/api.md", "hello"),
    ).rejects.toThrow("Symlink path is not allowed")
  })

  test("rejects symlinked skills root", async () => {
    const worktree = await createWorktree()
    const opencodeDir = path.join(worktree, ".opencode")
    const root = path.join(opencodeDir, "skills")
    const outside = path.join(worktree, "outside-skills")

    await rm(root, { recursive: true, force: true })
    await mkdir(outside, { recursive: true })
    await symlink(outside, root)

    await expect(
      createSkill(worktree, "plugin1", "Use when editing plugin code.", "# Plugin"),
    ).rejects.toThrow("Symlink path is not allowed")

    await mkdir(path.join(outside, "plugin1"), { recursive: true })
    await writeFile(
      path.join(outside, "plugin1", "SKILL.md"),
      "---\nname: plugin1\ndescription: \"Use when editing plugin code.\"\n---\n\n# Plugin\n",
      "utf8",
    )

    await expect(readSkill(worktree, "plugin1")).rejects.toThrow("Symlink path is not allowed")
    await expect(
      writeSupportingFile(worktree, "plugin1", "references/api.md", "hello"),
    ).rejects.toThrow("Symlink path is not allowed")
  })

  test("rejects asset reads", async () => {
    const worktree = await createWorktree()
    await createSkill(worktree, "plugin1", "Use when editing plugin code.", "# Plugin")
    await writeSupportingFile(worktree, "plugin1", "assets/icon.svg", "<svg />")

    await expect(readSkill(worktree, "plugin1", "assets/icon.svg")).rejects.toThrow(
      "Assets are listed but not read as text",
    )
  })

  test("rejects secrets in content", async () => {
    const worktree = await createWorktree()
    await createSkill(worktree, "plugin1", "Use when editing plugin code.", "# Plugin")
    await expect(
      writeSupportingFile(worktree, "plugin1", "references/api.md", "API_KEY=secret"),
    ).rejects.toThrow("Possible secret detected")
  })

  test("rejects multiline descriptions", async () => {
    const worktree = await createWorktree()
    await expect(
      createSkill(worktree, "plugin1", "Use when editing plugin code.\nNope.", "# Plugin"),
    ).rejects.toThrow("Description must be a single line")
  })

  test("reports invalid metadata cleanly", async () => {
    const worktree = await createWorktree()
    await createSkill(worktree, "plugin1", "Use when editing plugin code.", "# Plugin")
    await writeFile(path.join(worktree, ".opencode", "skills", "plugin1", ".evolve.json"), "{", "utf8")

    await expect(policyStatus(worktree, "plugin1")).rejects.toThrow("Invalid .evolve.json for skill: plugin1")
  })
})
