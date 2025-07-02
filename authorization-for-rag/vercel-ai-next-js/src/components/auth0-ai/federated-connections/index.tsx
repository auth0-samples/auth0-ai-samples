import { FederatedConnectionInterrupt } from '@auth0/ai/interrupts';
import type { Auth0InterruptionUI } from '@auth0/ai-vercel/react';

import { EnsureAPIAccess } from '@/components/auth0-ai/federated-connections/ensure-api-access';

interface FederatedConnectionInterruptHandlerProps {
  interrupt: Auth0InterruptionUI | null;
}

export function FederatedConnectionInterruptHandler({ interrupt }: FederatedConnectionInterruptHandlerProps) {
  if (!FederatedConnectionInterrupt.isInterrupt(interrupt)) {
    return null;
  }

  return (
    <div key={interrupt.name} className="whitespace-pre-wrap">
      <EnsureAPIAccess
        mode="popup"
        interrupt={interrupt}
        connectWidget={{
          title: 'Authorization Required.',
          description: interrupt.message,
          action: { label: 'Authorize' },
        }}
      />
    </div>
  );
}
