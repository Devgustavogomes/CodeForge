import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { Modal } from "../common/Modal.js";
import { useNavigation } from "../../context/NavigationContext.js";
import {
  PullSpecUseCase,
  PullSpecResult,
} from "../../../../application/use-cases/PullSpecUseCase.js";
import { SpecSourceFactory } from "../../../../infrastructure/spec-sources/SpecSourceFactory.js";
import {
  AppContainer,
  createAppContainer,
} from "../../../../infrastructure/container.js";
import {
  SpecSourceConfig,
  SpecReference,
} from "../../../../domain/spec-source.js";

export interface PullSpecModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: (specName: string, filePath: string) => void;
  container?: AppContainer;
  pullSpecUseCase?: PullSpecUseCase;
  defaultProvider?: string;
  width?: number | string;
}

const PROVIDERS = ["github", "linear", "clickup", "filesystem"] as const;
type FocusedField = "provider" | "id" | "name";

/**
 * Modal dialog for pulling a specification from an external provider (GitHub, Linear, ClickUp, filesystem).
 * Automatically lists remote issues/specs when available for selection, with fallback to manual ID input.
 */
export const PullSpecModal: React.FC<PullSpecModalProps> = ({
  isOpen = true,
  onClose,
  onSuccess,
  container,
  pullSpecUseCase,
  defaultProvider,
  width = "100%",
}) => {
  const nav = useNavigation();
  const setTextInputActive = nav.setTextInputActive;
  const appContainer = useMemo(
    () => container ?? createAppContainer(),
    [container],
  );
  const config = useMemo(() => {
    try {
      return appContainer.configService.loadConfig();
    } catch {
      return null;
    }
  }, [appContainer]);

  const configuredProvider =
    defaultProvider || config?.specSource?.provider || "github";

  const [providerIndex, setProviderIndex] = useState(() => {
    const idx = PROVIDERS.indexOf(
      configuredProvider as (typeof PROVIDERS)[number],
    );
    return idx >= 0 ? idx : 0;
  });

  const [items, setItems] = useState<SpecReference[]>([]);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [isFetchingItems, setIsFetchingItems] = useState(false);
  const [isManualInput, setIsManualInput] = useState(false);

  const [specId, setSpecId] = useState("");
  const [customName, setCustomName] = useState("");
  const [activeField, setActiveField] = useState<FocusedField>("id");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectedProvider = PROVIDERS[providerIndex];

  // Fetch available items whenever modal opens or provider changes
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    setIsFetchingItems(true);
    setErrorMessage(null);

    const provider = PROVIDERS[providerIndex];
    const specSourceConfig: SpecSourceConfig = {
      ...(config?.specSource ?? {}),
      provider,
    };

    try {
      const source = SpecSourceFactory.create(provider, specSourceConfig);
      source
        .list({ limit: 10 })
        .then((list) => {
          if (!isCancelled) {
            const safeList = Array.isArray(list) ? list : [];
            setItems(safeList);
            setIsFetchingItems(false);
            if (safeList.length > 0) {
              setSelectedItemIndex(0);
              setSpecId(safeList[0].id);
              setIsManualInput(false);
            } else {
              setIsManualInput(true);
            }
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setItems([]);
            setIsFetchingItems(false);
            setIsManualInput(true);
          }
        });
    } catch {
      if (!isCancelled) {
        setItems([]);
        setIsFetchingItems(false);
        setIsManualInput(true);
      }
    }

    return () => {
      isCancelled = true;
    };
  }, [isOpen, providerIndex, config]);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setIsLoading(false);
      setActiveField("id");
      setTextInputActive?.(true);
    } else {
      setTextInputActive?.(false);
    }
    return () => {
      setTextInputActive?.(false);
    };
  }, [isOpen, setTextInputActive]);

  const handleClose = useCallback(() => {
    setErrorMessage(null);
    setIsLoading(false);
    setTextInputActive?.(false);
    if (onClose) {
      onClose();
    } else {
      nav?.closeModal();
    }
  }, [nav, onClose, setTextInputActive]);

  const handleSubmit = useCallback(async () => {
    let finalId = specId.trim();
    if (
      !isManualInput &&
      items.length > 0 &&
      selectedItemIndex < items.length
    ) {
      finalId = items[selectedItemIndex].id;
    }

    if (!finalId) {
      setErrorMessage("Spec ID / URL / issue number is required.");
      setActiveField("id");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const provider = PROVIDERS[providerIndex];
      const specSourceConfig: SpecSourceConfig = {
        ...(config?.specSource ?? {}),
        provider,
      };

      const specSource = SpecSourceFactory.create(provider, specSourceConfig);
      const useCase =
        pullSpecUseCase ?? new PullSpecUseCase(appContainer.gw, specSource);

      const result: PullSpecResult = await useCase.execute({
        id: finalId,
        customName: customName.trim() || undefined,
        specSource,
      });

      if (result.kind === "not-initialized") {
        setErrorMessage(
          "Workspace not initialized (.codeforge/metadata.json not found).",
        );
        setIsLoading(false);
        return;
      }

      if (result.kind === "fetch-failed" || result.kind === "error") {
        setErrorMessage(result.error || "Failed to pull specification.");
        setIsLoading(false);
        return;
      }

      if (result.kind === "success") {
        setIsLoading(false);
        setTextInputActive?.(false);
        if (onSuccess) {
          onSuccess(result.filename, result.filePath);
        }
        handleClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setIsLoading(false);
    }
  }, [
    specId,
    isManualInput,
    items,
    selectedItemIndex,
    providerIndex,
    config,
    appContainer,
    pullSpecUseCase,
    customName,
    onSuccess,
    handleClose,
    setTextInputActive,
  ]);

  useInput(
    (input, key) => {
      if (isLoading) return;

      // 1. Escape: close
      if (key.escape || input === "\u001B") {
        handleClose();
        return;
      }

      // 2. Tab: switch between fields
      if (key.tab) {
        setErrorMessage(null);
        if (key.shift) {
          if (activeField === "name") setActiveField("id");
          else if (activeField === "id") setActiveField("provider");
          else setActiveField("name");
        } else {
          if (activeField === "provider") setActiveField("id");
          else if (activeField === "id") setActiveField("name");
          else setActiveField("provider");
        }
        return;
      }

      // 3. Enter
      if (key.return || input === "\r" || input === "\n") {
        if (activeField === "provider") {
          setActiveField("id");
          return;
        }
        if (activeField === "id") {
          const currentId =
            !isManualInput &&
            items.length > 0 &&
            selectedItemIndex < items.length
              ? items[selectedItemIndex].id
              : specId.trim();

          if (!currentId) {
            setErrorMessage("Spec ID is required.");
            return;
          }
        }
        void handleSubmit();
        return;
      }

      // 4. Provider selection navigation when focused on provider
      if (activeField === "provider") {
        if (key.leftArrow || key.upArrow) {
          setProviderIndex(
            (prev) => (prev - 1 + PROVIDERS.length) % PROVIDERS.length,
          );
          return;
        }
        if (key.rightArrow || key.downArrow || input === " ") {
          setProviderIndex((prev) => (prev + 1) % PROVIDERS.length);
          return;
        }
      }

      // 5. Spec ID / Issue selection handling
      if (activeField === "id") {
        // When items exist and user is navigating the items list
        if (items.length > 0 && !isManualInput) {
          if (key.upArrow || input === "k") {
            if (selectedItemIndex > 0) {
              const nextIdx = selectedItemIndex - 1;
              setSelectedItemIndex(nextIdx);
              setSpecId(items[nextIdx].id);
            } else {
              setActiveField("provider");
            }
            return;
          }

          if (key.downArrow || input === "j") {
            if (selectedItemIndex < items.length - 1) {
              const nextIdx = selectedItemIndex + 1;
              setSelectedItemIndex(nextIdx);
              setSpecId(items[nextIdx].id);
            } else if (selectedItemIndex === items.length - 1) {
              setSelectedItemIndex(items.length);
              setIsManualInput(true);
              setSpecId("");
            } else {
              setActiveField("name");
            }
            return;
          }

          if (input === "m" || input === "M") {
            setSelectedItemIndex(items.length);
            setIsManualInput(true);
            setSpecId("");
            return;
          }

          // If user starts typing printable text, switch to manual input and write
          if (!key.ctrl && !key.meta) {
            const printable = input
              .split("")
              .filter((ch) => {
                const code = ch.charCodeAt(0);
                return (code >= 32 && code !== 127) || code > 127;
              })
              .join("");

            if (printable.length > 0) {
              setSelectedItemIndex(items.length);
              setIsManualInput(true);
              setSpecId(printable);
              setErrorMessage(null);
            }
          }
          return;
        }

        // When in manual input mode (or no items exist)
        if (isManualInput || items.length === 0) {
          if (key.upArrow) {
            if (items.length > 0 && specId === "") {
              setIsManualInput(false);
              setSelectedItemIndex(items.length - 1);
              setSpecId(items[items.length - 1].id);
            } else {
              setActiveField("provider");
            }
            return;
          }

          if (key.downArrow) {
            setActiveField("name");
            return;
          }

          if (
            key.backspace ||
            key.delete ||
            input === "\x08" ||
            input === "\x7f"
          ) {
            setSpecId((prev) => prev.slice(0, -1));
            setErrorMessage(null);
            return;
          }

          if (key.ctrl && input === "u") {
            setSpecId("");
            setErrorMessage(null);
            return;
          }

          if (!key.ctrl && !key.meta) {
            const printable = input
              .split("")
              .filter((ch) => {
                const code = ch.charCodeAt(0);
                return (code >= 32 && code !== 127) || code > 127;
              })
              .join("");

            if (printable.length > 0) {
              setSpecId((prev) => prev + printable);
              setErrorMessage(null);
            }
          }
          return;
        }
      }

      // 6. Custom Name field
      if (activeField === "name") {
        if (key.upArrow) {
          setActiveField("id");
          return;
        }

        if (
          key.backspace ||
          key.delete ||
          input === "\x08" ||
          input === "\x7f"
        ) {
          setCustomName((prev) => prev.slice(0, -1));
          setErrorMessage(null);
          return;
        }

        if (key.ctrl && input === "u") {
          setCustomName("");
          setErrorMessage(null);
          return;
        }

        if (!key.ctrl && !key.meta) {
          const printable = input
            .split("")
            .filter((ch) => {
              const code = ch.charCodeAt(0);
              return (code >= 32 && code !== 127) || code > 127;
            })
            .join("");

          if (printable.length > 0) {
            setCustomName((prev) => prev + printable);
            setErrorMessage(null);
          }
        }
      }
    },
    { isActive: isOpen },
  );

  if (!isOpen) {
    return null;
  }

  const maxVisibleItems = 3;
  const visibleStartIndex =
    items.length <= maxVisibleItems
      ? 0
      : Math.min(
          Math.max(0, selectedItemIndex - 1),
          items.length - maxVisibleItems,
        );
  const visibleItems = items.slice(
    visibleStartIndex,
    visibleStartIndex + maxVisibleItems,
  );

  return (
    <Modal
      title="Pull Specification"
      isOpen={isOpen}
      onClose={handleClose}
      width={width}
      borderColor="blue"
    >
      <Box flexDirection="column" width="100%">
        {/* Provider Field */}
        <Box justifyContent="space-between" width="100%" marginBottom={0}>
          <Box gap={1} flexShrink={1}>
            <Text bold color={activeField === "provider" ? "cyan" : "white"}>
              1. Source Provider:
            </Text>
            <Box gap={1}>
              {PROVIDERS.map((p, idx) => {
                const isCurrent = idx === providerIndex;
                return (
                  <Text
                    key={p}
                    color={isCurrent ? "cyan" : "gray"}
                    bold={isCurrent}
                  >
                    {isCurrent ? `● [${p}]` : `○ ${p}`}
                  </Text>
                );
              })}
            </Box>
          </Box>
          {activeField === "provider" && <Text dimColor>[←/→] Select</Text>}
        </Box>

        {/* Spec ID Field / Options List */}
        <Box flexDirection="column" width="100%" marginBottom={0}>
          <Box justifyContent="space-between" width="100%">
            <Box gap={1} flexShrink={1}>
              <Text bold color={activeField === "id" ? "cyan" : "white"}>
                2. Spec ID / Issue Number / URL:
              </Text>
              {isFetchingItems && (
                <Text color="yellow">⏳ Querying {selectedProvider}...</Text>
              )}
            </Box>
            {activeField === "id" && items.length > 0 && !isManualInput && (
              <Text dimColor>[↑/↓] Select · [m] Manual</Text>
            )}
          </Box>

          {/* List of remote items if available */}
          {items.length > 0 && (
            <Box flexDirection="column" paddingLeft={1} marginY={0}>
              {visibleItems.map((item, idx) => {
                const itemGlobalIdx = visibleStartIndex + idx;
                const isSelected =
                  activeField === "id" &&
                  !isManualInput &&
                  selectedItemIndex === itemGlobalIdx;
                return (
                  <Box
                    key={item.id}
                    justifyContent="space-between"
                    width="100%"
                  >
                    <Box gap={1} flexShrink={1}>
                      <Text
                        color={isSelected ? "cyan" : "gray"}
                        bold={isSelected}
                      >
                        {isSelected ? "❯ ●" : "  ○"}
                      </Text>
                      <Text
                        bold={isSelected}
                        color={isSelected ? "cyan" : "white"}
                        wrap="truncate-end"
                      >
                        #{item.id} {item.title}
                      </Text>
                    </Box>
                    {item.status && (
                      <Text color={item.status === "open" ? "green" : "gray"}>
                        [{item.status}]
                      </Text>
                    )}
                  </Box>
                );
              })}

              {/* Manual input choice item */}
              <Box justifyContent="space-between" width="100%">
                <Box gap={1} flexShrink={1}>
                  <Text
                    color={
                      activeField === "id" && isManualInput ? "cyan" : "gray"
                    }
                    bold={activeField === "id" && isManualInput}
                  >
                    {activeField === "id" && isManualInput ? "❯ ●" : "  ○"}
                  </Text>
                  <Text
                    color={
                      activeField === "id" && isManualInput ? "cyan" : "gray"
                    }
                    bold={activeField === "id" && isManualInput}
                  >
                    [Manual ID / URL Input]
                  </Text>
                </Box>
                {items.length > maxVisibleItems && (
                  <Text dimColor>
                    ({selectedItemIndex + 1}/{items.length + 1})
                  </Text>
                )}
              </Box>
            </Box>
          )}

          {/* Manual text input box (shown if manual selected OR if no items found) */}
          {(isManualInput || items.length === 0) && (
            <Box gap={1} paddingLeft={1} marginTop={0}>
              <Text color="blue" bold>
                {"> "}
              </Text>
              {specId.length > 0 ? (
                <Text color="white" bold wrap="truncate-end">
                  {specId}
                  {activeField === "id" ? "█" : ""}
                </Text>
              ) : (
                <Box gap={1}>
                  {activeField === "id" && <Text color="cyan">█</Text>}
                  <Text dimColor wrap="truncate-end">
                    {selectedProvider === "github"
                      ? "e.g. 102 or https://github.com/owner/repo/issues/102"
                      : selectedProvider === "linear"
                        ? "e.g. ENG-123"
                        : selectedProvider === "clickup"
                          ? "e.g. 86789abc"
                          : "e.g. specs/feature.md"}
                  </Text>
                </Box>
              )}
            </Box>
          )}
        </Box>

        {/* Custom Name Field */}
        <Box justifyContent="space-between" width="100%" marginBottom={0}>
          <Box gap={1} flexShrink={1}>
            <Text bold color={activeField === "name" ? "cyan" : "white"}>
              3. Custom Filename (optional):
            </Text>
            <Text color="blue" bold>
              {"> "}
            </Text>
            {customName.length > 0 ? (
              <Text color="white" wrap="truncate-end">
                {customName}
                {activeField === "name" ? "█" : ""}
              </Text>
            ) : (
              <Box gap={1}>
                {activeField === "name" && <Text color="cyan">█</Text>}
                <Text dimColor wrap="truncate-end">
                  Leave empty to derive from title or ID
                </Text>
              </Box>
            )}
          </Box>
        </Box>

        {/* Error message */}
        {errorMessage && (
          <Box marginBottom={0}>
            <Text color="red" bold wrap="truncate-end">
              ✗ {errorMessage}
            </Text>
          </Box>
        )}

        {/* Loading state */}
        {isLoading && (
          <Box marginBottom={0}>
            <Text color="yellow">
              ⏳ Fetching specification from {selectedProvider}...
            </Text>
          </Box>
        )}

        {/* Footer shortcuts */}
        <Box
          marginTop={1}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          justifyContent="space-between"
          width="100%"
        >
          <Text dimColor>[Tab] Next field · [Enter] Pull</Text>
          <Text bold color="red">
            [Esc] Cancel / Voltar
          </Text>
        </Box>
      </Box>
    </Modal>
  );
};
