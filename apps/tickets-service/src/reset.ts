import { rmSync } from 'node:fs';
import { config } from './config';

for (const suffix of ['', '-wal', '-shm']) rmSync(`${config.dbPath}${suffix}`, { force: true });
console.log('[tickets-service] banco apagado; os dados de exemplo serão recriados no próximo start');
