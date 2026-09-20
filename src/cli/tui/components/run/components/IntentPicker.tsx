import React, { useState, useEffect, memo, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { useNavigation } from "../../../context/NavigationContext.js";
import { useExecution } from "../../../context/ExecutionContext.js";
import { useContainer } from "../../../hooks/useContainer.js";
import { PATHS } from "../../../../../infrastructure/paths.js";
import { theme } from "../../../theme.js";
import { getIntentTaskCount } from "../../../context/ExecutionContext/taskLoader.js";

export interface IntentPickerItem {
  name: string;
  title: string;
  status: string;
  taskCount: number;
}
export interface IntentPickerProps {
  isInteractive?: boolean;
  onSelectIntent?: (intentName: string) => void;  initialIntents?: IntentPickerItem[];}
interface IntentPreviewDetails {
  description?: string;
  taskTitles: string[];
}

export const IntentPicker: React.FC<IntentPickerProps> = memo(
  ({
    isInteractive = true,
    onSelectIntent,
        initialIntents,
      }) => {
    const nav = useNavigation();
    const exec = useExecution();
    const container = useContainer();

    const effectiveInitial = initialIntents;

    const [intents, setIntents] = useState<IntentPickerItem[]>(() => {
      if (effectiveInitial) return effectiveInitial;
      const list = container.listIntentsUseCase.execute();
      return list.map((s) => ({
        name: s.name,
        title: s.title,
        status: s.status,
        taskCount: getIntentTaskCount(container.gw, s.name),
      }));
    });
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      if (effectiveInitial) return;
      const list = container.listIntentsUseCase.execute();
      const enriched = list.map((s) => ({
        name: s.name,
        title: s.title,
        status: s.status,
        taskCount: getIntentTaskCount(container.gw, s.name),
      }));
      setIntents(enriched);
    }, [container, effectiveInitial]);

    const intentsRef = React.useRef(intents);
    intentsRef.current = intents;
    const selectedIndexRef = React.useRef(selectedIndex);
    selectedIndexRef.current = selectedIndex;
    const onSelectHandler = onSelectIntent;
    const onSelectRef = React.useRef(onSelectHandler);
    onSelectRef.current = onSelectHandler;

    useInput(
      (input, key) => {
        const currentIntents = intentsRef.current;
        const currentIndex = selectedIndexRef.current;

        if (currentIntents.length === 0) {
          if (input === "c") nav.openModal("create_intent");
          if (input === "p") nav.openModal("pull_intent");
          return;
        }

        if (key.upArrow || input === "k") {
          setSelectedIndex((prev) =>
            prev <= 0 ? currentIntents.length - 1 : prev - 1,
          );
          return;
        }

        if (key.downArrow || input === "j") {
          setSelectedIndex((prev) =>
            prev >= currentIntents.length - 1 ? 0 : prev + 1,
          );
          return;
        }

        if (key.return || input === "\r" || input === "\n") {
          const chosen = currentIntents[currentIndex];
          if (chosen) {
            if (onSelectRef.current) {
              onSelectRef.current(chosen.name);
            }
            exec.setActiveIntent(chosen.name);
          }
          return;
        }

        if (input === "c") {
          nav.openModal("create_intent");
        }
        if (input === "p") {
          nav.openModal("pull_intent");
        }
      },
      { isActive: isInteractive && !nav.isTextInputActive && !nav.modal },
    );

    const selectedIntent = intents[selectedIndex];

    // Load preview data for the selected intent
    const previewDetails: IntentPreviewDetails = useMemo(() => {
      if (!selectedIntent) return { taskTitles: [] };
      const result: IntentPreviewDetails = { taskTitles: [] };
      try {
        const tasksDir = `${PATHS.tasksDir}/${selectedIntent.name}`;
        if (container.gw.exists(tasksDir)) {
          const files = container.gw
            .listDir(tasksDir)
            .filter((f) => f.endsWith(".json"))
            .sort();
          const titles: string[] = [];
          for (const file of files.slice(0, 5)) {
            try {
              const raw = container.gw.readFile(`${tasksDir}/${file}`);
              const parsed = JSON.parse(raw);
              titles.push(
                parsed.title || parsed.id || file.replace(".json", ""),
              );
            } catch {
              titles.push(file.replace(".json", ""));
            }
          }
          result.taskTitles = titles;
        }
      } catch {
        // ignore
      }
      return result;
    }, [container, selectedIntent]);

    if (intents.length === 0) {
      return (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.colors.borderSubtle}
          paddingX={2}
          paddingY={0}
          width="100%"
          flexGrow={1}
          alignItems="center"
          justifyContent="center"
        >
          <Text bold color={theme.colors.primary}>
            CodeForge
          </Text>
          <Text color={theme.colors.muted}>No intents found</Text>
          <Box gap={2}>
            <Text bold color={theme.colors.primary}>
              [c] Create
            </Text>
            <Text color={theme.colors.borderSubtle}>
              {theme.symbols.divider}
            </Text>
            <Text bold color={theme.colors.primary}>
              [p] Pull
            </Text>
          </Box>
        </Box>
      );
    }

    const cleanSelectedTitle = selectedIntent?.title
      .replace(/^Intent:\s*/i, "")
      .replace(/^Intent:\s*/i, "")
      .trim();

    return (
      <Box
        flexDirection="column"
        width="100%"
        flexGrow={1}
        paddingX={1}
        paddingY={0}
      >
        {/* Main Split: 42% Left (Intent List), 58% Right (Intent Preview) */}
        <Box flexDirection="row" width="100%" flexGrow={1}>
          {/* Left Column: List of Intents */}
          <Box flexDirection="column" width="42%" paddingRight={1}>
            <Box justifyContent="space-between" width="100%" marginBottom={1}>
              <Text bold color={theme.colors.primary}>
                Select an Intent ({intents.length})
              </Text>
              <Text color={theme.colors.muted}>[↑/↓] Move</Text>
            </Box>

            <Box flexDirection="column" gap={0}>
              {intents.map((s, idx) => {
                const isSelected = idx === selectedIndex;

                return (
                  <Box key={s.name} justifyContent="space-between" width="100%">
                    <Box gap={1} flexShrink={1}>
                      <Text
                        bold
                        color={
                          isSelected ? theme.colors.primary : theme.colors.muted
                        }
                      >
                        {isSelected ? theme.symbols.pointer : " "}
                      </Text>
                      <Text
                        bold={isSelected}
                        color={
                          isSelected ? theme.colors.primary : theme.colors.text
                        }
                        wrap="truncate-end"
                      >
                        {s.name}
                      </Text>
                    </Box>

                    <Box flexShrink={0} paddingLeft={1}>
                      <Text color={theme.colors.muted}>
                        {s.taskCount} task{s.taskCount === 1 ? "" : "s"}
                      </Text>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>

          {/* Vertical Divider */}
          <Box flexDirection="column" paddingX={1}>
            <Text color={theme.colors.borderSubtle}>
              {theme.symbols.divider}
            </Text>
          </Box>

          {/* Right Column: Intent Preview */}
          <Box flexDirection="column" width="56%" flexGrow={1} paddingLeft={1}>
            <Box marginBottom={1}>
              <Text bold color={theme.colors.primary}>
                Intent Preview
              </Text>
            </Box>

            {selectedIntent ? (
              <Box flexDirection="column" gap={1}>
                <Box gap={1}>
                  <Text bold color={theme.colors.text}>
                    {selectedIntent.name}
                  </Text>
                  {cleanSelectedTitle &&
                    cleanSelectedTitle !== selectedIntent.name && (
                      <Text color={theme.colors.muted}>
                        — {cleanSelectedTitle}
                      </Text>
                    )}
                </Box>

                <Box gap={2}>
                  <Text color={theme.colors.muted}>
                    Status:{" "}
                    <Text color={theme.colors.primary}>
                      {selectedIntent.status.toUpperCase()}
                    </Text>
                  </Text>
                  <Text color={theme.colors.borderSubtle}>
                    {theme.symbols.divider}
                  </Text>
                  <Text color={theme.colors.muted}>
                    Tasks:{" "}
                    <Text bold color={theme.colors.text}>
                      {selectedIntent.taskCount}
                    </Text>
                  </Text>
                </Box>

                {previewDetails.taskTitles.length > 0 && (
                  <Box flexDirection="column" marginTop={0}>
                    <Text color={theme.colors.muted}>Planned tasks:</Text>
                    {previewDetails.taskTitles.map((title, i) => (
                      <Box key={i} gap={1} paddingLeft={1}>
                        <Text color={theme.colors.accent}>
                          {theme.symbols.bullet}
                        </Text>
                        <Text color={theme.colors.muted} wrap="truncate-end">
                          {title}
                        </Text>
                      </Box>
                    ))}
                    {selectedIntent.taskCount >
                      previewDetails.taskTitles.length && (
                      <Box paddingLeft={1}>
                        <Text color={theme.colors.muted}>
                          ...and{" "}
                          {selectedIntent.taskCount -
                            previewDetails.taskTitles.length}{" "}
                          more
                        </Text>
                      </Box>
                    )}
                  </Box>
                )}

                {selectedIntent.taskCount === 0 && (
                  <Box paddingY={1}>
                    <Text color={theme.colors.muted}>
                      No task files generated yet. Starting run will initialize
                      tasks.
                    </Text>
                  </Box>
                )}
              </Box>
            ) : (
              <Text color={theme.colors.muted}>No intent selected.</Text>
            )}
          </Box>
        </Box>

        {/* Bottom Actions Bar */}
        <Box gap={1} marginTop={1} paddingTop={0}>
          <Text bold color={theme.colors.primary}>
            [Enter] Start Run
          </Text>
          <Text color={theme.colors.borderSubtle}>{theme.symbols.divider}</Text>
          <Text bold color={theme.colors.primary}>
            [c] New Intent
          </Text>
          <Text color={theme.colors.borderSubtle}>{theme.symbols.divider}</Text>
          <Text bold color={theme.colors.primary}>
            [p] Pull Intent
          </Text>
          <Text color={theme.colors.borderSubtle}>{theme.symbols.divider}</Text>
          <Text bold color={theme.colors.primary}>
            [2] Intents Tab
          </Text>
        </Box>
      </Box>
    );
  },
);

IntentPicker.displayName = "IntentPicker";export default IntentPicker;
