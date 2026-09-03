import { describe, it, expect, beforeEach } from "vitest";
import { ConfigService } from "../../src/config/ConfigService.js";
import { CodeForgeConfig } from "../../src/config/types.js";
import { PATHS } from "../../src/infrastructure/paths.js";
import { InMemoryWorkspaceGateway } from "../helpers/in-memory-workspace.js";

describe("ConfigService hooks", () => {
  let workspace: InMemoryWorkspaceGateway;
  let configService: ConfigService;

  beforeEach(() => {
    workspace = new InMemoryWorkspaceGateway();
    configService = new ConfigService(workspace);
  });

  it("leaves hooks undefined for a workspace that configures none", () => {
    workspace.writeFile(
      PATHS.config,
      "environment: claude\nplannerAgent: p\nexecutorAgent: e\nlanguage: en\n",
    );

    const config = configService.loadConfig();

    expect(config?.hooks).toBeUndefined();
    expect(config?.environment).toBe("claude");
  });

  it("parses hooks declared per lifecycle event", () => {
    workspace.writeFile(
      PATHS.config,
      [
        "environment: claude",
        "plannerAgent: p",
        "executorAgent: e",
        "language: en",
        "hooks:",
        "  task.verify:",
        "    - name: sf gate",
        "      run: sf check",
        "      type: gate",
        "  run.completed:",
        "    - name: notify",
        "      run: ./notify.sh",
        "",
      ].join("\n"),
    );

    const config = configService.loadConfig();

    expect(config?.hooks?.["task.verify"]).toEqual([
      { name: "sf gate", run: "sf check", type: "gate" },
    ]);
    expect(config?.hooks?.["run.completed"]).toEqual([
      { name: "notify", run: "./notify.sh" },
    ]);
  });

  it("round-trips hooks through save and load", () => {
    const testConfig: CodeForgeConfig = {
      environment: "claude",
      plannerAgent: "p",
      executorAgent: "e",
      language: "en",
      hooks: {
        "task.verify": [
          { name: "sf gate", run: "sf check", type: "gate", timeout: 120000 },
        ],
      },
    };

    configService.saveConfig(testConfig);

    expect(configService.loadConfig()).toEqual(testConfig);
  });
});
