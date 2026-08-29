import { WorkspaceGateway } from "../infrastructure/workspace.js";
import { PATHS } from "../infrastructure/paths.js";

export type CreateSpecResult =
  | { kind: "not-initialized" }
  | { kind: "already-exists"; filePath: string }
  | { kind: "created"; filePath: string };

function buildTemplate(name: string): string {
  const id = name.toLowerCase().replace(/\s+/g, "-");
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

export function createSpec(
  gw: WorkspaceGateway,
  name: string
): CreateSpecResult {
  if (!gw.exists(PATHS.metadata)) {
    return { kind: "not-initialized" };
  }

  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const filePath = PATHS.specFile(slug);

  if (gw.exists(filePath)) {
    return { kind: "already-exists", filePath };
  }

  gw.writeFile(filePath, buildTemplate(name));

  return { kind: "created", filePath };
}
