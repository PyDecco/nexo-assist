import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@nexo/core', '@nexo/agent', '@nexo/tickets-client'],
  serverExternalPackages: ['@mastra/core'],
  poweredByHeader: false,
};

export default config;
