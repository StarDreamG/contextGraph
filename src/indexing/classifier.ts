import type { NodeType } from "../types/domain.js";

export interface ClassifyInput {
  title: string | null;
  content: string;
  sourceId: string;
  blockId: string;
}

export interface NodeDraft {
  type: NodeType;
  title: string;
  content: string;
  confidence: number;
  status: "confirmed";
  metadata: Record<string, unknown>;
}

const rules: Array<{ type: NodeType; pattern: RegExp }> = [
  { type: "Command", pattern: /(^|\n)\s*(npm|pnpm|yarn|npx|mvn|java|git|node)\s+[^\n]+/i },
  { type: "Test", pattern: /\b(test|spec|junit|playwright|bruno|vitest|npm test|mvn test)\b|测试/i },
  { type: "Rule", pattern: /必须|不允许|禁止|\b(should|must|never|required)\b/i },
  { type: "Failure", pattern: /原因|导致|报错|\b(because|due to|failed|error|failure)\b/i },
  { type: "Fix", pattern: /修复|解决|\b(fix|fixed|resolved|resolve)\b/i },
  { type: "Decision", pattern: /决定|采用|选择|\b(decision|ADR|choose|chosen)\b/i },
  { type: "Environment", pattern: /环境|端口|docker|node\.js|java|mysql|redis|\b(env|environment)\b/i },
  { type: "Preference", pattern: /偏好|习惯|prefer|preference/i },
  { type: "Workflow", pattern: /流程|步骤|workflow|process/i }
];

export function classifyBlock(input: ClassifyInput): NodeDraft[] {
  const haystack = `${input.title ?? ""}\n${input.content}`;
  const matched = new Set<NodeType>();
  const nodes: NodeDraft[] = [];

  for (const rule of rules) {
    if (rule.pattern.test(haystack) && !matched.has(rule.type)) {
      matched.add(rule.type);
      nodes.push(toNode(rule.type, input));
    }
  }

  if (nodes.length === 0) {
    nodes.push(toNode("Note", input));
  }

  return nodes;
}

function toNode(type: NodeType, input: ClassifyInput): NodeDraft {
  return {
    type,
    title: input.title ?? type,
    content: input.content,
    confidence: 1,
    status: "confirmed",
    metadata: {
      sourceId: input.sourceId,
      blockId: input.blockId
    }
  };
}
