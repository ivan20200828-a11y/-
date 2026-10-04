import { useEffect, type ComponentType } from 'react';

import { Loading, Screen } from '@/ui/kit';

import { useClient } from './deals';
import type { Deal } from './types';

/** Loads the client deal (e.g. after a page refresh on the web) before rendering a client screen. */
export function withClientDeal(Inner: ComponentType<{ deal: Deal }>) {
  return function ClientScreen() {
    const { deal, error, load } = useClient();
    useEffect(() => {
      if (!deal) load();
    }, [deal, load]);
    if (!deal) return <Screen><Loading error={error} onRetry={load} /></Screen>;
    return <Inner deal={deal} />;
  };
}
