import { promises as fs } from "node:fs"
import path from "node:path"

const SUPPORT_DIRS = new Set(["references", "templates", "scripts", "assets"])

export const SKILL_FILE = "SKILL.md"
export const META_FILE = ".evolve.json"

export function skillRoot(worktree: string): string {
  return path.join(worktree, ".opencode", "skills")
}

export function skillDir(worktree: string, skill: string): string {
  return path.join(skillRoot(worktree), skill)
}

export function skillFile(worktree: string, skill: string): string {
  return path.join(skillDir(worktree, skill), SKILL_FILE)
}

export function metaFile(worktree: string, skill: string): string {
  return path.join(skillDir(worktree, skill), META_FILE)
}

export function displayName(skill: string): string {
  return skill.replaceAll("/", "-")
}

export function isSupportDir(name: string): boolean {
  return SUPPORT_DIRS.has(name)
}

export function safeJoin(base: string, relPath: string): string {
  const target = path.resolve(base, relPath)
  const relative = path.relative(base, target)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes skill directory: ${relPath}`)
  }
  return target
}

export function cleanRelative(base: string, target: string): string {
  return path.relative(base, target).split(path.sep).join("/")
}

export function assertAllowedSkillFile(relPath: string): void {
  if (relPath === SKILL_FILE) return

  const segments = relPath.split("/")
  const first = segments[0]

  if (!first || !SUPPORT_DIRS.has(first)) {
    throw new Error("File must be SKILL.md or under references/, templates/, scripts/, or assets/.")
  }

  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || segment.startsWith(".")) {
      throw new Error(`Invalid file path: ${relPath}`)
    }
  }

  if (relPath === META_FILE || relPath.endsWith(`/${META_FILE}`)) {
    throw new Error(`${META_FILE} is protected.`)
  }
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function readText(filePath: string): Promise<string> {
  return await fs.readFile(filePath, "utf8")
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

export async function writeTextAtomic(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath))
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(tempPath, content, "utf8")
  await fs.rename(tempPath, filePath)
}

export async function assertNoSymlinkPath(base: string, target: string): Promise<void> {
  if (await exists(base)) {
    const baseStat = await fs.lstat(base)
    if (baseStat.isSymbolicLink()) {
      throw new Error(`Symlink path is not allowed: ${base}`)
    }
  }

  const relative = path.relative(base, target)
  const segments = relative === "" ? [] : relative.split(path.sep)

  let current = base
  for (const segment of segments) {
    current = path.join(current, segment)
    if (!(await exists(current))) continue
    const stat = await fs.lstat(current)
    if (stat.isSymbolicLink()) {
      throw new Error(`Symlink path is not allowed: ${cleanRelative(base, current)}`)
    }
  }
}

export async function scanSkillDirs(worktree: string): Promise<string[]> {
  const root = skillRoot(worktree)
  if (!(await exists(root))) return []

  const found: string[] = []

  const walk = async (dirPath: string): Promise<void> => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    if (entries.some((entry) => entry.isFile() && entry.name === SKILL_FILE)) {
      found.push(cleanRelative(root, dirPath))
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith(".")) continue
      await walk(path.join(dirPath, entry.name))
    }
  }

  await walk(root)
  return found.sort((a, b) => a.localeCompare(b))
}

export async function scanSupportingFiles(skillDirectory: string): Promise<string[]> {
  const out: string[] = []

  const walk = async (baseDir: string, prefix: string): Promise<void> => {
    if (!(await exists(baseDir))) return
    const entries = await fs.readdir(baseDir, { withFileTypes: true })
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(path.join(baseDir, entry.name), rel)
        continue
      }
      if (entry.isFile()) {
        out.push(rel)
      }
    }
  }

  for (const dirName of SUPPORT_DIRS) {
    await walk(path.join(skillDirectory, dirName), dirName)
  }

  return out.sort((a, b) => a.localeCompare(b))
}
