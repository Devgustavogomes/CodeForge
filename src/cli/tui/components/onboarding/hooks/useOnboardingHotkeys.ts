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

      if (isEscape || input.toLowerCase() === 'b') {
        onBack();
        return;
      }

      // Passos seguintes gerenciam Enter/confirmação internamente através de seus próprios componentes
      if (
        currentStep === 'spec_source' ||
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
