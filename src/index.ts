/**
 * Reddit Post Downloader - Main Entry Point
 */

import 'reflect-metadata';
import { CliRunner } from './runners/CliRunner';
import { WebRunner } from './runners/WebRunner';

async function main() {
  const args = process.argv.slice(2);
  const isCli = args.includes('--cli');

  if (isCli) {
    const cli = new CliRunner();
    await cli.run();
  } else {
    const web = new WebRunner();
    await web.run();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});