import { WorkspaceGateway } from "../../infrastructure/workspace.js";
import { PATHS } from "../../infrastructure/paths.js";

export type CreateSpecResult =
  | { kind: "not-initialized" }
  | { kind: "already-exists"; filePath: string }
  | { kind: "created"; filePath: string };

function buildTemplate(name: string): string {
  return `# ${name}

## Objective

<!-- Describe what this feature should accomplish -->

## Functional Requirements

- 

## Non-Functional Requirements

- 

## Flow

<!-- Optional: describe the request/data flow -->

## Acceptance Criteria

- 

## Endpoints

<!-- List each endpoint involved -->

| Method | Path | Description |
|--------|------|-------------|
|        |      |             |

## Architecture

<!-- e.g. Clean Architecture, MVC, etc. -->

## Technologies

<!-- List the technologies involved -->

- 
`;
}

export class CreateSpecUseCase {
  constructor(private readonly gw: WorkspaceGateway) {}

  execute(name: string): CreateSpecResult {
    if (!this.gw.exists(PATHS.metadata)) {
      return { kind: "not-initialized" };
    }

    const slug = name.toLowerCase().replace(/\s+/g, "-");
    const filePath = PATHS.specFile(slug);

    if (this.gw.exists(filePath)) {
      return { kind: "already-exists", filePath };
    }

    this.gw.writeFile(filePath, buildTemplate(name));

    return { kind: "created", filePath };
  }
}
