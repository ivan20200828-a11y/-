import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

import { clientApi } from '@/api';
import { withClientDeal } from '@/state/client-gate';
import { useClient } from '@/state/deals';
import type { Passport } from '@/state/types';
import { Button, Card, ErrorText, Field, H2, Hint, Pill, Row, Screen, Stepper } from '@/ui/kit';
import { ContactManager } from '@/ui/contact';
import { useColors } from '@/ui/theme';

const FIELDS: [keyof Passport, string][] = [
  ['fio', 'ФИО'], ['birth', 'Дата рождения'], ['series', 'Серия и номер'],
  ['issued', 'Кем выдан'], ['issuedAt', 'Дата выдачи'], ['address', 'Адрес регистрации'],
];

/** A photo as a local URI plus its base64 for upload, or 'sample' when the client skipped photos in the demo. */
type Shot = { uri: string; base64?: string } | 'sample' | null;

export default withClientDeal(function Documents({ deal }) {
  const { token, step, setDeal } = useClient();
  const [passportShot, setPassportShot] = useState<Shot>(null);
  const [selfieShot, setSelfieShot] = useState<Shot>(null);
  const [data, setData] = useState<Passport | null>(deal.passport ?? null);
  const [match, setMatch] = useState<number | null>(deal.faceMatch ?? null);
  const [busy, setBusy] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [error, setError] = useState('');

  const recognize = async (p: Shot, s: Shot) => {
    setRecognizing(true);
    try {
      const r = await clientApi.kyc(token!, {
        passportImage: p && p !== 'sample' ? p.base64 : undefined,
        selfieImage: s && s !== 'sample' ? s.base64 : undefined,
      });
      setDeal(r.deal);
      setData(r.passport);
      setMatch(r.faceMatch);
    } catch (e) {
      setError((e as Error).message);
    }
    setRecognizing(false);
  };

  const take = async (which: 'passport' | 'selfie') => {
    setError('');
    const useCamera = Platform.OS !== 'web';
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setError('Нет доступа к камере. Разрешите его в настройках телефона.');
    }
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'], quality: 0.6, base64: true,
      cameraType: which === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    };
    let res: ImagePicker.ImagePickerResult;
    try {
      res = useCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    } catch {
      return setError(useCamera ? 'Не получилось открыть камеру. Попробуйте ещё раз или перезапустите приложение.' : 'Не получилось открыть выбор фото. Попробуйте ещё раз.');
    }
    if (res.canceled) return;
    const shot = { uri: res.assets[0].uri, base64: res.assets[0].base64 ?? undefined };
    const p = which === 'passport' ? shot : passportShot;
    const s = which === 'selfie' ? shot : selfieShot;
    which === 'passport' ? setPassportShot(shot) : setSelfieShot(shot);
    if (p && s) recognize(p, s);
  };

  const useSample = () => {
    const p = passportShot ?? 'sample';
    const s = selfieShot ?? 'sample';
    setPassportShot(p);
    setSelfieShot(s);
    recognize(p, s);
  };

  const confirm = async () => {
    setBusy(true);
    const err = await step('passport', { passport: data });
    setBusy(false);
    if (err) return setError(err);
    router.push('/client/contract');
  };

  return (
    <Screen>
      <Stepper current="documents" />
      <Card>
        <H2>Паспорт и селфи</H2>
        <Hint>Сфотографируйте разворот паспорта с фото и сделайте селфи. Данные заполнятся сами.</Hint>
        <ShotButton title="Разворот паспорта" shot={passportShot} onPress={() => take('passport')} />
        <ShotButton title="Селфи с паспортом" shot={selfieShot} onPress={() => take('selfie')} />
        {!data && <Button ghost title="Заполнить примером без фото" onPress={useSample} disabled={recognizing} />}
        {!!error && <ErrorText>{error}</ErrorText>}
        {recognizing && (
          <Row>
            <ActivityIndicator />
            <Hint>Распознаём документ и сверяем лицо…</Hint>
          </Row>
        )}
        {data && !recognizing && (
          <>
            <Row>
              <Pill kind="ok">Лицо совпадает: {match}%</Pill>
              <Pill kind="acc">Паспорт распознан</Pill>
            </Row>
            <Hint>Проверьте данные и исправьте, если что-то распознано неверно.</Hint>
            {FIELDS.map(([k, label]) => (
              <Field key={k} label={label} value={data[k]} onChangeText={(t) => setData({ ...data, [k]: t })} />
            ))}
          </>
        )}
        <Button title="Данные верны, к договору" onPress={confirm} loading={busy} disabled={!data || recognizing || FIELDS.some(([k]) => !data[k].trim())} />
      </Card>
      <ContactManager deal={deal} />
    </Screen>
  );
});

function ShotButton({ title, shot, onPress }: { title: string; shot: Shot; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1.5,
        borderStyle: shot ? 'solid' : 'dashed', borderColor: shot ? c.accent : c.line, backgroundColor: shot ? c.accentSoft : c.sunk }}>
      <View style={{ width: 64, height: 48, borderRadius: 8, backgroundColor: c.line, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {shot && shot !== 'sample' ? <Image source={{ uri: shot.uri }} style={{ width: 64, height: 48 }} contentFit="cover" />
          : <Text style={{ color: c.muted, fontSize: 18 }}>{shot ? '✓' : '+'}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.fg, fontWeight: '600', fontSize: 15 }}>{title}</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>{shot ? 'Загружено, нажмите, чтобы переснять' : 'Нажмите, чтобы сфотографировать'}</Text>
      </View>
    </Pressable>
  );
}
