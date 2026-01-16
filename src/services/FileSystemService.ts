import * as fs from 'fs';
import * as path from 'path';
import {singleton} from 'tsyringe';

@singleton()
export class FileSystemService {
    public ensureDirectoryExists(dirPath: string): boolean {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, {recursive: true});
            return true;
        }
        return false;
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

    /**
     * Calculates the total size of a directory including subdirectories.
     * Uses parallel processing for better performance.
     */
    public async getDirectorySize(dirPath: string): Promise<number> {
        if (!fs.existsSync(dirPath)) return 0;
        
        const stats = await fs.promises.stat(dirPath);
        if (stats.isFile()) return stats.size;

        const files = await fs.promises.readdir(dirPath);
        const sizes = await Promise.all(
            files.map(async (file) => {
                const childPath = path.join(dirPath, file);
                try {
                    const childStats = await fs.promises.stat(childPath);
                    if (childStats.isDirectory()) {
                        return this.getDirectorySize(childPath);
                    }
                    return childStats.size;
                } catch (e) {
                    return 0; // Handle permission errors or deleted files
                }
            })
        );

        return sizes.reduce((acc, size) => acc + size, 0);
    }
}