import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";

export type CreateIntentResult =
  | { kind: "not-initialized" }
  | { kind: "already-exists"; filePath: string }
  | { kind: "created"; filePath: string };

function buildTemplate(name: string): string {
  return `# ${name}

## Goal
<!-- What should this accomplish? -->

## Requirements
- 

## Acceptance Criteria
- 

## Technical Context
<!-- Stack, endpoints, architecture if needed -->
`;
}

export class CreateIntentUseCase {
  constructor(private readonly gw: WorkspaceGateway) {}

  execute(name: string): CreateIntentResult {
    if (!this.gw.exists(PATHS.metadata)) {
      return { kind: "not-initialized" };
    }

    const slug = name.toLowerCase().replace(/\s+/g, "-");
    const filePath = PATHS.intentFile(slug);

    if (this.gw.exists(filePath)) {
      return { kind: "already-exists", filePath };
    }

    this.gw.writeFile(filePath, buildTemplate(name));

    return { kind: "created", filePath };
  }
}
