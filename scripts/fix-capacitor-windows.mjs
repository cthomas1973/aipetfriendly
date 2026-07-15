import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const androidRoot = join(root, 'android');
const viteDepsRoot = join(root, 'node_modules', '.vite', 'deps');
const targets = [
  androidRoot,
  join(root, 'android', 'app', 'src', 'main', 'assets', 'public'),
  join(root, 'android', 'capacitor-cordova-android-plugins'),
  join(root, 'android', 'capacitor-cordova-android-plugins', 'src', 'main', 'java'),
  join(root, 'android', 'capacitor-cordova-android-plugins', 'src', 'main', 'res'),
  join(root, 'android', 'capacitor-cordova-android-plugins', 'build', 'outputs', 'logs'),
];

function clearReadonly(path) {
  if (!existsSync(path)) return;

  if (process.platform === 'win32') {
    execSync(`attrib -R "${path}" /S /D`, { stdio: 'inherit' });
  }
}

function grantWindowsPermissions(path) {
  if (!existsSync(path) || process.platform !== 'win32') return;

  const account = process.env.USERDOMAIN && process.env.USERNAME
    ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
    : process.env.USERNAME;

  if (!account) return;

  execSync(`icacls "${path}" /grant "${account}:(OI)(CI)F" /T /C`, { stdio: 'inherit' });
}

function safeRemove(path) {
  if (!existsSync(path)) return;
  rmSync(path, { recursive: true, force: true });
}

for (const target of targets) {
  try {
    clearReadonly(target);
    grantWindowsPermissions(target);
  } catch (error) {
    console.warn(`[fix-capacitor-windows] No se pudo preparar permisos/atributos en ${target}:`, error instanceof Error ? error.message : String(error));
  }
}

for (const generatedDir of [
  viteDepsRoot,
  join(root, 'android', 'app', 'src', 'main', 'assets', 'public'),
  join(root, 'android', 'capacitor-cordova-android-plugins'),
]) {
  try {
    clearReadonly(generatedDir);
    grantWindowsPermissions(generatedDir);
    safeRemove(generatedDir);
  } catch (error) {
    console.warn(`[fix-capacitor-windows] No se pudo limpiar/eliminar ${generatedDir}:`, error instanceof Error ? error.message : String(error));
  }
}

console.log('[fix-capacitor-windows] Permisos, atributos y caches temporales preparados para vite/cap sync en Windows.');
