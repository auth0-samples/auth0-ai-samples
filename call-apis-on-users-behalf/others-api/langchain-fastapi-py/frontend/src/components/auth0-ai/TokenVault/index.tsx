import { BrowserView, MobileView } from "react-device-detect";

import type { TokenVaultAuthProps } from "./TokenVaultAuthProps";
import { TokenVaultConsentPopup } from "./popup";
import { EnsureAPIAccessRedirect } from "./redirect";

export function TokenVaultConsent(props: TokenVaultAuthProps) {
  const { mode } = props;

  switch (mode) {
    case "popup":
      return <TokenVaultConsentPopup {...props} />;
    case "redirect":
      return <EnsureAPIAccessRedirect {...props} />;
    case "auto":
    default:
      return (
        <>
          <BrowserView>
            <TokenVaultConsentPopup {...props} />
          </BrowserView>
          <MobileView>
            <EnsureAPIAccessRedirect {...props} />
          </MobileView>
        </>
      );
  }
}
