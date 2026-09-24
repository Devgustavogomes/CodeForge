import { useContext } from 'react';
import { useInput } from 'ink';
import { NavigationContext } from '../../../context/NavigationContext.js';
import { OnboardingStep } from './useOnboardingWizard.js';

export interface UseOnboardingHotkeysProps {
  currentStep: OnboardingStep;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
  isInteractive?: boolean;
  isFormActive?: boolean;
  isOperationActive?: boolean;
}

/**
 * Global keyboard shortcuts hook for the onboarding wizard.
 * Handles Back ([b] / [Esc]), Continue ([Enter]), and Quit ([q] / [Esc]) keys.
 * Ensures shortcuts are blocked when form inputs or asynchronous operations are active.
 */
export function useOnboardingHotkeys({
  currentStep,
  onNext,
  onBack,
  onExit,
  isInteractive = true,
  isFormActive = false,
  isOperationActive = false,
}: UseOnboardingHotkeysProps): void {
  const navigation = useContext(NavigationContext);
  const isBlocked = isFormActive || isOperationActive || Boolean(navigation?.isTextInputActive);

  useInput(
    (input, key) => {
      if (!isInteractive || isBlocked) return;

      const isEscape = key.escape;
      const isEnter = key.return || input === '\r' || input === '\n';

      if (currentStep === 'welcome') {
        if (input.toLowerCase() === 'q' || isEscape) {
          onExit();
          return;
        }

        if (isEnter) onNext();
        return;
      }

      // Quit shortcut for subsequent wizard steps
      if (input.toLowerCase() === 'q') {
        onExit();
        return;
      }

      // Back shortcut to return to the previous step
      if (isEscape || input.toLowerCase() === 'b') {
        onBack();
        return;
      }

      // Subsequent steps manage Enter / confirmation internally via their own components
      if (
        currentStep === 'intent_source' ||
        currentStep === 'environment' ||
        currentStep === 'agents' ||
        currentStep === 'cli_install' ||
        currentStep === 'hooks' ||
        currentStep === 'summary'
      ) {
        return;
      }

      if (isEnter) onNext();
    },
    { isActive: isInteractive && !isBlocked },
  );
}

export default useOnboardingHotkeys;
