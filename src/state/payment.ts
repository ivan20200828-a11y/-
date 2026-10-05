import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { clientApi, type Payment } from '@/api';
import { useClient } from '@/state/deals';
import type { PayMethod } from '@/state/types';

const POLL_MS = 3000;

/**
 * Pays through the server. In test mode the payment is confirmed at once. With a real acquirer the bank page
 * or the SBP link opens, and the screen waits until the bank confirms the payment.
 */
export function usePayment(onPaid: () => void) {
  const { token, setDeal } = useClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState<Payment | null>(null);
  const paidRef = useRef(onPaid);
  paidRef.current = onPaid;

  const settle = (p: Payment) => {
    if (p.status === 'paid') {
      setWaiting(null);
      paidRef.current();
    } else if (p.status === 'failed') {
      setWaiting(null);
      setError('Платёж не прошёл. Попробуйте ещё раз или выберите другой способ.');
    }
  };

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      try {
        const r = await clientApi.payment(token, waiting.id);
        setDeal(r.deal);
        settle(r.payment);
      } catch {
        // Keep waiting: the connection may be back on the next check.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting?.id, token]);

  const open = (p: Payment) => p.url && Linking.openURL(p.url).catch(() => {});

  const start = async (what: 'down' | 'next', method: PayMethod) => {
    setBusy(true);
    setError('');
    try {
      const r = await clientApi.pay(token, what, method);
      setDeal(r.deal);
      if (r.payment.status === 'pending') {
        setWaiting(r.payment);
        open(r.payment);
      } else settle(r.payment);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return { start, busy, error, waiting, reopen: () => waiting && open(waiting), cancel: () => setWaiting(null) };
}
