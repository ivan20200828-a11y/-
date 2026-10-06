import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, type ComponentType } from 'react';

import { Loading, Screen } from '@/ui/kit';

import { useClient } from './deals';
import type { Deal } from './types';

/** Loads the client deal (e.g. after a page refresh on the web) before rendering a client screen. */
export function withClientDeal(Inner: ComponentType<{ deal: Deal }>) {
  return function ClientScreen() {
    // The bank sends the payer back to /client/cabinet?t=…; any step page may carry the token.
    const { t } = useLocalSearchParams<{ t?: string }>();
    const { deal, error, load, setToken } = useClient();
    useEffect(() => {
      if (t) setToken(t);
    }, [t, setToken]);
    useEffect(() => {
      if (!deal) load();
    }, [deal, load]);
    if (!deal || (t && deal.token !== t)) return <Screen><Loading error={error} onRetry={load} /></Screen>;
    // A cancelled deal only shows the notice on the invitation screen.
    if (deal.stage === 'cancelled') return <Redirect href="/client" />;
    return <Inner deal={deal} />;
  };
}
