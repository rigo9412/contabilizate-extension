import { useCallback, useEffect, useState } from "react";
import { vaultStatus } from "./vault";

export function useVaultStatus() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof vaultStatus>>>("locked");
  const refresh = useCallback(() => {
    vaultStatus().then(setStatus);
  }, []);
  useEffect(() => {
    refresh();
    chrome.storage.onChanged.addListener(refresh);
    return () => chrome.storage.onChanged.removeListener(refresh);
  }, [refresh]);
  return status;
}
