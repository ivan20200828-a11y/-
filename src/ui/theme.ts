import { useColorScheme } from 'react-native';

const light = {
  bg: '#eef1ef', surface: '#ffffff', sunk: '#f4f6f4', fg: '#16211d', muted: '#5d6b65', line: '#d8dfdb',
  accent: '#0f6b5a', accentFg: '#ffffff', accentSoft: '#dcefe9',
  seal: '#b4322a', sealSoft: '#f7e3e1', ok: '#1d7a43', okSoft: '#dff2e6', warn: '#9a6400', warnSoft: '#fbefd6',
};
const dark: typeof light = {
  bg: '#0f1513', surface: '#18211e', sunk: '#131a18', fg: '#e6ece9', muted: '#9aa8a2', line: '#2b3632',
  accent: '#4cc3a6', accentFg: '#06221b', accentSoft: '#173a32',
  seal: '#ef7d72', sealSoft: '#3a1d1a', ok: '#5fd08d', okSoft: '#173326', warn: '#e8b45a', warnSoft: '#3a2d12',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
