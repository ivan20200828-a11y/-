import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TEST_MODE } from '@/api';
import type { Stage } from '@/state/types';

import { useColors } from './theme';

export function Screen({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const c = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: wide ? 900 : 480, alignSelf: 'center', gap: 14 }}>
          {TEST_MODE && <TestBanner />}
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TestBanner() {
  const c = useColors();
  return (
    <Text style={{ fontSize: 12, backgroundColor: c.warnSoft, color: c.warn, padding: 8, borderRadius: 8, overflow: 'hidden' }}>
      Тестовый режим: SMS, оплата и проверка личности имитируются, деньги не списываются. Код везде 1234.
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: 18, gap: 12 }, style]}>
      {children}
    </View>
  );
}

type TProps = { children: ReactNode; style?: TextStyle };
export function H1({ children, style }: TProps) {
  return <Txt style={[{ fontSize: 22, fontWeight: '700' }, style]}>{children}</Txt>;
}
export function H2({ children, style }: TProps) {
  return <Txt style={[{ fontSize: 17, fontWeight: '700' }, style]}>{children}</Txt>;
}
export function Txt({ children, style, selectable }: {
  children: ReactNode; style?: TextStyle | TextStyle[] | (TextStyle | undefined)[]; selectable?: boolean;
}) {
  const c = useColors();
  return <Text selectable={selectable} style={[{ color: c.fg, fontSize: 15, lineHeight: 22 }, style as TextStyle]}>{children}</Text>;
}
export function Hint({ children, style }: TProps) {
  const c = useColors();
  return <Txt style={[{ color: c.muted, fontSize: 13, lineHeight: 19 }, style]}>{children}</Txt>;
}
export function Label({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.muted, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase' }}>{children}</Text>;
}
export function Big({ children }: { children: ReactNode }) {
  return <Txt style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{children}</Txt>;
}

export function Button({ title, onPress, disabled, loading, ghost }: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean; ghost?: boolean;
}) {
  const c = useColors();
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => ({
        backgroundColor: ghost ? 'transparent' : c.accent,
        borderWidth: ghost ? 1 : 0, borderColor: c.line, borderRadius: 12,
        paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center',
        flexDirection: 'row', justifyContent: 'center', gap: 8,
        opacity: off ? 0.45 : pressed ? 0.85 : 1,
      })}>
      {loading && <ActivityIndicator color={ghost ? c.accent : c.accentFg} />}
      <Text style={{ color: ghost ? c.accent : c.accentFg, fontSize: 15, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, style, ...input }: TextInputProps & { label: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 4, flexGrow: 1, minWidth: 140 }}>
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        style={[{ color: c.fg, backgroundColor: c.sunk, borderColor: c.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 }, style]}
        {...input}
      />
    </View>
  );
}

export function CodeField(props: TextInputProps & { label: string }) {
  return (
    <Field keyboardType="number-pad" maxLength={4} placeholder="••••" autoComplete="one-time-code" textContentType="oneTimeCode"
      style={{ fontSize: 22, letterSpacing: 10, textAlign: 'center' }} {...props} />
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
}

type PillKind = 'ok' | 'wait' | 'warn' | 'acc' | 'bad';
export function Pill({ kind, children }: { kind: PillKind; children: ReactNode }) {
  const c = useColors();
  const map = { ok: [c.okSoft, c.ok], wait: [c.sunk, c.muted], warn: [c.warnSoft, c.warn], acc: [c.accentSoft, c.accent], bad: [c.sealSoft, c.seal] } as const;
  const [bg, fg] = map[kind];
  return (
    <Text style={{ alignSelf: 'flex-start', backgroundColor: bg, color: fg, fontSize: 12, fontWeight: '600', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' }}>
      {children}
    </Text>
  );
}

/** A checkbox with its label; the whole row is the tap target. */
export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: checked ? c.accent : c.line,
        backgroundColor: checked ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {checked && <Text style={{ color: c.accentFg, fontSize: 13, fontWeight: '700' }}>✓</Text>}
      </View>
      <Text style={{ color: c.fg, fontSize: 15, flex: 1 }}>{children}</Text>
    </Pressable>
  );
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ color: c.muted, fontSize: 15, flexShrink: 1 }}>{k}</Text>
          <Text style={{ color: c.fg, fontSize: 15, fontWeight: '600', textAlign: 'right', flexShrink: 1, fontVariant: ['tabular-nums'] }}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

export function Progress({ value }: { value: number }) {
  const c = useColors();
  return (
    <View style={{ height: 8, backgroundColor: c.sunk, borderColor: c.line, borderWidth: 1, borderRadius: 4, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, height: '100%', backgroundColor: c.accent }} />
    </View>
  );
}

export function Stamp({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <Text style={{ alignSelf: 'flex-start', borderWidth: 2, borderColor: c.seal, color: c.seal, backgroundColor: c.sealSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: '600', transform: [{ rotate: '-2deg' }], overflow: 'hidden' }}>
      {children}
    </Text>
  );
}

export function Tabs<K extends string>({ items, value, onChange }: { items: [K, string][]; value: K; onChange: (k: K) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="tablist">
      {items.map(([k, t]) => {
        const on = k === value;
        return (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(k)}
            style={{ borderWidth: 1, borderColor: on ? c.fg : c.line, backgroundColor: on ? c.fg : c.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Text style={{ color: on ? c.bg : c.muted, fontWeight: '600', fontSize: 13 }}>{t}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const STEPS: [Stage, string][] = [['phone', 'Проверка'], ['documents', 'Документы'], ['contract', 'Договор'], ['sign', 'Подпись'], ['pay', 'Взнос']];
export function Stepper({ current }: { current: Stage }) {
  const c = useColors();
  const idx = STEPS.findIndex(([s]) => s === current);
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`Этап ${idx + 1} из ${STEPS.length}`}>
      {STEPS.map(([s, t], i) => (
        <View key={s} style={{ flex: 1, gap: 5 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= idx ? c.accent : c.line, opacity: i === idx ? 0.5 : 1 }} />
          <Text numberOfLines={1} style={{ fontSize: 11, color: i === idx ? c.fg : c.muted, fontWeight: i === idx ? '600' : '400' }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export const tableStyles = StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: 8 },
});

export function ErrorText({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text accessibilityRole="alert" style={{ color: c.seal, fontSize: 13 }}>{children}</Text>;
}

export function Loading({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  const c = useColors();
  return (
    <Card style={{ alignItems: 'center' }}>
      {error ? (
        <>
          <Text style={{ color: c.seal, fontSize: 15, textAlign: 'center' }}>{error}</Text>
          {onRetry && <Button ghost title="Повторить" onPress={onRetry} />}
        </>
      ) : (
        <ActivityIndicator color={c.accent} />
      )}
    </Card>
  );
}
