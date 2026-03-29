/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["sqlite3", "sqlite-async"],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
