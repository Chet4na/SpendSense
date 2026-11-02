/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverComponentsExternalPackages: ['mongodb', 'mysql2', 'bcryptjs'] },
};
export default nextConfig;
