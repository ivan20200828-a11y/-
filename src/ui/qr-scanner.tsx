import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ErrorText, Hint } from '@/ui/kit';

/** Camera that reads one QR code with a server address (http://… or https://…) and hands it over. */
export function QrScanner({ onAddress, onClose }: { onAddress: (url: string) => void; onClose: () => void }) {
  const [permission, ask] = useCameraPermissions();
  // The camera reports the same code many times a second: take the first one only.
  const done = useRef(false);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View style={styles.box}>
        <Hint>Камера нужна, чтобы прочитать QR-код с адресом сервера.</Hint>
        {permission.canAskAgain
          ? <Button title="Разрешить камеру" onPress={ask} />
          : <ErrorText>Доступ к камере запрещён. Разрешите его в настройках телефона или впишите адрес вручную.</ErrorText>}
        <Button ghost title="Отмена" onPress={onClose} />
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <Hint>Наведите камеру на QR-код в окне сервера или на странице «Подключить телефон».</Hint>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (done.current || !/^https?:\/\/\S+$/.test(data.trim())) return;
          done.current = true;
          onAddress(data.trim());
        }}
      />
      <Button ghost title="Отмена" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  camera: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
});
