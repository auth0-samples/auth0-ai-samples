import { TokenVaultInterrupt } from '@auth0/ai/interrupts';
import type { Auth0InterruptionUI } from '@auth0/ai-vercel/react';

import { TokenVaultConsent } from '@/components/auth0-ai/token-vault/token-vault-consent';

interface TokenVaultInterruptHandlerProps {
  interrupt: Auth0InterruptionUI | null;
}

export function TokenVaultInterruptHandler({ interrupt }: TokenVaultInterruptHandlerProps) {
  if (!TokenVaultInterrupt.isInterrupt(interrupt)) {
    return null;
  }

  return (
    <div key={interrupt.name} className="whitespace-pre-wrap">
      <TokenVaultConsent
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
