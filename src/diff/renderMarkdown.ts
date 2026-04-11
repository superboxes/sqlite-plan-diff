import { renderNormalizedPlan, renderRawRows, renderSemanticDiff } from "./renderTerminal";
import type { PlanWithRaw, SemanticDiffResult } from "../types";

interface ComparisonOutput {
  before: PlanWithRaw;
  after: PlanWithRaw;
  diff: SemanticDiffResult;
}

function fencedText(content: string): string {
  return `\`\`\`text\n${content}\n\`\`\``;
}

function section(title: string, body: string): string {
  return `## ${title}\n\n${body}`;
}

function renderSemanticDiffMarkdown(result: SemanticDiffResult): string {
  const rendered = renderSemanticDiff(result);
  if (rendered === "No semantic changes detected.") {
    return rendered;
  }

  return rendered;
}

export function renderExplainMarkdown(output: PlanWithRaw): string {
  return [
    section("Raw EQP Rows", fencedText(renderRawRows(output.rawRows))),
    section("Normalized Summary", fencedText(renderNormalizedPlan(output.normalizedPlan)))
  ].join("\n\n");
}

export function renderComparisonMarkdown(output: ComparisonOutput): string {
  return [
    section("Semantic Diff", renderSemanticDiffMarkdown(output.diff)),
    section("Before Plan", fencedText(renderNormalizedPlan(output.before.normalizedPlan))),
    section("After Plan", fencedText(renderNormalizedPlan(output.after.normalizedPlan)))
  ].join("\n\n");
}
