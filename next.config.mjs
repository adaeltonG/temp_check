export default {
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://127.0.0.1:4000/api/:path*' },
      { source: '/temperature/:path*', destination: 'http://127.0.0.1:4000/temperature/:path*' }
    ];
  }
};
