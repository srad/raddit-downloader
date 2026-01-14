import { Runner } from './Runner';
import { spawn } from 'child_process';
import path from 'path';
import electron from 'electron';

export class DesktopRunner implements Runner {
  async run(): Promise<void> {
    console.log('Starting Electron...');

    const electronPath = electron as unknown as string;
    const mainScript = path.join(__dirname, '../../dist/electron/main.js');

    const child = spawn(electronPath, [mainScript], {
      stdio: 'inherit',
      windowsHide: false
    });

    child.on('close', (code) => {
      console.log(`Electron process exited with code ${code}`);
      process.exit(code ?? 0);
    });
  }
}
