#!/usr/bin/env node
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const steps = [
    { name: 'typecheck', cmd: 'pnpm run typecheck', cwd: path.resolve(__dirname, '../frontend') },
    { name: 'knip', cmd: 'pnpm run knip', cwd: path.resolve(__dirname, '../frontend') },
    { name: 'lint:fix', cmd: 'pnpm run lint:fix', cwd: path.resolve(__dirname, '../frontend') },
    { name: 'test:frontend', cmd: 'pnpm run test:frontend', cwd: path.resolve(__dirname, '../frontend') },
    { name: 'test:backend', cmd: 'pnpm run test:backend', cwd: path.resolve(__dirname, '../frontend') },
];

for (const step of steps) {
    process.stdout.write(`${step.name.padEnd(14)} ... `);
    try {
        execSync(step.cmd, { cwd: step.cwd, stdio: 'pipe', shell: true });
        console.log('OK ✔');
    } catch (err) {
        console.log('FAILED ✘\n');
        if (err.stdout?.toString()) console.log(err.stdout.toString());
        if (err.stderr?.toString()) console.error(err.stderr.toString());
        process.exit(1);
    }
}

console.log('\nAll checks passed ✔');