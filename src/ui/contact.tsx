import { Linking, Pressable, Text, View } from 'react-native';

import type { Deal } from '@/state/types';

import { useColors } from './theme';

/** The company's phone and email at the bottom of the client's screens, for questions about the deal. */
export function ContactManager({ deal }: { deal: Deal }) {
  const c = useColors();
  const { phone, email } = deal.sellerDetails ?? {};
  if (!phone && !email) return null;
  const link = (title: string, url: string) => (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url).catch(() => {})}>
      <Text style={{ color: c.accent, fontSize: 14, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
  return (
    <View style={{ alignItems: 'center', gap: 4, paddingTop: 4 }}>
      <Text style={{ color: c.muted, fontSize: 13 }}>Вопросы по сделке: {deal.seller}</Text>
      <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        {phone && link(phone, `tel:${phone.replace(/[^\d+]/g, '')}`)}
        {email && link(email, `mailto:${email}`)}
      </View>
    </View>
  );
}
