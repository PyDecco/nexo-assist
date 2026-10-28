import { existsSync } from 'node:fs';
import type { NextConfig } from 'next';

// Um único .env na raiz do monorepo serve aos dois apps.
const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  transpilePackages: ['@nexo/core', '@nexo/agent', '@nexo/tickets-client'],
  serverExternalPackages: ['@mastra/core'],
  poweredByHeader: false,
  agentRules: false,
  allowedDevOrigins: ['127.0.0.1'],
};

export default config;
