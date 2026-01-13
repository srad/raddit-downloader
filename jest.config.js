/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/__tests__/**/*.test.ts'],
	collectCoverageFrom: ['src/lib/**/*.ts', 'src/index.ts'],
	coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/'],
	verbose: true,
	testTimeout: 60000,

	projects: [
		{
			displayName: 'unit',
			preset: 'ts-jest',
			testMatch: ['**/__tests__/utils.test.ts'],
			testEnvironment: 'node',
		},
		{
			displayName: 'e2e',
			preset: 'ts-jest',
			testMatch: ['**/__tests__/e2e.test.ts'],
			testEnvironment: 'node',
		},
	],
};

