import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Unity WebGL Brotli(.br) 파일에 올바른 헤더를 붙여주는 플러그인
function unityWebGLHeaders() {
  return {
    name: 'unity-webgl-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (url.endsWith('.wasm.br')) {
          res.setHeader('Content-Encoding', 'br');
          res.setHeader('Content-Type', 'application/wasm');
        } else if (url.endsWith('.js.br')) {
          res.setHeader('Content-Encoding', 'br');
          res.setHeader('Content-Type', 'application/javascript');
        } else if (url.endsWith('.data.br')) {
          res.setHeader('Content-Encoding', 'br');
          res.setHeader('Content-Type', 'application/octet-stream');
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    unityWebGLHeaders(),
  ],
})