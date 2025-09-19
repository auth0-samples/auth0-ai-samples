import { FederatedConnectionInterrupt } from "@auth0/ai/interrupts";

import { FederatedConnectionPopup } from "./FederatedConnectionPopup";

/**
 * General Auth0 interrupt handler component.
 * This component determines the type of Auth0 interrupt and renders
 * the appropriate UI component to handle it.
 */

interface Auth0InterruptHandlerProps {
  // Auth0 interrupt object. This can be of various types like FederatedConnectionInterrupt, CIBAInterrupt, etc.
  interrupt: any;
  onResume?: () => void;
}

export function Auth0InterruptHandler({
  interrupt,
  onResume,
}: Auth0InterruptHandlerProps) {
  // Handle FederatedConnectionInterrupt
  if (FederatedConnectionInterrupt.isInterrupt(interrupt)) {
    return (
      <FederatedConnectionPopup
        interrupt={interrupt as FederatedConnectionInterrupt}
        onResume={onResume}
      />
    );
  }

  // Handle other Auth0 interrupt types here in the future
  // For example: CIBAInterrupt, DeviceInterrupt, etc.

  // If we don't recognize the interrupt type, don't render anything
  return null;
}
