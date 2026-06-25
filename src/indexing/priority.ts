import type { NodeType, Priority } from "../types/domain.js";

export interface PriorityAssessment {
  priority: Priority;
  reason: string;
}

const strongProhibitionPattern = /禁止|不允许|不得|不能|严禁|只提交不push|不要\s*push|\bnever\b|\bmust not\b/i;
const criticalContextPattern = /互联网|联网|secret|token|生产|线上|prod/i;
const requiredPattern = /必须|强制|required|must/i;
const p1Pattern = /必须|强制|required|must|失败|踩坑|报错|OOM|failed|failure|error|fix|修复|test|测试|deploy|部署/i;
const templateNoisePattern =
  /getting started|add your files|choose a self-explaining name|gitlab ci\/cd|invite team members|makeareadme/i;

const defaultPriorityByType: Record<NodeType, Priority> = {
  Rule: "P1",
  Failure: "P1",
  Fix: "P1",
  Test: "P1",
  Command: "P2",
  Decision: "P2",
  Environment: "P2",
  Workflow: "P2",
  Preference: "P2",
  AgentSession: "P2",
  File: "P3",
  Note: "P3"
};

export function assessPriority(type: NodeType, title: string, content: string): PriorityAssessment {
  const haystack = `${title}\n${content}`;

  if (
    type === "Rule" &&
    (strongProhibitionPattern.test(haystack) || (requiredPattern.test(haystack) && criticalContextPattern.test(haystack)))
  ) {
    return { priority: "P0", reason: "critical rule or safety constraint" };
  }

  if (templateNoisePattern.test(haystack)) {
    return { priority: "P4", reason: "template or low-signal boilerplate" };
  }

  if (type === "Rule" && p1Pattern.test(haystack)) {
    return { priority: "P1", reason: "required project rule" };
  }

  if (type === "Failure" || type === "Fix") {
    return { priority: "P1", reason: "known pitfall or repair knowledge" };
  }

  if (type === "Test") {
    return { priority: "P1", reason: "verification requirement" };
  }

  return { priority: defaultPriorityByType[type], reason: `default ${type} priority` };
}

export function priorityRank(priority: Priority): number {
  return Number(priority.slice(1));
}
