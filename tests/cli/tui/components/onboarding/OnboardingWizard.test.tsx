import React from "react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingWizard } from "../../../../../src/cli/tui/components/onboarding/OnboardingWizard.js";
import {
  createMockContainer,
  flushAsync,
  renderWithProviders,
} from "../../helpers/renderWithProviders.js";

describe("OnboardingWizard - Hotkeys and Form Focus", () => {
  it("triggers onExit when [q] is pressed on steps 2 to 7", async () => {
    const container = createMockContainer();
    const onExit = vi.fn();
    const { stdin, unmount } = renderWithProviders(
      <OnboardingWizard
        container={container}
        initialState={{ currentStep: "intent_source" }}
        onComplete={() => {}}
        onExit={onExit}
      />,
      { container },
    );

    stdin.write("q");
    await flushAsync();
    expect(onExit).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("blocks [q] and [b] hotkeys when a form is active", async () => {
    const container = createMockContainer();
    const onExit = vi.fn();
    const { lastFrame, stdin, unmount } = renderWithProviders(
      <OnboardingWizard
        container={container}
        initialState={{ currentStep: "intent_source" }}
        onComplete={() => {}}
        onExit={onExit}
      />,
      { container },
    );

    // Open remote connection form in IntentSourceStep by selecting GitHub (option 2)
    stdin.write("2");
    await flushAsync();
    stdin.write("\r");
    await flushAsync();

    expect(lastFrame() ?? "").toContain("GitHub — configure connection");

    // Pressing 'q' or 'b' while form is active should NOT trigger exit or back
    stdin.write("q");
    await flushAsync();
    stdin.write("b");
    await flushAsync();

    expect(onExit).not.toHaveBeenCalled();
    unmount();
  });
});
