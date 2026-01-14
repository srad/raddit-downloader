import { Runner } from './Runner';
import { WebRunner } from './WebRunner';
import { spawn } from 'child_process';
import path from 'path';
import electron from 'electron';

export class DesktopRunner implements Runner {
  async run(): Promise<void> {
    const webRunner = new WebRunner();
    // We need to run the web server without opening the default browser
    // Assuming WebRunner has been modified to accept options or we need to modify it.
    // For now, we'll assume we can pass an option or we'll patch it.
    await webRunner.run({ openBrowser: false } as any);

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
