import path from "node:path"
import { META_FILE, SKILL_FILE, assertAllowedSkillFile, displayName } from "./paths"

const SEGMENT_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_SKILL_DEPTH = 3
const MAX_SKILL_LENGTH = 96
const MAX_DESCRIPTION_LENGTH = 300
const MAX_SKILL_CHARS = 100_000
const MAX_TEXT_FILE_BYTES = 262_144
const MAX_ASSET_BYTES = 1_048_576

const TEXT_EXTENSIONS: Record<string, Set<string>> = {
  references: new Set([".md"]),
  templates: new Set([".md", ".txt", ".json", ".yml", ".yaml", ".sh", ".ts", ".js", ".py"]),
  scripts: new Set([".sh", ".ts", ".js", ".py"]),
  assets: new Set(),
}

const SECRET_PATTERNS: RegExp[] = [
  /API_KEY\s*=/i,
  /PRIVATE_KEY\s*[:=]/i,
  /BEGIN RSA PRIVATE KEY/i,
  /BEGIN OPENSSH PRIVATE KEY/i,
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{20,}/,
]

export type Frontmatter = {
  name?: string
  description?: string
}

export function parseFrontmatter(content: string): Frontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}

  const frontmatter: Frontmatter = {}
  for (const line of match[1].split("\n")) {
    const parsed = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/)
    if (!parsed) continue
    const value = parsed[2].trim().replace(/^['"]|['"]$/g, "")
    if (parsed[1] === "name") frontmatter.name = value
    if (parsed[1] === "description") frontmatter.description = value
  }

  return frontmatter
}

export function validateSkillPath(skill: string): void {
  if (!skill || skill.length > MAX_SKILL_LENGTH) {
    throw new Error(`Invalid skill path: ${skill}`)
  }

  if (skill.startsWith("/") || skill.endsWith("/")) {
    throw new Error(`Invalid skill path: ${skill}`)
  }

  const segments = skill.split("/")
  if (segments.length > MAX_SKILL_DEPTH) {
    throw new Error(`Skill path is too deep: ${skill}`)
  }

  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || !SEGMENT_RE.test(segment)) {
      throw new Error(`Invalid skill path: ${skill}`)
    }
  }
}

export function validateDescription(description: string): void {
  if (!description.trim() || description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Description must be non-empty and at most ${MAX_DESCRIPTION_LENGTH} characters.`)
  }

  if (/[\r\n]/.test(description)) {
    throw new Error("Description must be a single line.")
  }
}

export function assertNoSecrets(content: string): void {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error("Possible secret detected.")
    }
  }
}

export function buildSkillContent(skill: string, description: string, body: string): string {
  validateDescription(description)
  return `---\nname: ${displayName(skill)}\ndescription: ${JSON.stringify(description)}\n---\n\n${body.trim()}\n`
}

export function validateSkillContent(skill: string, content: string): void {
  if (content.length > MAX_SKILL_CHARS) {
    throw new Error(`SKILL.md is too large (${content.length} chars).`)
  }

  if (!content.startsWith("---\n")) {
    throw new Error("SKILL.md must start with YAML frontmatter.")
  }

  const close = content.indexOf("\n---", 4)
  if (close === -1) {
    throw new Error("SKILL.md frontmatter must be closed with ---.")
  }

  const body = content.slice(close + 4).trimStart()
  if (!body) {
    throw new Error("SKILL.md must have a body after the frontmatter.")
  }

  if (body.startsWith("---")) {
    throw new Error("SKILL.md has duplicate frontmatter.")
  }

  const frontmatter = parseFrontmatter(content)
  if (!frontmatter.name) {
    throw new Error("Frontmatter must include name.")
  }
  if (!frontmatter.description) {
    throw new Error("Frontmatter must include description.")
  }

  validateDescription(frontmatter.description)

  const expectedName = displayName(skill)
  if (frontmatter.name !== expectedName) {
    throw new Error(`Frontmatter name must be ${expectedName}.`)
  }

  assertNoSecrets(content)
}

export function validateSupportingFilePath(relPath: string): { topLevel: string } {
  assertAllowedSkillFile(relPath)

  if (relPath === SKILL_FILE || relPath === META_FILE) {
    throw new Error(`Use skill actions to modify ${relPath}.`)
  }

  const [topLevel] = relPath.split("/")
  return { topLevel }
}

export function validateSupportingFileContent(relPath: string, content: string): void {
  const { topLevel } = validateSupportingFilePath(relPath)
  const bytes = Buffer.byteLength(content, "utf8")

  if (topLevel === "assets") {
    if (bytes > MAX_ASSET_BYTES) {
      throw new Error(`Asset file is too large (${bytes} bytes).`)
    }
  } else {
    if (bytes > MAX_TEXT_FILE_BYTES) {
      throw new Error(`Supporting file is too large (${bytes} bytes).`)
    }

    const ext = path.extname(relPath)
    if (!TEXT_EXTENSIONS[topLevel].has(ext)) {
      throw new Error(`Unsupported file extension for ${topLevel}: ${ext || "<none>"}`)
    }
  }

  assertNoSecrets(content)
}

export function assertReadableSupportingFile(relPath: string): void {
  const { topLevel } = validateSupportingFilePath(relPath)
  if (topLevel === "assets") {
    throw new Error("Assets are listed but not read as text.")
  }
}

export function countOccurrences(content: string, needle: string): number {
  if (!needle) return 0

  let count = 0
  let index = 0
  while (true) {
    const next = content.indexOf(needle, index)
    if (next === -1) return count
    count += 1
    index = next + needle.length
  }
}
