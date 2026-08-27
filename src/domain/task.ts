export interface Task {
  id: string;
  title: string;

  objective: string;

  context: string;

  implementation: string;

  files: string[];

  dependencies: string[];

  constraints: string[];

  acceptanceCriteria: string[];
}
