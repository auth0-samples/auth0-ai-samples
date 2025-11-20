import { TokenVaultInterrupt } from "@auth0/ai/interrupts";
import type { Interrupt } from "@langchain/langgraph-sdk";

import { TokenVaultConsent } from "@/components/auth0-ai/TokenVault";
import type { TokenVaultAuthProps } from "./auth0-ai/TokenVault/TokenVaultAuthProps";

export interface TokenVaultInterruptHandlerProps {
  interrupt: Interrupt | undefined | null;
  onFinish: () => void;
  auth?: TokenVaultAuthProps['auth'];
}

export function TokenVaultInterruptHandler({
  interrupt,
  onFinish,
  auth,
}: TokenVaultInterruptHandlerProps) {
  if (!interrupt) {
    return null;
  }

  if (!TokenVaultInterrupt.isInterrupt(interrupt.value)) {
    return null;
  }

  return (
    <div key={interrupt.ns?.join("")} className="whitespace-pre-wrap">
      <TokenVaultConsent
        mode="popup"
        interrupt={interrupt.value}
        onFinish={onFinish}
        auth={auth}
        connectWidget={{
          title: "Authorization Required.",
          description: interrupt.value.message,
          action: { label: "Authorize" },
        }}
      />
    </div>
  );
}
