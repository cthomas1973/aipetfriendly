import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const androidRoot = join(root, 'android');
const targets = [
  androidRoot,
  join(root, 'android', 'app', 'src', 'main', 'assets', 'public'),
  join(root, 'android', 'capacitor-cordova-android-plugins'),
  join(root, 'android', 'capacitor-cordova-android-plugins', 'src', 'main', 'java'),
  join(root, 'android', 'capacitor-cordova-android-plugins', 'src', 'main', 'res'),
];

function clearReadonly(path) {
  if (!existsSync(path)) return;

  if (process.platform === 'win32') {
    execSync(`attrib -R "${path}" /S /D`, { stdio: 'inherit' });
  }
}

function safeRemove(path) {
  if (!existsSync(path)) return;
  rmSync(path, { recursive: true, force: true });
}

for (const target of targets) {
  try {
    clearReadonly(target);
  } catch (error) {
    console.warn(`[fix-capacitor-windows] No se pudo limpiar atributos en ${target}:`, error instanceof Error ? error.message : String(error));
  }
}

for (const generatedDir of [
  join(root, 'android', 'app', 'src', 'main', 'assets', 'public'),
  join(root, 'android', 'capacitor-cordova-android-plugins'),
]) {
  try {
    clearReadonly(generatedDir);
    safeRemove(generatedDir);
  } catch (error) {
    console.warn(`[fix-capacitor-windows] No se pudo limpiar/eliminar ${generatedDir}:`, error instanceof Error ? error.message : String(error));
  }
}

console.log('[fix-capacitor-windows] Atributos ReadOnly limpiados y carpetas generadas preparadas para cap sync.');
