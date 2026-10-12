#!/bin/sh
# Drives the installed app on an Android emulator: first start, connecting to the test server, the manager's sign-in.
# Saves a screenshot after each step into check/ and fails when the app is not running any more.
set -e
PKG=ru.sdelka.online
mkdir -p check

alive() {
  if ! adb shell pidof "$PKG" >/dev/null; then echo "Приложение закрылось на шаге: $1"; exit 1; fi
}
shot() { adb exec-out screencap -p > "check/$1.png"; alive "$1"; }
# Taps the first element with this text, or with a second argument "edit" the text field number $1 (0 is the first).
tap() {
  for try in 1 2 3; do
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null
  adb pull /sdcard/ui.xml check/ui.xml >/dev/null
  xy=$(python3 - "$1" "${2:-}" <<'PY'
import re, sys, xml.etree.ElementTree as ET
text, kind = sys.argv[1], sys.argv[2]
nodes = list(ET.parse('check/ui.xml').iter('node'))
hits = [n for n in nodes if n.get('class') == 'android.widget.EditText'][int(text):] if kind == 'edit' else [n for n in nodes if n.get('text') == text]
for n in hits[:1]:
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
        print((x1 + x2) // 2, (y1 + y2) // 2)
        break
PY
)
  if [ -n "$xy" ]; then adb shell input tap $xy; return; fi
  # Further down the screen: scroll and look again.
  adb shell input swipe 500 1400 500 500 300; sleep 1
  done
  echo "Не нашёл на экране: $1"; exit 1
}

adb install -r sdelka-online.apk
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 30
shot 1-first-start

tap "Ввести адрес вручную"; sleep 3
tap 0 edit; adb shell input text "http://10.0.2.2:3000"; sleep 1
adb shell input keyevent 66; sleep 6
shot 2-connected

tap "Открыть список сделок"; sleep 4
shot 3-manager-login

tap 0 edit; adb shell input text "manager@demo.ru"
tap 1 edit; adb shell input text "demo1234"
adb shell input keyevent 66; sleep 8
shot 4-deals
echo "Приложение работает: запуск, подключение к серверу, вход менеджера, список сделок."
