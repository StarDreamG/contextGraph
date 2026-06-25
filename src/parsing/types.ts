export interface ParsedBlock {
  path: string;
  blockType: string;
  title: string | null;
  content: string;
  startLine: number | null;
  endLine: number | null;
}
