/**
 * Reddit Post Downloader - Main Entry Point
 */

import 'reflect-metadata';
import { CliRunner } from './runners/CliRunner';
import { WebRunner } from './runners/WebRunner';
import { DesktopRunner } from './runners/DesktopRunner';

async function main() {
  const args = process.argv.slice(2);
  const isCli = args.includes('--cli');
  const isDesktop = args.includes('--desktop');

  if (isCli) {
    const cli = new CliRunner();
    await cli.run();
  } else if (isDesktop) {
    const desktop = new DesktopRunner();
    await desktop.run();
  } else {
    const web = new WebRunner();
    await web.run();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});