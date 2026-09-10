const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const apiOrigin = process.env.API_INTERNAL_ORIGIN || 'http://127.0.0.1:4000';

export default {
  basePath,
  async rewrites() {
    return [
      {
        source: `${basePath}/api/:path*`,
        destination: `${apiOrigin}/api/:path*`,
        basePath: false,
      },
      {
        source: `${basePath}/temperature/:path*`,
        destination: `${apiOrigin}/temperature/:path*`,
        basePath: false,
      },
    ];
  },
};
