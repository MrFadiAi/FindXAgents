import { skillImplementations } from "./skills/index.js";

interface SkillLike {
  name: string;
  promptAdd: string;
  isActive: boolean;
}

interface AgentLike {
  identityMd: string;
  soulMd: string;
  toolsMd: string;
  skills?: SkillLike[];
}

export function buildSystemPrompt(agent: AgentLike): string {
  const parts: string[] = [];

  // 1. Identity (who am I)
  if (agent.identityMd) {
    parts.push(agent.identityMd);
  }

  // 2. Soul (how I behave)
  if (agent.soulMd) {
    parts.push(agent.soulMd);
  }

  // 3. Tools (what I can use)
  if (agent.toolsMd) {
    parts.push(agent.toolsMd);
  }

  // 4. Skills (additional prompt fragments from active skills)
  const activeSkills = (agent.skills ?? []).filter((s) => s.isActive);
  if (activeSkills.length > 0) {
    const skillLines: string[] = ["# Active Skills\n"];
    for (const skill of activeSkills) {
      skillLines.push(`## ${skill.name}`);
      if (skill.promptAdd) {
        skillLines.push(skill.promptAdd);
      }
    }
    parts.push(skillLines.join("\n"));
  }

  // 5. Quality Checklist — prompt additions from skill implementations
  const matchedSkills = activeSkills
    .map((s) => skillImplementations[s.name])
    .filter(Boolean);

  if (matchedSkills.length > 0) {
    const checklistLines: string[] = ["# Quality Checklist\n"];
    checklistLines.push(
      "Your output will be validated against the following quality checks. Ensure your work passes all of them:",
    );
    for (const skill of matchedSkills) {
      checklistLines.push(`\n## ${skill.name}`);
      checklistLines.push(skill.getPromptAddition());
    }
    parts.push(checklistLines.join("\n"));
  }

  return parts.join("\n\n");
}
