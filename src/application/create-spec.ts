import fs from "node:fs";
import path from "node:path";

const CODEFORGE_DIR = ".codeforge";
const SPECS_DIR = "specs";

export interface CreateSpecResult {
  notInitialized: boolean;
  alreadyExists: boolean;
  filePath: string;
}

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
  workspacePath: string,
  name: string
): CreateSpecResult {
  const codeforgeRoot = path.join(workspacePath, CODEFORGE_DIR);
  const metadataPath = path.join(codeforgeRoot, "metadata.json");

  if (!fs.existsSync(metadataPath)) {
    return { notInitialized: true, alreadyExists: false, filePath: "" };
  }

  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const fileName = `${slug}.md`;
  const filePath = path.join(codeforgeRoot, SPECS_DIR, fileName);

  if (fs.existsSync(filePath)) {
    return { notInitialized: false, alreadyExists: true, filePath };
  }

  fs.writeFileSync(filePath, buildTemplate(name), "utf-8");

  return { notInitialized: false, alreadyExists: false, filePath };
}
