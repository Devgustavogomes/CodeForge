import { beforeEach, describe, expect, it } from "vitest";
import { DeleteTaskUseCase } from "../../src/application/use-cases/DeleteTaskUseCase.js";
import {
  SpecExecutionState,
  TaskStatus,
} from "../../src/domain/execution.js";
import { Task } from "../../src/domain/task.js";
import { PATHS } from "../../src/infrastructure/paths.js";
import { ExecutionStateRepository } from "../../src/infrastructure/repositories/ExecutionStateRepository.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";
import { TaskBuilder } from "../helpers/task-builder.js";
import { WorkspaceBuilder } from "../helpers/workspace-builder.js";

const SPEC_NAME = "test-spec";
const TARGET_ID = "TASK-002";

function makeTask(
  id: string,
  dependencies: string[] = [],
  overrides: Partial<Task> = {},
): Task {
  return TaskBuilder.aTask({
    id,
    title: `Title for ${id}`,
    dependencies,
    ...overrides,
  }).build();
}

function initializedWorkspace(tasks: Task[]): InMemoryWorkspaceGateway {
  return WorkspaceBuilder.aWorkspace()
    .withMetadata()
    .withSpec(SPEC_NAME)
    .withTasks(SPEC_NAME, tasks)
    .build();
}

function saveExecutionState(
  repo: ExecutionStateRepository,
  tasks: Task[],
  statuses: Record<string, TaskStatus>,
  overrides: Partial<SpecExecutionState> = {},
): void {
  const state = repo.init(SPEC_NAME, tasks);
  Object.assign(state, overrides);
  for (const [taskId, status] of Object.entries(statuses)) {
    state.tasks[taskId].status = status;
  }
  repo.save(state);
}

describe("DeleteTaskUseCase", () => {
  let gateway: InMemoryWorkspaceGateway;
  let repository: ExecutionStateRepository;
  let useCase: DeleteTaskUseCase;

  beforeEach(() => {
    gateway = initializedWorkspace([
      makeTask("TASK-001"),
      makeTask(TARGET_ID),
      makeTask("TASK-003", ["TASK-001", TARGET_ID]),
    ]);
    repository = new ExecutionStateRepository(gateway);
    useCase = new DeleteTaskUseCase(gateway, repository);
  });

  it("returns not-initialized without changing any task or execution data", () => {
    gateway.deleteFile(PATHS.metadata);
    saveExecutionState(
      repository,
      [makeTask("TASK-001"), makeTask(TARGET_ID)],
      { "TASK-001": "pending", [TARGET_ID]: "pending" },
    );
    const filesBefore = new Map(gateway.files);

    const result = useCase.execute(SPEC_NAME, TARGET_ID);

    expect(result).toEqual({ kind: "not-initialized" });
    expect(gateway.files).toEqual(filesBefore);
  });

  it("returns spec-not-found without deleting orphaned task or execution data", () => {
    gateway.deleteFile(PATHS.specFile(SPEC_NAME));
    saveExecutionState(
      repository,
      [makeTask("TASK-001"), makeTask(TARGET_ID)],
      { "TASK-001": "completed", [TARGET_ID]: "pending" },
    );
    const filesBefore = new Map(gateway.files);

    const result = useCase.execute(SPEC_NAME, TARGET_ID);

    expect(result).toEqual({ kind: "spec-not-found" });
    expect(gateway.files).toEqual(filesBefore);
  });

  it("returns task-not-found without changing siblings or execution state", () => {
    saveExecutionState(
      repository,
      [makeTask("TASK-001"), makeTask(TARGET_ID)],
      { "TASK-001": "pending", [TARGET_ID]: "pending" },
    );
    const filesBefore = new Map(gateway.files);

    const result = useCase.execute(SPEC_NAME, "TASK-404");

    expect(result).toEqual({ kind: "task-not-found" });
    expect(gateway.files).toEqual(filesBefore);
  });

  it("deletes only the selected file and cleans every changed sibling once", () => {
    const firstSibling = makeTask("TASK-001", [
      "TASK-000",
      TARGET_ID,
      "TASK-004",
      TARGET_ID,
    ], {
      title: "Preserved title",
      objective: "Preserved objective",
      files: ["src/example.ts"],
      constraints: ["Keep this constraint"],
      acceptanceCriteria: ["Keep this criterion"],
    });
    const secondSibling = makeTask("TASK-003", [TARGET_ID]);
    const unchangedSibling = makeTask("TASK-004", ["TASK-001"]);
    gateway = initializedWorkspace([
      firstSibling,
      makeTask(TARGET_ID),
      secondSibling,
      unchangedSibling,
    ]);
    repository = new ExecutionStateRepository(gateway);
    useCase = new DeleteTaskUseCase(gateway, repository);

    const unchangedPath = PATHS.taskFile(SPEC_NAME, "TASK-004");
    const unchangedRaw = '{"customFormatting":true,"id":"TASK-004","title":"Unchanged","objective":"O","context":"C","implementation":"I","files":[],"dependencies":["TASK-001"],"constraints":[],"acceptanceCriteria":[],"extension":{"keep":true}}';
    gateway.writeFile(unchangedPath, unchangedRaw);
    gateway.writeFile(`${PATHS.tasksDir}/${SPEC_NAME}/notes.txt`, "keep me");
    gateway.writeFile(
      PATHS.taskFile("other-spec", TARGET_ID),
      JSON.stringify(makeTask(TARGET_ID)),
    );

    const result = useCase.execute(SPEC_NAME, TARGET_ID);

    expect(result).toEqual({
      kind: "deleted",
      specName: SPEC_NAME,
      taskId: TARGET_ID,
      cleanedDependenciesCount: 2,
    });
    expect(gateway.exists(PATHS.taskFile(SPEC_NAME, TARGET_ID))).toBe(false);
    expect(gateway.exists(PATHS.taskFile("other-spec", TARGET_ID))).toBe(true);
    expect(gateway.readFile(`${PATHS.tasksDir}/${SPEC_NAME}/notes.txt`)).toBe(
      "keep me",
    );

    const cleanedFirst = JSON.parse(
      gateway.readFile(PATHS.taskFile(SPEC_NAME, "TASK-001")),
    ) as Task;
    const cleanedSecond = JSON.parse(
      gateway.readFile(PATHS.taskFile(SPEC_NAME, "TASK-003")),
    ) as Task;
    expect(cleanedFirst).toEqual({
      ...firstSibling,
      dependencies: ["TASK-000", "TASK-004"],
    });
    expect(cleanedSecond.dependencies).toEqual([]);
    expect(gateway.readFile(unchangedPath)).toBe(unchangedRaw);
  });

  it("does not create execution state when the specification has never run", () => {
    expect(repository.load(SPEC_NAME)).toBeNull();

    const result = useCase.execute(SPEC_NAME, TARGET_ID);

    expect(result.kind).toBe("deleted");
    expect(gateway.exists(PATHS.executionState(SPEC_NAME))).toBe(false);
  });

  it.each<{
    remainingStatus: TaskStatus;
    expectedStatus: TaskStatus;
    expectsCompletedAt: boolean;
  }>([
    {
      remainingStatus: "completed",
      expectedStatus: "completed",
      expectsCompletedAt: true,
    },
    {
      remainingStatus: "failed",
      expectedStatus: "failed",
      expectsCompletedAt: true,
    },
    {
      remainingStatus: "running",
      expectedStatus: "running",
      expectsCompletedAt: false,
    },
    {
      remainingStatus: "pending",
      expectedStatus: "pending",
      expectsCompletedAt: false,
    },
  ])(
    "recalculates the specification as $expectedStatus when a remaining task is $remainingStatus",
    ({ remainingStatus, expectedStatus, expectsCompletedAt }) => {
      const tasks = [makeTask("TASK-001", [TARGET_ID]), makeTask(TARGET_ID)];
      gateway = initializedWorkspace(tasks);
      repository = new ExecutionStateRepository(gateway);
      useCase = new DeleteTaskUseCase(gateway, repository);
      saveExecutionState(
        repository,
        tasks,
        { "TASK-001": remainingStatus, [TARGET_ID]: "completed" },
        {
          status: "completed",
          completedAt: "2026-09-01T10:05:00.000Z",
        },
      );

      useCase.execute(SPEC_NAME, TARGET_ID);

      const updatedState = repository.load(SPEC_NAME)!;
      expect(updatedState.status).toBe(expectedStatus);
      expect(updatedState.tasks[TARGET_ID]).toBeUndefined();
      expect(updatedState.tasks["TASK-001"].dependencies).toEqual([]);
      if (expectsCompletedAt) {
        expect(updatedState.completedAt).toBeDefined();
      } else {
        expect(updatedState.completedAt).toBeUndefined();
      }
    },
  );

  it("marks a mixed set of completed remaining tasks as completed", () => {
    const tasks = [
      makeTask("TASK-001"),
      makeTask(TARGET_ID),
      makeTask("TASK-003"),
    ];
    gateway = initializedWorkspace(tasks);
    repository = new ExecutionStateRepository(gateway);
    useCase = new DeleteTaskUseCase(gateway, repository);
    saveExecutionState(
      repository,
      tasks,
      {
        "TASK-001": "completed",
        [TARGET_ID]: "running",
        "TASK-003": "completed",
      },
      { status: "running" },
    );

    useCase.execute(SPEC_NAME, TARGET_ID);

    const updatedState = repository.load(SPEC_NAME)!;
    expect(updatedState.status).toBe("completed");
    expect(updatedState.completedAt).toEqual(expect.any(String));
  });

  it("preserves unrelated execution task data while cleaning stale dependencies", () => {
    const tasks = [makeTask("TASK-001", [TARGET_ID, "TASK-000"]), makeTask(TARGET_ID)];
    gateway = initializedWorkspace(tasks);
    repository = new ExecutionStateRepository(gateway);
    useCase = new DeleteTaskUseCase(gateway, repository);
    saveExecutionState(
      repository,
      tasks,
      { "TASK-001": "failed", [TARGET_ID]: "completed" },
      {
        status: "failed",
        startedAt: "2026-09-01T09:00:00.000Z",
        completedAt: "2026-09-01T10:00:00.000Z",
      },
    );
    const state = repository.load(SPEC_NAME)!;
    state.tasks["TASK-001"].title = "Preserved execution title";
    state.tasks["TASK-001"].startedAt = "2026-09-01T09:05:00.000Z";
    state.tasks["TASK-001"].completedAt = "2026-09-01T09:10:00.000Z";
    state.tasks["TASK-001"].errors = ["Preserved error"];
    repository.save(state);

    useCase.execute(SPEC_NAME, TARGET_ID);

    const updatedState = repository.load(SPEC_NAME)!;
    expect(updatedState.startedAt).toBe("2026-09-01T09:00:00.000Z");
    expect(updatedState.completedAt).toBe("2026-09-01T10:00:00.000Z");
    expect(updatedState.tasks["TASK-001"]).toEqual({
      status: "failed",
      dependencies: ["TASK-000"],
      title: "Preserved execution title",
      startedAt: "2026-09-01T09:05:00.000Z",
      completedAt: "2026-09-01T09:10:00.000Z",
      errors: ["Preserved error"],
    });
  });

  it("marks an existing execution completed after deleting its last task", () => {
    const tasks = [makeTask(TARGET_ID)];
    gateway = initializedWorkspace(tasks);
    repository = new ExecutionStateRepository(gateway);
    useCase = new DeleteTaskUseCase(gateway, repository);
    saveExecutionState(repository, tasks, { [TARGET_ID]: "pending" });

    useCase.execute(SPEC_NAME, TARGET_ID);

    const updatedState = repository.load(SPEC_NAME)!;
    expect(updatedState.tasks).toEqual({});
    expect(updatedState.status).toBe("completed");
    expect(updatedState.completedAt).toEqual(expect.any(String));
  });
});
