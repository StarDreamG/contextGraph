export interface QueryEntities {
  terms: string[];
  numbers: string[];
  ports: string[];
  ips: string[];
  files: string[];
  configKeys: string[];
}

export interface QueryIntent {
  intents: string[];
  expectedTypes: string[];
}

export interface QueryPlan {
  originalQuery: string;
  normalizedQuery: string;
  entities: QueryEntities;
  intents: string[];
  expectedTypes: string[];
  expandedQueries: string[];
}

const synonymGroups = {
  prohibition: ["不能", "禁止", "不得", "不允许", "不可", "must not", "never"],
  occupy: ["占用", "使用", "绑定", "listen", "bind"],
  port: ["端口", "port"],
  resource: ["资源", "resource"],
  isolation: ["隔离", "isolation", "sandbox"],
  test: ["测试", "test", "spec"],
  deploy: ["部署", "deploy", "production"],
  production: ["生产", "prod", "production"]
} as const;

const knownTerms = [
  "智策星",
  "隔离",
  "不能占用",
  "不得占用",
  "不允许占用",
  "不可占用",
  "禁止占用",
  "端口",
  "资源",
  "占用",
  "测试",
  "部署",
  "生产",
  "服务器",
  "地址",
  "nginx",
  "docker",
  "报错",
  "失败",
  "修复",
  "必须",
  "禁止",
  "不得",
  "不允许"
];

const genericTerms = new Set([
  "隔离",
  "不能占用",
  "不得占用",
  "不允许占用",
  "不可占用",
  "禁止占用",
  "端口",
  "资源",
  "占用",
  "测试",
  "部署",
  "生产",
  "服务器",
  "地址",
  "nginx",
  "docker",
  "报错",
  "失败",
  "修复",
  "必须",
  "禁止",
  "不得",
  "不允许"
]);

export function normalizeQuery(query: string): string {
  return query
    .normalize("NFKC")
    .replace(/[，,。；;？?!！、（）()「」『』【】[\]{}《》<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractEntities(query: string): QueryEntities {
  const normalized = normalizeQuery(query);
  const ips = unique(matches(normalized, /\b\d{1,3}(?:\.\d{1,3}){3}\b/g));
  const configKeys = unique(matches(normalized, /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/g));
  const files = unique([
    ...matches(normalized, /(?:^|\s)((?:\.{1,2}\/)?[\w.-]+(?:\/[\w.-]+)+(?:\.[\w-]+)?)/g, 1),
    ...matches(normalized, /\b[\w.-]+\.(?:ts|tsx|js|jsx|vue|java|py|go|rs|cpp|h|md|json|ya?ml|xml)\b/g)
  ]);
  const numbers = unique(matches(normalized, /\b\d+\b/g).filter((number) => !ips.some((ip) => ip.includes(number))));
  const ports = numbers.filter((number) => {
    const port = Number(number);
    return Number.isInteger(port) && port > 0 && port <= 65535;
  });

  const terms = unique([
    ...knownTerms.filter((term) => normalized.toLowerCase().includes(term.toLowerCase())),
    ...tokenTerms(normalized),
    ...numbers,
    ...ips,
    ...files,
    ...configKeys
  ]);

  return {
    terms,
    numbers,
    ports,
    ips,
    files,
    configKeys
  };
}

export function inferIntent(query: string): QueryIntent {
  const normalized = normalizeQuery(query).toLowerCase();
  const intents: string[] = [];
  const expectedTypes: string[] = [];

  if (containsAny(normalized, ["端口", "占用", "资源", "隔离", "port", "listen", "bind", "resource", "isolation"])) {
    intents.push("environment_constraint", "port_constraint");
    expectedTypes.push("Rule", "EnvironmentFact", "Risk", "PortConstraint");
  }

  if (containsAny(normalized, ["测试", "脚本", "跑一遍", "test", "spec", "playwright", "junit", "bruno"])) {
    intents.push("test_requirement");
    expectedTypes.push("Test", "Workflow", "Command");
  }

  if (containsAny(normalized, ["部署", "生产", "服务器", "ip", "地址", "nginx", "docker", "deploy", "prod"])) {
    intents.push("deployment", "environment");
    expectedTypes.push("EnvironmentFact", "Deployment", "Rule", "Risk");
  }

  if (containsAny(normalized, ["不能", "禁止", "不得", "必须", "不允许", "should", "must", "never"])) {
    intents.push("rule_lookup");
    expectedTypes.push("Rule", "Risk");
  }

  if (containsAny(normalized, ["报错", "失败", "修复", "failed", "error", "exception", "fix"])) {
    intents.push("failure_fix_lookup");
    expectedTypes.push("Failure", "Fix", "Decision");
  }

  return {
    intents: unique(intents),
    expectedTypes: unique(expectedTypes)
  };
}

export function expandQueries(query: string): string[] {
  const normalized = normalizeQuery(query);
  const entities = extractEntities(normalized);
  const subjects = subjectTerms(entities.terms);
  const focusTerms = entities.terms.filter((term) => genericTerms.has(term));
  const expanded: string[] = [normalized];

  for (const subject of subjects) {
    for (const focus of focusTerms) {
      expanded.push(`${subject} ${focus}`);
    }
  }

  addIfTerms(expanded, entities.terms, "隔离", "端口");
  addIfTerms(expanded, entities.terms, "隔离", "资源");
  addIfTerms(expanded, entities.terms, "不能占用", "端口");
  addIfTerms(expanded, entities.terms, "不得占用", "端口");
  addIfTerms(expanded, entities.terms, "资源", "占用");

  if (containsAny(normalized, synonymGroups.prohibition)) {
    for (const synonym of ["禁止", "不得", "不允许", "不可"]) {
      for (const subject of subjects) {
        expanded.push(`${subject} ${synonym}`);
        expanded.push(`${subject} ${synonym}占用`);
      }
      if (entities.terms.includes("端口")) {
        expanded.push(`${synonym}占用 端口`);
      }
    }
  }

  for (const entity of [...entities.numbers, ...entities.ips, ...entities.files, ...entities.configKeys]) {
    expanded.push(entity);
    for (const subject of subjects) {
      expanded.push(`${subject} ${entity}`);
    }
    if (entities.terms.includes("端口") || entities.ports.includes(entity)) {
      expanded.push(`端口 ${entity}`);
    }
  }

  return unique(expanded.filter((item) => item.length > 0)).slice(0, 40);
}

export function buildQueryPlan(query: string): QueryPlan {
  const originalQuery = query.trim();
  const normalizedQuery = normalizeQuery(originalQuery);
  const entities = extractEntities(normalizedQuery);
  const intent = inferIntent(normalizedQuery);
  return {
    originalQuery,
    normalizedQuery,
    entities,
    intents: intent.intents,
    expectedTypes: intent.expectedTypes,
    expandedQueries: expandQueries(normalizedQuery)
  };
}

function subjectTerms(terms: string[]): string[] {
  const subjects = terms.filter((term) => !genericTerms.has(term) && !/^\d+$/.test(term) && !term.includes("/"));
  return subjects.length > 0 ? subjects.slice(0, 3) : terms.slice(0, 1);
}

function tokenTerms(normalized: string): string[] {
  return normalized
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .filter((term) => /[A-Za-z0-9_.\-/]/.test(term));
}

function addIfTerms(expanded: string[], terms: string[], left: string, right: string): void {
  if (terms.includes(left) && terms.includes(right)) {
    expanded.push(`${left} ${right}`);
  }
}

function containsAny(input: string, values: readonly string[]): boolean {
  return values.some((value) => input.includes(value.toLowerCase()));
}

function matches(input: string, pattern: RegExp, group = 0): string[] {
  return [...input.matchAll(pattern)].map((match) => match[group]).filter((value): value is string => Boolean(value));
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
