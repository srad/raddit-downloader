import 'reflect-metadata';
import path from 'path';
import fs from 'fs';
// Mock open module to avoid ESM issues
jest.mock('open', () => {
    return jest.fn();
});

import { WebRunner } from '../src/runners/WebRunner';
import { container } from 'tsyringe';
import { DatabaseService } from '../src/services/DatabaseService';
import { ConfigService } from '../src/services/ConfigService';

// Set DATA_DIR to a temp location
process.env.DATA_DIR = path.join(__dirname, 'temp_test_data');

// Mock ConfigService
jest.mock('../src/services/ConfigService', () => ({
    ConfigService: {
        load: jest.fn().mockReturnValue({}),
        ensurePostListFile: jest.fn(),
    }
}));

// Mock DatabaseService
const mockDbService = {
    getSubredditHistory: jest.fn().mockResolvedValue([]),
};

describe('WebRunner Port Selection', () => {
    let runner: WebRunner;
    const tempDir = process.env.DATA_DIR!;

    beforeAll(() => {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
    });

    afterAll(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    beforeEach(() => {
        container.clearInstances();
        // Register mock DB service
        container.register(DatabaseService, { useValue: mockDbService as any });
        runner = new WebRunner();
    });

    afterEach(async () => {
        // Stop server
        const server = (runner as any).server;
        if (server && server.listening) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    it('should use default port 3000 if no port specified', async () => {
        await runner.run({ openBrowser: false });
        expect(runner.getPort()).toBe(3000);
    });

    it('should use specified port if provided', async () => {
        const testPort = 3456;
        await runner.run({ openBrowser: false, port: testPort });
        expect(runner.getPort()).toBe(testPort);
    });

    it('should assign a dynamic port when port 0 is passed', async () => {
        await runner.run({ openBrowser: false, port: 0 });
        const port = runner.getPort();
        expect(port).toBeGreaterThan(0);
        expect(port).not.toBe(3000); 
    });

    it('should be an EventEmitter', () => {
        expect(runner instanceof require('events').EventEmitter).toBe(true);
    });

    it('should return correct status', () => {
        expect(runner.getStatus()).toBe(false);
    });
});
