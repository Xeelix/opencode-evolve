import { promises as fs } from "node:fs"
import path from "node:path"
import {
  META_FILE,
  SKILL_FILE,
  assertAllowedSkillFile,
  assertNoSymlinkPath,
  cleanRelative,
  displayName,
  ensureDir,
  exists,
  metaFile,
  readText,
  safeJoin,
  scanSkillDirs,
  scanSupportingFiles,
  skillDir,
  skillFile,
  skillRoot,
  writeTextAtomic,
} from "./paths"
import {
  assertReadableSupportingFile,
  buildSkillContent,
  countOccurrences,
  parseFrontmatter,
  validateSkillContent,
  validateSkillPath,
  validateSupportingFileContent,
  validateSupportingFilePath,
} from "./validation"

export type Policy = "auto" | "locked"

export type SkillMeta = {
  version: 1
  policy: Policy
  createdAt: string
  updatedAt: string
}

export type SkillSummary = {
  skill: string
  name: string
  description: string
  locked: boolean
}

async function readMeta(worktree: string, skill: string): Promise<SkillMeta | null> {
  const filePath = metaFile(worktree, skill)
  if (!(await exists(filePath))) return null

  let raw: Partial<SkillMeta>
  try {
    raw = JSON.parse(await readText(filePath)) as Partial<SkillMeta>
  } catch {
    throw new Error(`Invalid ${META_FILE} for skill: ${skill}`)
  }

  return {
    version: 1,
    policy: raw.policy === "locked" ? "locked" : "auto",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  }
}

async function writeMeta(worktree: string, skill: string, meta: SkillMeta): Promise<void> {
  await writeTextAtomic(metaFile(worktree, skill), `${JSON.stringify(meta, null, 2)}\n`)
}

async function touchMeta(worktree: string, skill: string, policy?: Policy): Promise<SkillMeta> {
  const existing = await readMeta(worktree, skill)
  const now = new Date().toISOString()
  const next: SkillMeta = {
    version: 1,
    policy: policy ?? existing?.policy ?? "auto",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await writeMeta(worktree, skill, next)
  return next
}

async function assertUnlocked(worktree: string, skill: string): Promise<void> {
  const meta = await readMeta(worktree, skill)
  if (meta?.policy === "locked") {
    throw new Error("Skill is locked. Run evolve_policy(action='unlock') first.")
  }
}

async function loadSkill(skill: string, worktree: string) {
  validateSkillPath(skill)

  const root = skillRoot(worktree)
  const dirPath = skillDir(worktree, skill)
  const filePath = skillFile(worktree, skill)

  await assertNoSymlinkPath(root, dirPath)
  await assertNoSymlinkPath(dirPath, filePath)

  if (!(await exists(filePath))) {
    throw new Error(`Skill not found: ${skill}`)
  }

  return { root, dirPath, filePath }
}

function supportingFooter(skill: string, dirPath: string, files: string[]): string {
  if (files.length === 0) return ""
  const lines = files.map((file) => `- ${file}  ->  ${path.join(dirPath, file)}`).join("\n")
  return `\n\n[This skill has supporting files:]\n${lines}\n\nLoad any of these with evolve_read(skill="${skill}", file="<path>").\n`
}

export async function listSkills(worktree: string, prefix?: string): Promise<SkillSummary[]> {
  const skills = await scanSkillDirs(worktree)
  const filtered = prefix
    ? skills.filter((skill) => skill === prefix || skill.startsWith(`${prefix}/`))
    : skills

  const items = await Promise.all(
    filtered.map(async (skill) => {
      const content = await readText(skillFile(worktree, skill))
      const frontmatter = parseFrontmatter(content)
      const meta = await readMeta(worktree, skill)
      return {
        skill,
        name: displayName(skill),
        description: frontmatter.description ?? "",
        locked: meta?.policy === "locked",
      }
    }),
  )

  return items
}

export async function readSkill(worktree: string, skill: string, file = SKILL_FILE): Promise<string> {
  const { dirPath } = await loadSkill(skill, worktree)
  const fullPath = safeJoin(dirPath, file)
  await assertNoSymlinkPath(dirPath, fullPath)

  const relPath = cleanRelative(dirPath, fullPath)
  assertAllowedSkillFile(relPath)

  if (!(await exists(fullPath))) {
    throw new Error(`File not found in skill ${skill}: ${file}`)
  }

  if (relPath === SKILL_FILE) {
    const content = await readText(fullPath)
    const footer = supportingFooter(skill, dirPath, await scanSupportingFiles(dirPath))
    return content + footer
  }

  assertReadableSupportingFile(relPath)
  const stat = await fs.stat(fullPath)
  if (stat.size > 262_144) {
    throw new Error(`Supporting file is too large to read (${stat.size} bytes).`)
  }

  return await readText(fullPath)
}

export async function createSkill(
  worktree: string,
  skill: string,
  description: string,
  body: string,
): Promise<{ ok: true; created: string }> {
  validateSkillPath(skill)

  const filePath = skillFile(worktree, skill)
  if (await exists(filePath)) {
    throw new Error(`Skill already exists: ${skill}`)
  }

  const content = buildSkillContent(skill, description, body)
  validateSkillContent(skill, content)

  const dirPath = skillDir(worktree, skill)
  const root = skillRoot(worktree)
  await ensureDir(root)
  await assertNoSymlinkPath(root, dirPath)
  await writeTextAtomic(filePath, content)
  await touchMeta(worktree, skill)

  return { ok: true, created: filePath }
}

export async function patchSkill(
  worktree: string,
  skill: string,
  oldString: string,
  newString: string,
): Promise<{ ok: true; patched: string }> {
  if (!oldString) {
    throw new Error("Patch requires a non-empty old_string.")
  }

  await assertUnlocked(worktree, skill)
  const { dirPath, filePath } = await loadSkill(skill, worktree)
  await assertNoSymlinkPath(dirPath, filePath)

  const current = await readText(filePath)
  const matches = countOccurrences(current, oldString)
  if (matches === 0) {
    throw new Error(`old_string not found in ${filePath}`)
  }
  if (matches > 1) {
    throw new Error("old_string must match exactly once.")
  }

  const next = current.replace(oldString, newString)
  validateSkillContent(skill, next)
  await writeTextAtomic(filePath, next)
  await touchMeta(worktree, skill)

  return { ok: true, patched: filePath }
}

export async function writeSupportingFile(
  worktree: string,
  skill: string,
  relPath: string,
  content: string,
  overwrite = false,
): Promise<{ ok: true; written: string; overwritten: boolean }> {
  await assertUnlocked(worktree, skill)
  const { dirPath } = await loadSkill(skill, worktree)

  validateSupportingFilePath(relPath)
  validateSupportingFileContent(relPath, content)

  const fullPath = safeJoin(dirPath, relPath)
  await assertNoSymlinkPath(dirPath, path.dirname(fullPath))

  if ((await exists(fullPath)) && !overwrite) {
    throw new Error(`File already exists in skill ${skill}: ${relPath}`)
  }

  await writeTextAtomic(fullPath, content)
  await touchMeta(worktree, skill)

  return { ok: true, written: fullPath, overwritten: overwrite }
}

export async function removeSupportingFile(
  worktree: string,
  skill: string,
  relPath: string,
): Promise<{ ok: true; removed: string }> {
  await assertUnlocked(worktree, skill)
  const { dirPath } = await loadSkill(skill, worktree)

  validateSupportingFilePath(relPath)
  const fullPath = safeJoin(dirPath, relPath)
  await assertNoSymlinkPath(dirPath, fullPath)

  const cleanPath = cleanRelative(dirPath, fullPath)
  if (cleanPath === SKILL_FILE || cleanPath === META_FILE) {
    throw new Error(`${cleanPath} is protected.`)
  }
  if (!(await exists(fullPath))) {
    throw new Error(`File not found in skill ${skill}: ${relPath}`)
  }

  await fs.unlink(fullPath)
  await touchMeta(worktree, skill)

  return { ok: true, removed: fullPath }
}

export async function setSkillPolicy(
  worktree: string,
  skill: string,
  policy: Policy,
): Promise<{ ok: true; skill: string; policy: Policy }> {
  await loadSkill(skill, worktree)
  await touchMeta(worktree, skill, policy)
  return { ok: true, skill, policy }
}

export async function policyStatus(
  worktree: string,
  skill?: string,
): Promise<{ count: number; skills: Array<SkillSummary & { policy: Policy; updatedAt: string | null }> }> {
  if (skill) {
    validateSkillPath(skill)
  }

  const summaries = skill ? [skill] : await scanSkillDirs(worktree)
  const items = await Promise.all(
    summaries.map(async (skillPath) => {
      const content = await readText(skillFile(worktree, skillPath))
      const frontmatter = parseFrontmatter(content)
      const meta = await readMeta(worktree, skillPath)
      return {
        skill: skillPath,
        name: displayName(skillPath),
        description: frontmatter.description ?? "",
        locked: meta?.policy === "locked",
        policy: meta?.policy ?? "auto",
        updatedAt: meta?.updatedAt ?? null,
      }
    }),
  )

  return { count: items.length, skills: items }
}
