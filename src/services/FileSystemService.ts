import * as fs from 'fs';
import * as path from 'path';
import { singleton } from 'tsyringe';

@singleton()
export class FileSystemService {
  public ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  public fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  public async writeFile(filePath: string, content: string | Buffer): Promise<void> {
    const dir = path.dirname(filePath);
    this.ensureDirectoryExists(dir);
    await fs.promises.writeFile(filePath, content);
  }

  public createWriteStream(filePath: string): fs.WriteStream {
    const dir = path.dirname(filePath);
    this.ensureDirectoryExists(dir);
    return fs.createWriteStream(filePath);
  }

  public async deleteFile(filePath: string): Promise<void> {
    if (this.fileExists(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  public readFileSync(filePath: string, encoding: BufferEncoding = 'utf8'): string {
    return fs.readFileSync(filePath, encoding);
  }
}